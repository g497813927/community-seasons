import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
import warnings
import zipfile

from dependabot_notices import (
    ARCHIVE_LIMIT, BUNDLE_NAMES, FILE_LIMIT, GitHub, dispatch_ci, eligible_context, generate, prepare, publish,
    unpack_bundle, validate_notices,
)


REPO = "owner/game"
PREFIX = "/repos/" + REPO
HEAD = "a" * 40
NEW_HEAD = "b" * 40
BRANCH = "dependabot/npm_and_yarn/example-2"
PR_PATH = PREFIX + "/pulls/7"
FILES_PATH = PR_PATH + "/files?per_page=100"
ARTIFACTS_PATH = PREFIX + "/actions/runs/52/artifacts?per_page=100"
REF_PATH = PREFIX + "/git/ref/heads/" + BRANCH
DISPATCH_PATH = PREFIX + "/actions/workflows/ci.yml/dispatches"
NOTICE_NAMES = ("open-source-licenses.json", "THIRD-PARTY-NOTICES.txt")


def context():
    return {"version": 1, "repo": REPO, "pr": 7, "head": HEAD,
            "branch": BRANCH, "runId": 42, "runAttempt": 1, "repositoryId": 1}


def files():
    lock = b'{"lockfileVersion":3,"packages":{"":{}}}\n'
    digest = "sha256:" + hashlib.sha256(lock).hexdigest()
    inventory = {"schemaVersion": 1, "generatedFromLockfile": digest,
                 "description": "Fixture dependencies.", "packages": [],
                 "omittedOptionalPackages": [], "issues": []}
    notices = "THIRD-PARTY NOTICES\n\nFixture dependencies.\n\nLockfile: " + digest + "\nPackages: 0\n\n"
    return {"package.json": b'{}\n', "package-lock.json": lock,
            "open-source-licenses.json": json.dumps(inventory).encode(),
            "THIRD-PARTY-NOTICES.txt": notices.encode()}


def bundle():
    return {**files(), "context.json": json.dumps(context()).encode()}


def archive(entries):
    output = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zipped:
            for name, data in entries:
                zipped.writestr(name, data)
    return output.getvalue()


class FakeAPI:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []
        self.dispatch_failures = 0

    def request(self, path, method="GET", body=None, redirect=False):
        self.calls.append((path, method, copy.deepcopy(body)))
        if method == "POST" and path == "/graphql":
            payload = body["variables"]["input"]
            if payload["expectedHeadOid"] != self.responses[PR_PATH]["head"]["sha"]:
                return {"errors": [{"message": "Expected head no longer matches"}]}
            self.responses[PR_PATH]["head"]["sha"] = NEW_HEAD
            self.responses[REF_PATH]["object"]["sha"] = NEW_HEAD
            additions = payload["fileChanges"]["additions"]
            self.responses[PREFIX + "/commits/" + NEW_HEAD] = {
                "sha": NEW_HEAD, "author": {"login": "github-actions[bot]", "type": "Bot"},
                "parents": [{"sha": HEAD}],
                "commit": {"message": payload["message"]["headline"] + "\n\n" + payload["message"]["body"]},
                "files": [{"filename": item["path"], "status": "modified"} for item in additions],
            }
            for old_path, response in list(self.responses.items()):
                if "/contents/" in old_path and old_path.endswith("?ref=" + HEAD):
                    self.responses[old_path[:-40] + NEW_HEAD] = copy.deepcopy(response)
            for item in additions:
                self.responses[PREFIX + "/contents/" + item["path"] + "?ref=" + NEW_HEAD] = {
                    "type": "file", "size": len(base64.b64decode(item["contents"])),
                    "encoding": "base64", "content": item["contents"],
                }
            return {"data": {"createCommitOnBranch": {"commit": {"oid": NEW_HEAD}}}}
        if method == "POST":
            if self.dispatch_failures:
                self.dispatch_failures -= 1
                raise ValueError("GitHub API request failed (HTTP 503)")
            return {}
        response = self.responses[path]
        return response() if callable(response) else copy.deepcopy(response)

    def mutations(self):
        return [(path, body) for path, method, body in self.calls if method != "GET"]


def api_fixture(aligned=False):
    repository = {"id": 1, "full_name": REPO}
    responses = {
        PREFIX + "/actions/runs/42/attempts/1": {
            "id": 42, "run_attempt": 1, "head_sha": HEAD, "head_branch": BRANCH,
            "path": ".github/workflows/dependabot-intake.yml", "workflow_id": 11,
            "repository": repository, "head_repository": repository,
            "event": "pull_request", "status": "completed", "conclusion": "success",
            "actor": {"login": "dependabot[bot]", "type": "Bot"},
            "pull_requests": [{"number": 7}],
        },
        PREFIX + "/actions/workflows/dependabot-intake.yml": {"id": 11},
        REF_PATH: {"ref": "refs/heads/" + BRANCH, "object": {"type": "commit", "sha": HEAD}},
        PR_PATH: {"number": 7, "state": "open", "changed_files": 2,
                  "user": {"login": "dependabot[bot]", "type": "Bot"},
                  "base": {"repo": repository, "ref": "main"},
                  "head": {"sha": HEAD, "ref": BRANCH, "repo": repository}},
        FILES_PATH: [{"filename": "src/package.json", "status": "modified"},
                     {"filename": "src/package-lock.json", "status": "modified"}],
        PREFIX + "/commits/" + HEAD + "/pulls?per_page=100": [{"number": 7}],
        ARTIFACTS_PATH: {"total_count": 1, "artifacts": [{
            "id": 5, "name": "dependabot-notices-42-1", "expired": False, "size_in_bytes": 1000,
            "workflow_run": {"id": 52, "repository_id": 1, "head_repository_id": 1},
        }]},
        PREFIX + "/actions/artifacts/5/zip": "https://fixture.blob.core.windows.net/notices",
    }
    for name, data in files().items():
        if name in NOTICE_NAMES and not aligned:
            data = b"old committed notice\n"
        path = "src/" + ("public/" if name in NOTICE_NAMES else "") + name
        responses[PREFIX + "/contents/" + path + "?ref=" + HEAD] = {
            "type": "file", "size": len(data), "encoding": "base64",
            "content": base64.b64encode(data).decode(),
        }
    return FakeAPI(responses)


class DependabotNoticesTests(unittest.TestCase):
    def publish(self, api, data=None, validator=lambda _: None):
        with tempfile.TemporaryDirectory() as directory:
            return publish(api, REPO, 42, 1, 52, Path(directory),
                           downloader=lambda _: bundle() if data is None else data,
                           validator=validator)

    def test_current_same_repository_dependabot_dependency_update_is_eligible(self):
        api = api_fixture()
        self.assertEqual(eligible_context(api, REPO, 42, 1), context())
        self.assertEqual(api.mutations(), [])

    def test_unrelated_or_stale_pull_requests_never_reach_artifact_download(self):
        mutations = [
            lambda pr: pr["user"].update(login="contributor"),
            lambda pr: pr["user"].update(type="User"),
            lambda pr: pr["head"].update(repo={"id": 2, "full_name": "other/game"}),
            lambda pr: pr.update(state="closed"),
            lambda pr: pr["head"].update(sha=NEW_HEAD),
            lambda pr: pr["base"].update(repo={"id": 2, "full_name": "other/game"}),
        ]
        for change in mutations:
            api = api_fixture()
            change(api.responses[PR_PATH])
            with self.subTest(change=change):
                self.assertIsNone(eligible_context(api, REPO, 42, 1))
                self.assertFalse(any("artifacts" in path for path, _, _ in api.calls))
                self.assertEqual(api.mutations(), [])

    def test_only_dependency_and_generated_notice_changes_are_eligible(self):
        for disallowed in ["src/lib/game/engine.ts", ".github/workflows/ci.yml", "src/video/package-lock.json"]:
            api = api_fixture()
            api.responses[FILES_PATH].append({"filename": disallowed, "status": "modified"})
            api.responses[PR_PATH]["changed_files"] = 3
            with self.subTest(path=disallowed):
                self.assertIsNone(eligible_context(api, REPO, 42, 1))
        api = api_fixture()
        api.responses[FILES_PATH] = [{"filename": "src/package.json", "status": "modified"}]
        api.responses[PR_PATH]["changed_files"] = 1
        self.assertIsNone(eligible_context(api, REPO, 42, 1))

    def test_incomplete_changed_file_listing_cannot_hide_source_edits(self):
        api = api_fixture()
        api.responses[PR_PATH]["changed_files"] = 3
        with self.assertRaises(ValueError):
            eligible_context(api, REPO, 42, 1)
        api = api_fixture()
        api.responses[PR_PATH]["changed_files"] = 101
        with self.assertRaises(ValueError):
            eligible_context(api, REPO, 42, 1)

    def test_archive_accepts_only_the_exact_bounded_file_set(self):
        data = bundle()
        self.assertEqual(unpack_bundle(archive(data.items())), data)
        invalid = [list(data.items())[:-1],
                   list(data.items()) + [("run.sh", b"echo unsafe")],
                   list(data.items()) + [("context.json", data["context.json"])],
                   [("../" + name, value) for name, value in data.items()],
                   [(name, b"x" * (FILE_LIMIT + 1) if name == "package-lock.json" else value)
                    for name, value in data.items()]]
        for entries in invalid:
            with self.subTest(names=[name for name, _ in entries]), self.assertRaises(ValueError):
                unpack_bundle(archive(entries))
        with self.assertRaises(ValueError):
            unpack_bundle(b"x" * (ARCHIVE_LIMIT + 1))

    def test_notice_validation_binds_inventory_to_lockfile_and_text(self):
        validate_notices(files())
        for name in ("package-lock.json", "THIRD-PARTY-NOTICES.txt"):
            invalid = files()
            invalid[name] += b"\n"
            with self.subTest(file=name), self.assertRaises(ValueError):
                validate_notices(invalid)

    def test_generation_disables_lifecycle_scripts_and_keeps_manifests_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            app = root / "app"
            app.mkdir()
            scripts = {name: 'node -e "require(\'fs\').writeFileSync(\'' + name + '.ran\', \'unsafe\')"'
                       for name in ("preinstall", "install", "postinstall")}
            manifests = {
                "package.json": json.dumps({"name": "notice-test", "version": "1.0.0", "scripts": scripts}).encode(),
                "package-lock.json": json.dumps({"name": "notice-test", "version": "1.0.0", "lockfileVersion": 3,
                                                   "packages": {"": {"name": "notice-test", "version": "1.0.0"}}}).encode(),
            }
            for name, data in manifests.items():
                (app / name).write_bytes(data)
            (root / "context.json").write_text(json.dumps(context()))
            generate(root)
            self.assertEqual({path.name for path in (root / "bundle").iterdir()}, BUNDLE_NAMES)
            for name, data in manifests.items():
                self.assertEqual((app / name).read_bytes(), data)
                self.assertEqual((root / "bundle" / name).read_bytes(), data)
            self.assertFalse(list(app.glob("*.ran")))
            validate_notices({name: (root / "bundle" / name).read_bytes() for name in files()})

    def test_publication_rejects_another_run_or_changed_manifest(self):
        for key, value in [("runAttempt", 2), ("head", NEW_HEAD), ("repo", "other/game")]:
            api, data = api_fixture(), bundle()
            invalid = context()
            invalid[key] = value
            data["context.json"] = json.dumps(invalid).encode()
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.publish(api, data)
            self.assertEqual(api.mutations(), [])
        api, data = api_fixture(), bundle()
        data["package-lock.json"] += b"\n"
        with self.assertRaises(ValueError):
            self.publish(api, data)
        self.assertEqual(api.mutations(), [])

    def test_artifact_listing_and_origin_must_match_before_download(self):
        changes = [
            lambda listing: listing.update(total_count=2),
            lambda listing: listing["artifacts"][0].update(expired=True),
            lambda listing: listing["artifacts"][0].update(size_in_bytes=ARCHIVE_LIMIT + 1),
            lambda listing: listing["artifacts"][0]["workflow_run"].update(id=99),
            lambda listing: listing["artifacts"][0]["workflow_run"].update(head_repository_id=2),
        ]
        for change in changes:
            api = api_fixture()
            change(api.responses[ARTIFACTS_PATH])
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    publish(api, REPO, 42, 1, 52, Path(directory),
                            downloader=lambda _: self.fail("Downloaded an unverified artifact"),
                            validator=lambda _: None)
            self.assertEqual(api.mutations(), [])

    def test_invalid_generated_notices_never_reach_commit(self):
        api, data = api_fixture(), bundle()
        data["THIRD-PARTY-NOTICES.txt"] += b"unmatched text\n"
        with self.assertRaises(ValueError):
            self.publish(api, data, validator=validate_notices)
        self.assertEqual(api.mutations(), [])

    def test_publisher_commits_only_notices_atomically_and_dispatch_is_isolated(self):
        api = api_fixture()
        self.publish(api)
        mutations = api.mutations()
        self.assertEqual([path for path, _ in mutations], ["/graphql"])
        payload = mutations[0][1]["variables"]["input"]
        self.assertEqual(payload["expectedHeadOid"], HEAD)
        self.assertEqual(payload["branch"], {"repositoryNameWithOwner": REPO, "branchName": BRANCH})
        additions = payload["fileChanges"]["additions"]
        self.assertEqual({item["path"] for item in additions}, {"src/public/" + name for name in NOTICE_NAMES})
        self.assertEqual(len(additions), 2)
        self.assertFalse(payload["fileChanges"].get("deletions"))
        for item in additions:
            self.assertEqual(base64.b64decode(item["contents"]), files()[item["path"].split("/")[-1]])
        dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.mutations()[1], (DISPATCH_PATH, {"ref": BRANCH}))

    def test_aligned_notices_skip_generation_and_commit_but_still_dispatch(self):
        api = api_fixture(aligned=True)
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(prepare(api, REPO, 42, 1, Path(directory)))
        self.publish(api)
        self.assertEqual(api.mutations(), [])
        dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.mutations(), [(DISPATCH_PATH, {"ref": BRANCH})])

    def test_head_moving_during_download_is_not_overwritten_or_dispatched(self):
        api = api_fixture()
        def moving_download(_):
            api.responses[PR_PATH]["head"]["sha"] = NEW_HEAD
            api.responses[PREFIX + "/commits/" + NEW_HEAD] = {
                "sha": NEW_HEAD, "author": {"login": "contributor", "type": "User"},
            }
            return bundle()
        with tempfile.TemporaryDirectory() as directory:
            publish(api, REPO, 42, 1, 52, Path(directory),
                    downloader=moving_download, validator=lambda _: None)
        self.assertEqual(api.responses[PR_PATH]["head"]["sha"], NEW_HEAD)
        self.assertEqual(api.mutations(), [])

    def test_atomic_commit_rejects_head_moving_after_final_read(self):
        api = api_fixture()
        request = api.request
        def move_before_commit(path, method="GET", body=None, redirect=False):
            if path == "/graphql":
                api.responses[PR_PATH]["head"]["sha"] = NEW_HEAD
            return request(path, method, body, redirect)
        api.request = move_before_commit
        with self.assertRaisesRegex(ValueError, "Atomic notice commit was rejected"):
            self.publish(api)
        self.assertEqual(api.responses[PR_PATH]["head"]["sha"], NEW_HEAD)
        self.assertEqual([path for path, _ in api.mutations()], ["/graphql"])

    def test_dispatch_failure_can_retry_without_duplicate_commit(self):
        api = api_fixture()
        self.publish(api)
        api.dispatch_failures = 1
        with self.assertRaisesRegex(ValueError, "503"):
            dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.responses[PR_PATH]["head"]["sha"], NEW_HEAD)
        api.calls.clear()
        self.publish(api)
        dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.mutations(), [(DISPATCH_PATH, {"ref": BRANCH})])

    def test_retry_rejects_a_commit_with_unrelated_changes_or_different_notice_bytes(self):
        for tamper in ("source", "notice"):
            api = api_fixture()
            self.publish(api)
            if tamper == "source":
                api.responses[PREFIX + "/commits/" + NEW_HEAD]["files"].append({
                    "filename": "src/lib/game/engine.ts", "status": "modified",
                })
            else:
                response = api.responses[PREFIX + "/contents/src/public/THIRD-PARTY-NOTICES.txt?ref=" + NEW_HEAD]
                response.update(size=7, content=base64.b64encode(b"changed").decode())
            api.calls.clear()
            with self.subTest(tamper=tamper):
                self.publish(api)
                self.assertEqual(api.mutations(), [])

    def test_dispatch_rejects_other_workflows_and_unsuccessful_intakes(self):
        for key, value in (("path", ".github/workflows/ci.yml"), ("workflow_id", 99)):
            api = api_fixture()
            api.responses[PREFIX + "/actions/runs/42/attempts/1"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                dispatch_ci(api, REPO, 42, 1)
            self.assertEqual(api.mutations(), [])
        for conclusion in ("failure", "cancelled", "skipped", None):
            api = api_fixture()
            api.responses[PREFIX + "/actions/runs/42/attempts/1"]["conclusion"] = conclusion
            with self.subTest(conclusion=conclusion):
                self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_only_dependabot_originated_pull_request_intakes_are_accepted(self):
        for event, actor in (("workflow_dispatch", "dependabot[bot]"),
                             ("pull_request", "github-actions[bot]"),
                             ("pull_request", "contributor")):
            api = api_fixture()
            run = api.responses[PREFIX + "/actions/runs/42/attempts/1"]
            run.update(event=event)
            run["actor"]["login"] = actor
            with self.subTest(event=event, actor=actor):
                self.assertIsNone(eligible_context(api, REPO, 42, 1))
                self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_non_game_and_disallowed_notice_diffs_still_receive_normal_ci(self):
        for path in ("package-lock.json", "tests/qa/archive/phone-cart-fix-qa/package-lock.json",
                     ".github/workflows/ci.yml", "src/lib/game/engine.ts"):
            api = api_fixture()
            api.responses[FILES_PATH] = [{"filename": path, "status": "modified"}]
            api.responses[PR_PATH]["changed_files"] = 1
            with self.subTest(path=path), tempfile.TemporaryDirectory() as directory:
                self.assertFalse(prepare(api, REPO, 42, 1, Path(directory)))
                dispatch_ci(api, REPO, 42, 1)
                self.assertEqual(api.mutations(), [(DISPATCH_PATH, {"ref": BRANCH})])
                self.assertFalse(any("artifacts" in name for name, _, _ in api.calls))

    def test_generation_failure_can_still_dispatch_the_original_head(self):
        api = api_fixture()
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(prepare(api, REPO, 42, 1, Path(directory)))
        # No bundle or commit was produced; full CI can explain the failure.
        dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.mutations(), [(DISPATCH_PATH, {"ref": BRANCH})])

    def test_dispatch_uses_git_ref_when_pr_rest_head_lags_the_notice_commit(self):
        api = api_fixture()
        self.publish(api)
        api.responses[PR_PATH]["head"]["sha"] = HEAD
        api.calls.clear()
        dispatch_ci(api, REPO, 42, 1)
        self.assertEqual(api.mutations(), [(DISPATCH_PATH, {"ref": BRANCH})])
        self.assertEqual(len([path for path, _, _ in api.calls if path == REF_PATH]), 2)

    def test_dispatch_rejects_unrelated_advanced_heads_even_when_pr_view_lags(self):
        for stale_pr in (True, False):
            api = api_fixture()
            api.responses[REF_PATH]["object"]["sha"] = NEW_HEAD
            if not stale_pr:
                api.responses[PR_PATH]["head"]["sha"] = NEW_HEAD
            api.responses[PREFIX + "/commits/" + NEW_HEAD] = {
                "sha": NEW_HEAD, "author": {"login": "contributor", "type": "User"},
            }
            with self.subTest(stale_pr=stale_pr):
                self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_dispatch_rechecks_branch_ref_and_open_pr_before_dispatch(self):
        for change in ("ref", "closed", "author", "repository"):
            api = api_fixture()
            request = api.request
            def changed_request(path, method="GET", body=None, redirect=False):
                result = request(path, method, body, redirect)
                if path == REF_PATH:
                    if change == "ref":
                        api.responses[REF_PATH]["object"]["sha"] = NEW_HEAD
                    elif change == "closed":
                        api.responses[PR_PATH]["state"] = "closed"
                    elif change == "author":
                        api.responses[PR_PATH]["user"]["login"] = "contributor"
                    else:
                        api.responses[PR_PATH]["head"]["repo"] = {"id": 2, "full_name": "other/game"}
                return result
            api.request = changed_request
            with self.subTest(change=change):
                self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_dispatch_rejects_unverified_generated_successors(self):
        for change in ("author", "parent", "message", "source", "manifest", "notice"):
            api = api_fixture()
            self.publish(api)
            commit = api.responses[PREFIX + "/commits/" + NEW_HEAD]
            if change == "author":
                commit["author"]["login"] = "contributor"
            elif change == "parent":
                commit["parents"][0]["sha"] = "c" * 40
            elif change == "message":
                commit["commit"]["message"] += " changed"
            elif change == "source":
                commit["files"].append({"filename": "src/lib/game/engine.ts", "status": "modified"})
            else:
                name = "package-lock.json" if change == "manifest" else "public/THIRD-PARTY-NOTICES.txt"
                content = api.responses[PREFIX + "/contents/src/" + name + "?ref=" + NEW_HEAD]
                content.update(size=7, content=base64.b64encode(b"changed").decode())
            api.calls.clear()
            with self.subTest(change=change):
                if change in ("manifest", "notice"):
                    with self.assertRaises(ValueError):
                        dispatch_ci(api, REPO, 42, 1)
                else:
                    self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_dispatch_does_not_accept_closed_human_or_foreign_prs(self):
        for change in ("closed", "human", "fork"):
            api = api_fixture()
            if change == "closed":
                api.responses[PR_PATH]["state"] = "closed"
            elif change == "human":
                api.responses[PR_PATH]["user"]["login"] = "contributor"
            else:
                api.responses[PR_PATH]["head"]["repo"] = {"id": 2, "full_name": "other/game"}
            with self.subTest(change=change):
                self.assertIn("Skipped", dispatch_ci(api, REPO, 42, 1))
                self.assertEqual(api.mutations(), [])

    def test_api_failure_never_includes_credential_or_response_body(self):
        token = "credential-that-must-not-appear"
        api = GitHub(token)
        class FailingOpener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError("https://api.github.com/" + token, 403, token, {},
                                             io.BytesIO(b"private response body"))
        api.opener = FailingOpener()
        with self.assertRaises(ValueError) as raised:
            api.request("/user")
        self.assertNotIn(token, str(raised.exception))
        self.assertNotIn("private response body", str(raised.exception))
        self.assertIn("403", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
