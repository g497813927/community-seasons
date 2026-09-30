"""Refresh Dependabot license notices with trusted code and a separate publisher.

The preparation job reads exact-head manifests; generation has no credential and
never runs dependency lifecycle scripts. The publisher accepts only a bounded
five-file artifact and atomically commits the two notice paths to that same head.
"""

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
FILE_LIMIT = 4 * 1024 * 1024
CONTEXT_LIMIT = 16 * 1024
ARCHIVE_LIMIT = 4 * FILE_LIMIT + CONTEXT_LIMIT + 128 * 1024
API_LIMIT = 6 * 1024 * 1024
NOTICE_NAMES = ("open-source-licenses.json", "THIRD-PARTY-NOTICES.txt")
MANIFEST_NAMES = ("package.json", "package-lock.json")
FILE_NAMES = MANIFEST_NAMES + NOTICE_NAMES
BUNDLE_NAMES = frozenset(("context.json",) + FILE_NAMES)
ALLOWED_PATHS = frozenset(
    f"{directory}{name}"
    for directory in ("", "src/", "tests/qa/archive/phone-cart-fix-qa/")
    for name in MANIFEST_NAMES
) | frozenset(f"src/public/{name}" for name in NOTICE_NAMES)
CONTEXT_KEYS = frozenset(("version", "repo", "pr", "head", "branch", "runId", "runAttempt", "repositoryId"))
COMMIT_SUBJECT = "chore: refresh dependency license notices"
INTAKE_WORKFLOW = "dependabot-intake.yml"


class NoticeError(ValueError):
    """A diagnostic containing only messages controlled by this trusted helper."""


def require(condition, message="Invalid Dependabot notice input"):
    if not condition:
        raise NoticeError(message)


def integer(value, maximum=2**53 - 1):
    require(type(value) is int and 1 <= value <= maximum)
    return value


def text(value, pattern, maximum=200):
    require(isinstance(value, str) and len(value) <= maximum and re.fullmatch(pattern, value))
    return value


def read_json(data, limit=FILE_LIMIT):
    require(isinstance(data, bytes) and len(data) <= limit, "Input exceeds size limit")
    return json.loads(data)


def validate_context(context):
    require(isinstance(context, dict) and set(context) == CONTEXT_KEYS and context["version"] == 1)
    text(context["repo"], r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
    text(context["head"], r"[0-9a-f]{40}")
    text(context["branch"], r"dependabot/[A-Za-z0-9_./-]+", 255)
    require(".." not in context["branch"] and "//" not in context["branch"])
    for name in ("pr", "runId", "runAttempt", "repositoryId"):
        integer(context[name])
    return context


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
        headers = {
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "community-seasons-dependabot-notices",
        }
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request("https://api.github.com" + path, data, headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                payload = response.read(API_LIMIT + 1)
                return read_json(payload, API_LIMIT) if payload else None
        except urllib.error.HTTPError as error:
            location = error.headers.get("Location")
            error.close()
            if redirect and error.code in (301, 302, 303, 307, 308):
                require(isinstance(location, str) and location, "Missing artifact download location")
                return location
            # Response bodies and URLs may contain credentials or untrusted text.
            raise NoticeError(f"GitHub API request failed (HTTP {error.code})") from None
        except urllib.error.URLError:
            raise NoticeError("GitHub API connection failed") from None


def source_context(api, repo, run_id, attempt, allow_advanced=False):
    """Resolve a unique live Dependabot PR, independently of notice eligibility."""
    text(repo, r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
    integer(run_id)
    integer(attempt)
    prefix = "/repos/" + repo
    run = api.request(f"{prefix}/actions/runs/{run_id}/attempts/{attempt}")
    require(run["id"] == run_id and run["run_attempt"] == attempt)
    require(run["repository"]["full_name"] == repo and run["path"] == ".github/workflows/" + INTAKE_WORKFLOW)
    workflow = api.request(prefix + "/actions/workflows/" + INTAKE_WORKFLOW)
    require(run["workflow_id"] == workflow["id"], "Source workflow does not match")
    if (run["event"] != "pull_request" or run["status"] != "completed"
            or run["conclusion"] != "success"
            or run.get("actor", {}).get("login") != "dependabot[bot]"
            or run["actor"].get("type") != "Bot"):
        return None
    repository_id = integer(run["repository"]["id"])
    if (run["head_repository"]["id"] != repository_id or run["head_repository"]["full_name"] != repo):
        return None
    head = text(run["head_sha"], r"[0-9a-f]{40}")
    candidates = run["pull_requests"]
    if not candidates:
        candidates = api.request(f"{prefix}/commits/{head}/pulls?per_page=100")
    require(isinstance(candidates, list) and len(candidates) < 100, "PR association may be incomplete")
    require(len({row["number"] for row in candidates}) == len(candidates))
    matches = []
    for candidate in candidates:
        number = integer(candidate["number"])
        pr = api.request(f"{prefix}/pulls/{number}")
        if (pr.get("state") == "open" and pr.get("user", {}).get("login") == "dependabot[bot]"
                and pr["user"].get("type") == "Bot" and pr.get("base", {}).get("ref") == "main"
                and all(pr[side].get("repo") and pr[side]["repo"].get("id") == repository_id
                        and pr[side]["repo"].get("full_name") == repo for side in ("head", "base"))
                and (allow_advanced or pr["head"].get("sha") == head) and pr["head"].get("ref") == run["head_branch"]
                and pr["head"]["ref"].startswith("dependabot/")):
            matches.append(pr)
    if len(matches) != 1:
        return None
    pr = matches[0]
    return validate_context({
        "version": 1, "repo": repo, "pr": pr["number"], "head": head,
        "branch": pr["head"]["ref"], "runId": run_id, "runAttempt": attempt,
        "repositoryId": repository_id,
    })


def eligible_context(api, repo, run_id, attempt, allow_advanced=False):
    """Only narrowly allowed, complete dependency diffs may generate or publish."""
    context = source_context(api, repo, run_id, attempt, allow_advanced)
    if context is None:
        return None
    prefix = "/repos/" + repo
    pr = api.request(f"{prefix}/pulls/{context['pr']}")
    if not matching_live_pr(pr, context, pr.get("head", {}).get("sha") if allow_advanced else context["head"]):
        return None
    count = integer(pr["changed_files"], 100)
    files = api.request(f"{prefix}/pulls/{pr['number']}/files?per_page=100")
    require(isinstance(files, list) and len(files) == count, "PR file list is incomplete")
    require(len({row["filename"] for row in files}) == count)
    if (not any(row["filename"] == "src/package-lock.json" for row in files)
            or any(row["filename"] not in ALLOWED_PATHS or row["status"] != "modified" for row in files)):
        return None
    return context


def read_head_files(api, context):
    """Read fixed paths at an immutable commit, never the PR checkout or its code."""
    context = validate_context(context)
    prefix = "/repos/" + context["repo"]
    result = {}
    for name in FILE_NAMES:
        path = "src/" + ("public/" if name in NOTICE_NAMES else "") + name
        item = api.request(f"{prefix}/contents/{path}?ref={context['head']}")
        require(item["type"] == "file" and type(item["size"]) is int and 0 < item["size"] <= FILE_LIMIT)
        size = item["size"]
        if item["encoding"] == "none":
            blob = text(item["sha"], r"[0-9a-f]{40}")
            item = api.request(f"{prefix}/git/blobs/{blob}")
            require(item["size"] == size)
        require(item["encoding"] == "base64" and isinstance(item["content"], str))
        require(len(item["content"]) <= API_LIMIT)
        data = base64.b64decode("".join(item["content"].split()), validate=True)
        require(len(data) == size and len(data) <= FILE_LIMIT)
        result[name] = data
    return result


def clean_environment():
    """Subprocesses receive tooling paths, never the API credential or npm auth."""
    result = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL") if key in os.environ}
    result.update({"CI": "true", "npm_config_ignore_scripts": "true", "npm_config_audit": "false", "npm_config_fund": "false"})
    return result


def run_checked(command, timeout=120, phase="License validation"):
    # Suppress package-controlled text and workflow-command injection in CI logs.
    with tempfile.TemporaryDirectory(prefix="dependabot-tool-config-") as temporary:
        environment = clean_environment()
        # npm rejects loading one path as both user and global configuration.
        for kind in ("user", "global"):
            config = Path(temporary) / (kind + ".npmrc")
            config.write_text("", encoding="utf-8")
            environment[f"npm_config_{kind}config"] = str(config)
        try:
            result = subprocess.run(command, env=environment, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            raise NoticeError(phase + " timed out") from None
    require(result.returncode == 0, phase + " failed; review dependency installation and original license notices")


def validate_notices(files):
    """Check completeness and provenance with the trusted platform-neutral checker."""
    require(all(name in files and isinstance(files[name], bytes) and len(files[name]) <= FILE_LIMIT for name in FILE_NAMES))
    inventory = read_json(files[NOTICE_NAMES[0]])
    require(isinstance(inventory, dict) and inventory.get("schemaVersion") == 1 and inventory.get("issues") == [])
    require(inventory.get("generatedFromLockfile") == "sha256:" + hashlib.sha256(files["package-lock.json"]).hexdigest(),
            "License inventory provenance does not match")
    require(isinstance(inventory.get("packages"), list) and isinstance(inventory.get("omittedOptionalPackages"), list))
    for package in inventory["packages"]:
        require(package.get("status") == "complete" and isinstance(package.get("license"), str)
                and package["license"] not in ("", "UNKNOWN") and isinstance(package.get("notices"), list)
                and package["notices"] and all(isinstance(notice.get("text"), str) and notice["text"].strip()
                                               for notice in package["notices"]))
    with tempfile.TemporaryDirectory(prefix="dependabot-notice-check-") as temporary:
        root = Path(temporary)
        (root / "public").mkdir()
        for name in FILE_NAMES:
            (root / ("public" if name in NOTICE_NAMES else "") / name).write_bytes(files[name])
        run_checked([
            "node", "--input-type=module", "--eval",
            "const {checkCommittedNotices} = await import(process.argv[1]); checkCommittedNotices(process.argv[2]);",
            (ROOT / "scripts/check-committed-notices.mjs").as_uri(), str(root),
        ])


def prepare(api, repo, run_id, attempt, directory, validator=validate_notices):
    context = eligible_context(api, repo, run_id, attempt)
    if context is None:
        return False
    files = read_head_files(api, context)
    try:
        validator(files)
    except (ValueError, KeyError, TypeError):
        pass  # Stale notices are the only reason to prepare a fresh installation.
    else:
        return False
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    app = directory / "app"
    app.mkdir()
    for name in MANIFEST_NAMES:
        (app / name).write_bytes(files[name])
    (directory / "context.json").write_bytes(json.dumps(context, sort_keys=True).encode())
    return True


def generate(directory):
    directory = Path(directory).resolve()
    context = validate_context(read_json((directory / "context.json").read_bytes(), CONTEXT_LIMIT))
    app = directory / "app"
    require(set(path.name for path in app.iterdir()) == set(MANIFEST_NAMES), "Generation requires a clean manifest-only directory")
    original = {name: (app / name).read_bytes() for name in MANIFEST_NAMES}
    require(all(len(data) <= FILE_LIMIT for data in original.values()))
    run_checked(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", str(app),
                 "--cache", str(directory / "npm-cache")], timeout=600, phase="Dependency installation")
    for mode in ("--write", "--check"):
        run_checked(["node", str(ROOT / "src/scripts/licenses.mjs"), "--root", str(app), mode], timeout=180,
                    phase="License inventory generation" if mode == "--write" else "Generated license inventory verification")
    files = {name: (app / ("public" if name in NOTICE_NAMES else "") / name).read_bytes() for name in FILE_NAMES}
    require(all(files[name] == original[name] for name in MANIFEST_NAMES), "Installation changed the manifests")
    validate_notices(files)
    bundle = directory / "bundle"
    bundle.mkdir()
    for name, content in files.items():
        (bundle / name).write_bytes(content)
    (bundle / "context.json").write_bytes(json.dumps(context, sort_keys=True).encode())


def unpack_bundle(data):
    require(isinstance(data, bytes) and len(data) <= ARCHIVE_LIMIT, "Notice archive exceeds size limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        require(len(entries) == len(BUNDLE_NAMES) and {entry.filename for entry in entries} == BUNDLE_NAMES,
                "Unexpected notice archive contents")
        result = {}
        for entry in entries:
            limit = CONTEXT_LIMIT if entry.filename == "context.json" else FILE_LIMIT
            require(not entry.is_dir() and 0 < entry.file_size <= limit and not entry.flag_bits & 1)
            with archive.open(entry) as source:
                content = source.read(limit + 1)
            require(len(content) == entry.file_size and len(content) <= limit)
            result[entry.filename] = content
        validate_context(read_json(result["context.json"], CONTEXT_LIMIT))
        return result


def download_bundle(url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and not parsed.username and not parsed.password and not parsed.port)
    require((parsed.hostname or "").endswith((".blob.core.windows.net", ".actions.githubusercontent.com", ".githubusercontent.com")),
            "Unexpected artifact download host")
    try:
        # Storage download is a separate request with no Authorization header.
        with urllib.request.build_opener(NoRedirect).open(url, timeout=30) as response:
            return unpack_bundle(response.read(ARCHIVE_LIMIT + 1))
    except (urllib.error.URLError, urllib.error.HTTPError):
        raise NoticeError("Notice artifact download failed") from None


def commit_body(context):
    # Dependabot may replace this generated-only commit when rebasing/updating.
    # This marker preserves future bot updates without suppressing CI.
    return (f"Dependabot notice source: {context['runId']}/{context['runAttempt']}\n"
            f"Expected parent: {context['head']}\n\n[dependabot skip]")


def matching_live_pr(pr, context, head):
    return (pr.get("state") == "open" and pr.get("user", {}).get("login") == "dependabot[bot]"
            and pr["user"].get("type") == "Bot" and pr.get("base", {}).get("ref") == "main"
            and pr.get("head", {}).get("sha") == head and pr["head"].get("ref") == context["branch"]
            and all(pr.get(side, {}).get("repo")
                    and pr[side]["repo"].get("id") == context["repositoryId"]
                    and pr[side]["repo"].get("full_name") == context["repo"] for side in ("head", "base")))


def is_generated_successor(api, context, head, files=None):
    """Only this source's exact bot-generated, notice-only child may be reused."""
    text(head, r"[0-9a-f]{40}")
    commit = api.request(f"/repos/{context['repo']}/commits/{head}")
    if (commit.get("sha") != head or commit.get("author", {}).get("login") != "github-actions[bot]"
            or commit["author"].get("type") != "Bot"
            or [parent.get("sha") for parent in commit.get("parents", [])] != [context["head"]]
            or commit.get("commit", {}).get("message", "").rstrip("\n") != COMMIT_SUBJECT + "\n\n" + commit_body(context)):
        return False
    changed = commit.get("files", [])
    if (not 1 <= len(changed) <= len(NOTICE_NAMES)
            or not {row.get("filename") for row in changed} <= {"src/public/" + name for name in NOTICE_NAMES}
            or any(row.get("status") != "modified" for row in changed)):
        return False
    if files is not None:
        successor = read_head_files(api, dict(context, head=head))
        return all(successor[name] == files[name] for name in FILE_NAMES)
    return True


def branch_head(api, context):
    """Read the actual Git ref; the pull-request REST view can lag a new commit."""
    ref = api.request(f"/repos/{context['repo']}/git/ref/heads/{context['branch']}")
    require(ref.get("ref") == "refs/heads/" + context["branch"] and ref.get("object", {}).get("type") == "commit",
            "Unexpected Dependabot branch ref")
    return text(ref["object"]["sha"], r"[0-9a-f]{40}")


def dispatch_ci(api, repo, run_id, attempt, validator=validate_notices):
    """Dispatch independently of regeneration, only at the source or its verified successor."""
    context = source_context(api, repo, run_id, attempt, allow_advanced=True)
    if context is None:
        return "Skipped CI dispatch: the intake no longer identifies a current Dependabot PR"
    prefix = "/repos/" + context["repo"]
    head = branch_head(api, context)
    if head != context["head"]:
        if not is_generated_successor(api, context, head):
            return "Skipped CI dispatch: the branch advanced beyond this dependency update"
        files = read_head_files(api, dict(context, head=head))
        original = read_head_files(api, context)
        require(all(files[name] == original[name] for name in MANIFEST_NAMES), "Successor changed the dependency manifests")
        validator(files)
    pr = api.request(f"{prefix}/pulls/{context['pr']}")
    # Validate PR identity/open state without relying on its eventually consistent SHA.
    if not matching_live_pr(pr, context, pr.get("head", {}).get("sha")) or branch_head(api, context) != head:
        return "Skipped CI dispatch: the PR changed or closed"
    # GITHUB_TOKEN PR updates can require workflow approval. An explicit
    # workflow_dispatch runs automatically and supports older PR branches.
    api.request(f"{prefix}/actions/workflows/ci.yml/dispatches", "POST", {"ref": context["branch"]})
    return "Dispatched Build and QA for the validated current Dependabot branch"


def publish(api, repo, run_id, attempt, publisher_run_id, directory, downloader=download_bundle, validator=validate_notices):
    """Validate an artifact again and compare-and-swap only the two notice files."""
    context = eligible_context(api, repo, run_id, attempt, allow_advanced=True)
    if context is None:
        return "Skipped: the source run no longer identifies an eligible current PR head"
    integer(publisher_run_id)
    prefix = "/repos/" + repo
    listing = api.request(f"{prefix}/actions/runs/{publisher_run_id}/artifacts?per_page=100")
    require(type(listing["total_count"]) is int and 0 <= listing["total_count"] <= 100
            and len(listing["artifacts"]) == listing["total_count"], "Artifact listing is incomplete")
    name = f"dependabot-notices-{run_id}-{attempt}"
    matches = [item for item in listing["artifacts"] if item["name"] == name]
    require(len(matches) == 1, "Expected one notice artifact")
    artifact = matches[0]
    require(not artifact["expired"] and 0 < artifact["size_in_bytes"] <= ARCHIVE_LIMIT)
    source = artifact["workflow_run"]
    require(source["id"] == publisher_run_id and source["repository_id"] == context["repositoryId"]
            and source["head_repository_id"] == context["repositoryId"], "Artifact is not from this trusted workflow")
    artifact_id = integer(artifact["id"])
    files = downloader(api.request(f"{prefix}/actions/artifacts/{artifact_id}/zip", redirect=True))
    require(set(files) == BUNDLE_NAMES)
    require(validate_context(read_json(files["context.json"], CONTEXT_LIMIT)) == context, "Artifact context does not match the current source")
    current = read_head_files(api, context)
    require(all(files[name] == current[name] for name in MANIFEST_NAMES), "Artifact manifests differ from the PR head")
    validator(files)
    pr = api.request(f"{prefix}/pulls/{context['pr']}")
    live_head = pr.get("head", {}).get("sha")
    if not matching_live_pr(pr, context, live_head):
        return "Skipped: the PR is no longer eligible"
    if live_head != context["head"]:
        if is_generated_successor(api, context, live_head, files):
            return "Reused the verified notice commit; the isolated dispatcher will run CI"
        return "Skipped: the PR head advanced beyond the prepared dependency update"
    if all(files[name] == current[name] for name in NOTICE_NAMES):
        return "Skipped: both committed notice files are already current"
    # A concurrent push is rejected atomically by expectedHeadOid. No checkout,
    # package code, git hooks, artifact paths, or author metadata is executed.
    response = api.request("/graphql", "POST", {
        "query": "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
        "variables": {"input": {
            "branch": {"repositoryNameWithOwner": repo, "branchName": context["branch"]},
            "expectedHeadOid": context["head"],
            "message": {"headline": COMMIT_SUBJECT, "body": commit_body(context)},
            "fileChanges": {"additions": [
                {"path": "src/public/" + name, "contents": base64.b64encode(files[name]).decode("ascii")}
                for name in NOTICE_NAMES
            ]},
        }},
    })
    require(isinstance(response, dict) and not response.get("errors"), "Atomic notice commit was rejected")
    oid = text(response["data"]["createCommitOnBranch"]["commit"]["oid"], r"[0-9a-f]{40}")
    return "Committed both notice files as github-actions[bot] at " + oid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "generate", "publish", "dispatch"))
    parser.add_argument("--directory", type=Path)
    args = parser.parse_args()
    if args.action != "dispatch" and args.directory is None:
        parser.error("--directory is required for preparation, generation and publication")
    if args.action == "generate":
        generate(args.directory)
        print("Generated and validated the two license notice files")
        return
    api = GitHub(os.environ.get("GITHUB_TOKEN"))
    common = (api, os.environ["GITHUB_REPOSITORY"], int(os.environ["SOURCE_RUN_ID"]), int(os.environ["SOURCE_RUN_ATTEMPT"]))
    if args.action == "prepare":
        ready = prepare(*common, args.directory)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("ready=" + str(ready).lower() + "\n")
        print("Prepared an eligible Dependabot dependency update" if ready else "Skipped: no eligible current PR needs notice regeneration")
    elif args.action == "publish":
        print(publish(*common, int(os.environ["GITHUB_RUN_ID"]), args.directory))
    else:
        print(dispatch_ci(*common))


if __name__ == "__main__":
    try:
        main()
    except NoticeError as error:
        print("Dependabot notice refresh stopped: " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Dependabot notice refresh stopped: invalid, stale or unavailable inputs. Check the workflow status before retrying.", file=sys.stderr)
        sys.exit(1)
