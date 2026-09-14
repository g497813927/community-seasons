"""Bounded fuzz feedback. PR artifacts are data; only trusted workflow code publishes."""

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

LIMIT = 65536
BOT = "techzjc-bot"
FUZZ_STEP = "Run bounded fuzz tests"
SUITES = {
    "engine": "ENGINE_FUZZ_SEED_OFFSET",
    "economy": "STORE_FUZZ_SEED_OFFSET",
    "engine-properties": "FC_SEED",
    "save-properties": "FC_SAVE_SEED",
    "typed-generators": "FC_TYPED_SEED",
    "renderer": "RENDERER_FUZZ_BASE_SEED",
}
DETAILS = {
    "engine": "work/community-tests/engine-fuzz-failures-*/*.json",
    "economy": "work/community-tests/store-economy-fuzz-failure.json",
    "engine-properties": "work/property-tests/engine-invalid-failure-*.json",
    "save-properties": "work/property-tests/save-invalid-failure-*.json",
    "typed-generators": "work/property-tests/typed-arbitraries-failure-*.json",
    "renderer": "work/renderer-fuzz/repro.json",
}


def require(condition, message="Invalid fuzz feedback data"):
    if not condition:
        raise ValueError(message)


def integer(value, low=0, high=4294967295):
    require(type(value) is int and low <= value <= high)
    return value


def text(value, pattern, maximum=200):
    require(isinstance(value, str) and len(value) <= maximum and re.fullmatch(pattern, value))
    return value


def read_json(data, limit=LIMIT):
    require(len(data) <= limit, "Feedback exceeds size limit")
    return json.loads(data)


def validate_report(report):
    require(isinstance(report, dict) and report.get("version") == 1)
    integer(report["runId"], 1, 2**53 - 1)
    integer(report["runAttempt"], 1, 10000)
    integer(report["masterSeed"])
    integer(report["roundSeed"])
    require(report["roundNumber"] == 1 and report["roundSeed"] == report["masterSeed"])
    hashes = report["sourceHashes"]
    require(isinstance(hashes, dict) and 1 <= len(hashes) <= 500)
    for path, digest in hashes.items():
        text(path, r"[a-zA-Z0-9_./-]+")
        require(not path.startswith("/") and ".." not in path.split("/"))
        text(digest, r"[0-9a-f]{64}")
    rows = report["suites"]
    require(isinstance(rows, list) and 1 <= len(rows) <= len(SUITES))
    require(len({row["name"] for row in rows}) == len(rows))
    for row in rows:
        require(row["name"] in SUITES and row["status"] in ("failed", "time-budget"))
        integer(row["derivedSeed"], -(2**31))
        require(isinstance(row["failures"], list) and len(row["failures"]) <= 20)
        for failure in row["failures"]:
            # Engine traces add a case index to the uint32 offset without
            # wrapping. Preserve that exact seed, including values above 2**32.
            integer(failure["seed"], -(2**31), 2**53 - 1)
            if failure["case"] is not None:
                text(failure["case"], r"[a-z0-9-]+", 100)
            if failure["path"] is not None:
                text(failure["path"], r"[0-9]+(?::[0-9]+)*", 500)
    return report


def collect(root, run_id, attempt):
    """Run without secrets after fuzz fails; retain replay fields, never raw errors."""
    summary = read_json((root / "results/summary.json").read_bytes(), 256 * 1024)
    require(summary["version"] == 2 and summary["mode"] == "quick")
    require(summary["requestedRounds"] == 1 and summary["status"] in ("failed", "time-budget"))
    round_ = summary["latestRound"]
    rows = []
    for suite in round_["suites"]:
        if suite["status"] not in ("failed", "time-budget"):
            continue
        name = suite["name"]
        require(name in SUITES)
        failures = []
        # Fresh CI checkouts contain no tracked failure files. Also exclude any
        # stale local report produced before this run's summary was first written.
        from datetime import datetime
        started = datetime.fromisoformat(summary["startedAt"].replace("Z", "+00:00")).timestamp()
        for path in sorted(root.glob(DETAILS[name]))[:20]:
            if path.is_symlink() or path.stat().st_mtime < started or path.stat().st_size > 1024 * 1024:
                continue
            detail = read_json(path.read_bytes(), 1024 * 1024)
            failures.append({"seed": detail["seed"], "case": detail.get("id", detail.get("name")),
                             "path": detail.get("counterexamplePath", detail.get("path"))})
        rows.append({"name": name, "status": suite["status"],
                     "derivedSeed": int(round_["settings"][SUITES[name]]), "failures": failures})
    return validate_report({"version": 1, "runId": run_id, "runAttempt": attempt,
                            "masterSeed": summary["masterSeed"], "roundSeed": round_["seed"],
                            "roundNumber": round_["number"], "sourceHashes": summary["sourceHashes"],
                            "suites": rows})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, token):
        require(bool(token), "Required GitHub credential is unavailable")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, method="GET", body=None, redirect=False):
        require(path.startswith("/") and not path.startswith("//"))
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "community-seasons-fuzz-feedback"}
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request("https://api.github.com" + path, data, headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                return read_json(response.read(2 * 1024 * 1024 + 1), 2 * 1024 * 1024)
        except urllib.error.HTTPError as error:
            if redirect and error.code == 302:
                return error.headers["Location"]
            # Error bodies and URLs can contain secrets; neither belongs in logs.
            raise ValueError(f"GitHub API request failed (HTTP {error.code})") from None
        except urllib.error.URLError:
            raise ValueError("GitHub API connection failed") from None


def unpack_report(data):
    require(len(data) <= LIMIT, "Feedback archive exceeds size limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = archive.infolist()
        require(len(files) == 1 and files[0].filename == "report.json", "Unexpected feedback archive contents")
        require(files[0].file_size <= LIMIT and not files[0].is_dir())
        # Read the only allowed entry in memory. Never extract paths or execute it.
        return validate_report(read_json(archive.read(files[0])))


def decode_prepared(payload):
    require(isinstance(payload, str) and len(payload) <= 90000)
    result = read_json(base64.b64decode(payload, validate=True))
    format_comment(result)
    return result


def download_report(url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and not parsed.username and not parsed.password and not parsed.port)
    host = parsed.hostname or ""
    require(host.endswith((".blob.core.windows.net", ".actions.githubusercontent.com", ".githubusercontent.com")),
            "Unexpected artifact download host")
    try:
        # Separate, unauthenticated request: never forward the API token to storage.
        with urllib.request.build_opener(NoRedirect).open(url, timeout=20) as response:
            return unpack_report(response.read(LIMIT + 1))
    except (urllib.error.URLError, urllib.error.HTTPError):
        raise ValueError("Feedback artifact download failed") from None


def matching_pr(run, pr, repo_id):
    return (pr.get("state") == "open" and pr.get("base", {}).get("repo", {}).get("id") == repo_id
            and pr.get("head", {}).get("sha") == run["head_sha"]
            and pr.get("head", {}).get("repo", {}).get("id") == run["head_repository"]["id"])


def prepare(api, repo, run_id, attempt, downloader=download_report):
    """All reads use GITHUB_TOKEN; PAT_COMMENTS is absent from this process."""
    text(repo, r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
    prefix = "/repos/" + repo
    run = api.request(f"{prefix}/actions/runs/{run_id}/attempts/{attempt}")
    integer(run["id"], 1, 2**53 - 1)
    text(run["head_sha"], r"[0-9a-f]{40}")
    require(run["id"] == run_id and run["run_attempt"] == attempt)
    require(run["repository"]["full_name"] == repo and run["path"] == ".github/workflows/ci.yml")
    workflow = api.request(prefix + "/actions/workflows/ci.yml")
    require(run["workflow_id"] == workflow["id"])
    if run["event"] != "pull_request" or run["conclusion"] != "failure":
        return None
    jobs = api.request(f"{prefix}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100")
    require(jobs["total_count"] <= 100)
    if not any(job["name"] == "Compile and test" and any(
            step["name"] == FUZZ_STEP and step["conclusion"] == "failure" for step in job["steps"])
               for job in jobs["jobs"]):
        return None
    candidates = run["pull_requests"]
    if not candidates:
        # workflow_run can omit fork PRs. GitHub's commit association supplies
        # candidates; the live PR head and both repository IDs must still match.
        candidates = api.request(f"{prefix}/commits/{run['head_sha']}/pulls?per_page=100")
    require(len(candidates) < 100)
    matches = []
    for candidate in candidates:
        number = integer(candidate["number"], 1, 2**31 - 1)
        pr = api.request(f"{prefix}/pulls/{number}")
        if matching_pr(run, pr, run["repository"]["id"]):
            matches.append(number)
    if len(matches) != 1:
        return None
    artifacts = api.request(f"{prefix}/actions/runs/{run_id}/artifacts?per_page=100")
    require(artifacts["total_count"] <= 100)
    expected = f"fuzz-feedback-{run_id}-{attempt}"
    matches_artifact = [item for item in artifacts["artifacts"] if item["name"] == expected]
    require(len(matches_artifact) == 1, "Expected one fuzz feedback artifact")
    artifact = matches_artifact[0]
    require(not artifact["expired"] and 0 < artifact["size_in_bytes"] <= LIMIT)
    source = artifact["workflow_run"]
    require(source["id"] == run_id and source["repository_id"] == run["repository"]["id"]
            and source["head_repository_id"] == run["head_repository"]["id"]
            and source["head_sha"] == run["head_sha"], "Artifact does not match the triggering run")
    artifact_id = integer(artifact["id"], 1, 2**53 - 1)
    url = api.request(f"{prefix}/actions/artifacts/{artifact_id}/zip", redirect=True)
    report = validate_report(downloader(url))
    require(report["runId"] == run_id and report["runAttempt"] == attempt)
    return {"repo": repo, "pr": matches[0], "head": run["head_sha"], "report": report}


def format_comment(prepared):
    report = validate_report(prepared["report"])
    repo = text(prepared["repo"], r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
    integer(prepared["pr"], 1, 2**31 - 1)
    head = text(prepared["head"], r"[0-9a-f]{40}")
    run_id, attempt = report["runId"], report["runAttempt"]
    marker = f"<!-- community-seasons-fuzz:{head}:{run_id}:{attempt} -->"
    digest = hashlib.sha256(json.dumps(report["sourceHashes"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    lines = [marker, "**Quick fuzz failed / 快速模糊测试失败**", "",
             f"[Build and QA run {run_id}, attempt {attempt}](https://github.com/{repo}/actions/runs/{run_id}/attempts/{attempt}) · commit `{head}`",
             f"Base seed: `{report['masterSeed']}` · round 1 seed: `{report['roundSeed']}`", ""]
    for suite in report["suites"]:
        lines.append(f"- Suite `{suite['name']}`: `{suite['status']}`; derived `{SUITES[suite['name']]}={suite['derivedSeed']}`.")
        for failure in suite["failures"]:
            case = "" if failure["case"] is None else f"; case `{failure['case']}`"
            path = "not available" if failure["path"] is None else f"`{failure['path']}`"
            lines.append(f"  - Failing seed `{failure['seed']}`{case}; shrink path: {path}.")
        if not suite["failures"]:
            lines.append("  - No per-case seed/shrink path was recorded; use the bounded round replay below.")
    lines += ["", f"Reported source hashes: {len(report['sourceHashes'])} files; SHA-256 of the sorted hash map: `{digest}`.",
              "", "Replay on the commit above with Node.js 24.14.1 after `npm run setup`:", "", "```sh",
              f"node run.mjs quick --rounds 1 --seed {report['masterSeed']} --no-tui", "```", "",
              f"Download `qa-failure-{run_id}-{attempt}` from that run for the original logs, counterexamples and source hashes. Preserve those files before rerunning.",
              "原始日志、反例和源码哈希保存在该运行的失败产物中；重新测试前请先保存。"]
    return marker, "\n".join(lines) + "\n"


def publish(api, prepared):
    """PAT use is restricted to identity, comment listing, and own-comment upsert."""
    actor = api.request("/user")
    require(actor.get("login") == BOT, "PAT_COMMENTS must belong to techzjc-bot")
    actor_id = integer(actor["id"], 1, 2**53 - 1)
    marker, body = format_comment(prepared)
    prefix = "/repos/" + prepared["repo"]
    own = []
    for page in range(1, 11):
        comments = api.request(f"{prefix}/issues/{prepared['pr']}/comments?per_page=100&page={page}")
        for comment in comments:
            if (comment["user"]["id"] == actor_id and comment["user"]["login"] == BOT
                    and comment.get("body", "").startswith(marker + "\n")):
                own.append(comment)
        if len(comments) < 100:
            break
    else:
        raise ValueError("Too many comments to safely deduplicate")
    require(len(own) <= 1, "Duplicate bot feedback markers")
    if own:
        if own[0]["body"] == body:
            return "Existing bot comment is current"
        comment_id = integer(own[0]["id"], 1, 2**53 - 1)
        api.request(f"{prefix}/issues/comments/{comment_id}", "PATCH", {"body": body})
        return "Updated own bot comment"
    api.request(f"{prefix}/issues/{prepared['pr']}/comments", "POST", {"body": body})
    return "Created bot comment"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("collect", "prepare", "publish"))
    parser.add_argument("--file")
    args = parser.parse_args()
    require(args.action == "publish" or args.file, "Output file is required")
    destination = Path(args.file) if args.file else None
    if args.action == "collect":
        result = collect(Path.cwd(), int(os.environ["GITHUB_RUN_ID"]), int(os.environ["GITHUB_RUN_ATTEMPT"]))
    elif args.action == "prepare":
        result = prepare(GitHub(os.environ.get("GITHUB_TOKEN")), os.environ["GITHUB_REPOSITORY"],
                         int(os.environ["SOURCE_RUN_ID"]), int(os.environ["SOURCE_RUN_ATTEMPT"]))
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("ready=" + str(result is not None).lower() + "\n")
            if result is not None:
                data = json.dumps(result, sort_keys=True).encode()
                require(len(data) <= LIMIT)
                output.write("payload=" + base64.b64encode(data).decode("ascii") + "\n")
        if result is None:
            print("No current, uniquely associated PR with a failed quick-fuzz step")
            return
    else:
        result = read_json(destination.read_bytes()) if destination else decode_prepared(os.environ["FEEDBACK_PAYLOAD"])
        print(publish(GitHub(os.environ.get("PAT_COMMENTS")), result))
        return
    data = json.dumps(result, sort_keys=True).encode()
    require(len(data) <= LIMIT)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    print("Validated fuzz feedback saved")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not render artifact content, API response text, credentials or URLs.
        print("Fuzz feedback stopped: missing, invalid or unavailable trusted inputs. Check the workflow status before retrying.", file=sys.stderr)
        sys.exit(1)
