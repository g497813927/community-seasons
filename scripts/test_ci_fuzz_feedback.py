import copy
import base64
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
import zipfile

from ci_fuzz_feedback import GitHub, collect, decode_prepared, format_comment, prepare, publish, unpack_report, validate_report


def report():
    return {"version": 1, "runId": 42, "runAttempt": 1, "masterSeed": 20260914,
            "roundSeed": 20260914, "roundNumber": 1,
            "sourceHashes": {"src/lib/game/engine.ts": "a" * 64},
            "suites": [{"name": "engine-properties", "status": "failed", "derivedSeed": 1525155539,
                        "failures": [{"seed": 1525155539, "case": "numeric-dt", "path": "2:1:0"}]}]}


def prepared():
    return {"repo": "owner/game", "pr": 7, "head": "b" * 40, "report": report()}


class FakeAPI:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def request(self, path, method="GET", body=None, redirect=False):
        self.calls.append((path, method, body))
        if method != "GET":
            return {"id": 99}
        return copy.deepcopy(self.responses[path])


def api_fixture(fork=False):
    prefix = "/repos/owner/game"
    run = {"id": 42, "run_attempt": 1, "head_sha": "b" * 40, "path": ".github/workflows/ci.yml",
           "repository": {"full_name": "owner/game", "id": 1}, "head_repository": {"id": 2},
           "workflow_id": 11, "event": "pull_request", "conclusion": "failure",
           "pull_requests": [] if fork else [{"number": 7}]}
    pr = {"state": "open", "base": {"repo": {"id": 1}}, "head": {"sha": "b" * 40, "repo": {"id": 2}}}
    artifact = {"id": 5, "name": "fuzz-feedback-42-1", "expired": False, "size_in_bytes": 1000,
                "workflow_run": {"id": 42, "repository_id": 1, "head_repository_id": 2, "head_sha": "b" * 40}}
    return FakeAPI({prefix + "/actions/runs/42/attempts/1": run,
                    prefix + "/actions/workflows/ci.yml": {"id": 11},
                    prefix + "/actions/runs/42/attempts/1/jobs?per_page=100": {
                        "total_count": 1, "jobs": [{"name": "Compile and test", "steps": [
                            {"name": "Run bounded fuzz tests", "conclusion": "failure"}]}]},
                    prefix + "/commits/" + "b" * 40 + "/pulls?per_page=100": [{"number": 7}],
                    prefix + "/pulls/7": pr,
                    prefix + "/actions/runs/42/artifacts?per_page=100": {"total_count": 1, "artifacts": [artifact]},
                    prefix + "/actions/artifacts/5/zip": "https://example.blob.core.windows.net/fixture"})


class FeedbackTests(unittest.TestCase):
    def test_comment_has_seed_path_hashes_and_generated_replay(self):
        marker, body = format_comment(prepared())
        self.assertTrue(body.startswith(marker + "\n"))
        for expected in ["Base seed: `20260914`", "FC_SEED=1525155539", "`2:1:0`", "numeric-dt",
                         "1 files", "node run.mjs quick --rounds 1 --seed 20260914 --no-tui",
                         "https://github.com/owner/game/actions/runs/42/attempts/1"]:
            self.assertIn(expected, body)

    def test_malicious_markdown_and_shell_text_rejected(self):
        for key, value in [("case", "@everyone"), ("case", "x`\n```sh\nrm -rf /"),
                           ("path", "1:2'; curl evil"), ("seed", "$(curl evil)"), ("path", "1\n::warning::x")]:
            bad = report()
            bad["suites"][0]["failures"][0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                validate_report(bad)
        for bad_path in ["../../secret", "/tmp/secret", "@mention", "x`](/evil)"]:
            bad = report()
            bad["sourceHashes"] = {bad_path: "a" * 64}
            with self.assertRaises(ValueError):
                validate_report(bad)

    def test_schema_rejects_oversized_and_noninteger_values(self):
        for key, value in [("masterSeed", True), ("roundSeed", -1), ("runId", "42"), ("roundNumber", 2)]:
            bad = report()
            bad[key] = value
            with self.assertRaises(ValueError):
                validate_report(bad)
        bad = report()
        bad["suites"][0]["failures"] *= 21
        with self.assertRaises(ValueError):
            validate_report(bad)

    def test_no_case_details_still_has_bounded_replay(self):
        data = prepared()
        data["report"]["suites"][0]["failures"] = []
        self.assertIn("No per-case seed/shrink path was recorded", format_comment(data)[1])

    def test_job_output_payload_is_bounded_and_revalidated(self):
        encoded = base64.b64encode(json.dumps(prepared()).encode()).decode()
        self.assertEqual(decode_prepared(encoded), prepared())
        for bad in ["not base64", "x" * 90001, base64.b64encode(b'{"body":"@everyone"}').decode()]:
            with self.assertRaises((ValueError, KeyError)):
                decode_prepared(bad)

    def test_zip_only_accepts_one_bounded_json_never_extracts(self):
        def archive(entries):
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zipped:
                for name, data in entries:
                    zipped.writestr(name, data)
            return output.getvalue()
        payload = json.dumps(report())
        self.assertEqual(unpack_report(archive([("report.json", payload)])), report())
        for entries in [[("../report.json", payload)], [("report.json", payload), ("run.sh", "evil")],
                        [("report.json", " " * 65537)]]:
            with self.assertRaises(ValueError):
                unpack_report(archive(entries))

    def test_prepare_checks_api_run_pr_and_artifact(self):
        for fork in (False, True):
            api = api_fixture(fork)
            result = prepare(api, "owner/game", 42, 1, lambda _: report())
            self.assertEqual(result, prepared())
            self.assertTrue(all(method == "GET" for _, method, _ in api.calls))

    def test_stale_or_different_repository_pr_is_skipped_before_download(self):
        for change in [lambda pr: pr["head"].update(sha="c" * 40),
                       lambda pr: pr["head"]["repo"].update(id=3),
                       lambda pr: pr["base"]["repo"].update(id=3)]:
            api = api_fixture()
            change(api.responses["/repos/owner/game/pulls/7"])
            self.assertIsNone(prepare(api, "owner/game", 42, 1, lambda _: self.fail("downloaded")))

    def test_other_failure_and_spoofed_artifact_are_not_published(self):
        api = api_fixture()
        api.responses["/repos/owner/game/actions/runs/42/attempts/1/jobs?per_page=100"]["jobs"][0]["steps"][0]["conclusion"] = "success"
        self.assertIsNone(prepare(api, "owner/game", 42, 1))
        api = api_fixture()
        api.responses["/repos/owner/game/actions/runs/42/artifacts?per_page=100"]["artifacts"][0]["workflow_run"]["head_sha"] = "c" * 40
        with self.assertRaises(ValueError):
            prepare(api, "owner/game", 42, 1, lambda _: self.fail("downloaded"))

    def test_duplicate_artifacts_and_wrong_attempt_fail_closed(self):
        api = api_fixture()
        artifacts = api.responses["/repos/owner/game/actions/runs/42/artifacts?per_page=100"]["artifacts"]
        artifacts.append(copy.deepcopy(artifacts[0]))
        with self.assertRaises(ValueError):
            prepare(api, "owner/game", 42, 1, lambda _: self.fail("downloaded"))
        wrong_attempt = report()
        wrong_attempt["runAttempt"] = 2
        with self.assertRaises(ValueError):
            prepare(api_fixture(), "owner/game", 42, 1, lambda _: wrong_attempt)

    def test_api_errors_never_render_secret_or_response_body(self):
        api = GitHub("fake-credential-that-must-not-appear")
        class FailingOpener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError("https://api.github.com/secret", 403,
                                             "fake-credential-that-must-not-appear", {},
                                             io.BytesIO(b"sensitive response body"))
        api.opener = FailingOpener()
        with self.assertRaises(ValueError) as context:
            api.request("/user")
        self.assertEqual(str(context.exception), "GitHub API request failed (HTTP 403)")

    def test_bot_identity_required_before_comments(self):
        api = FakeAPI({"/user": {"login": "other", "id": 8}})
        with self.assertRaises(ValueError):
            publish(api, prepared())
        self.assertEqual(len(api.calls), 1)

    def test_only_own_marked_comment_can_be_updated(self):
        marker, body = format_comment(prepared())
        comments = [{"id": 10, "user": {"login": "maintainer", "id": 7}, "body": marker + "\nuser text"},
                    {"id": 11, "user": {"login": "techzjc-bot", "id": 8}, "body": marker + "\nold"}]
        api = FakeAPI({"/user": {"login": "techzjc-bot", "id": 8},
                       "/repos/owner/game/issues/7/comments?per_page=100&page=1": comments})
        self.assertEqual(publish(api, prepared()), "Updated own bot comment")
        self.assertEqual(api.calls[-1], ("/repos/owner/game/issues/comments/11", "PATCH", {"body": body}))
        api.responses["/repos/owner/game/issues/7/comments?per_page=100&page=1"][1]["body"] = body
        self.assertEqual(publish(api, prepared()), "Existing bot comment is current")

    def test_different_head_marker_never_edits_old_comment(self):
        old = prepared()
        old["head"] = "c" * 40
        api = FakeAPI({"/user": {"login": "techzjc-bot", "id": 8},
                       "/repos/owner/game/issues/7/comments?per_page=100&page=1": [
                           {"id": 11, "user": {"login": "techzjc-bot", "id": 8}, "body": format_comment(old)[1]}]})
        self.assertEqual(publish(api, prepared()), "Created bot comment")
        self.assertEqual(api.calls[-1][1], "POST")

    def test_collector_strips_error_replay_and_counterexample(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "results").mkdir()
            (root / "work/property-tests").mkdir(parents=True)
            summary = {"version": 2, "mode": "quick", "requestedRounds": 1, "status": "failed",
                       "startedAt": "2020-01-01T00:00:00Z", "masterSeed": 20260914,
                       "sourceHashes": report()["sourceHashes"], "latestRound": {"number": 1, "seed": 20260914,
                       "settings": {"FC_SEED": "1525155539"}, "suites": [{"name": "engine-properties", "status": "failed"}]}}
            (root / "results/summary.json").write_text(json.dumps(summary))
            (root / "work/property-tests/engine-invalid-failure-numeric-dt.json").write_text(json.dumps({
                "id": "numeric-dt", "seed": 1525155539, "counterexamplePath": "2:1:0",
                "error": "@everyone secret", "replay": "curl evil", "counterexample": "<script>"}))
            result = collect(root, 42, 1)
            self.assertEqual(result, report())
            self.assertNotIn("secret", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
