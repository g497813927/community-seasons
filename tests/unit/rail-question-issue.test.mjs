import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  FIELDS,
  SUBMISSION_TYPES,
  parseSubmission,
  isRailQuestion,
  formatReport,
  checkIssueEvent,
} from "../../scripts/check-rail-question.mjs";

const bank = JSON.parse(fs.readFileSync(new URL("../../src/lib/game/rail-questions.json", import.meta.url), "utf8"));
const marker = "<!-- community-seasons:rail-question-check -->";

// These headings intentionally come from a contributor's rendered GitHub form,
// independently of the parser's FIELDS table. A changed label must update both.
const headings = [
  ["type", "Submission type / 提交类型"],
  ["id", "Question ID / 题目标识"],
  ["topic", "Topic / 主题"],
  ["prompt_en", "Prompt (English)"],
  ["prompt_zh", "Prompt (简体中文)"],
  ["option_1_en", "Option 1 (English)"],
  ["option_1_zh", "Option 1 (简体中文)"],
  ["why_1_en", "Explanation 1 (English)"],
  ["why_1_zh", "Explanation 1 (简体中文)"],
  ["option_2_en", "Option 2 (English)"],
  ["option_2_zh", "Option 2 (简体中文)"],
  ["why_2_en", "Explanation 2 (English)"],
  ["why_2_zh", "Explanation 2 (简体中文)"],
  ["option_3_en", "Option 3 (English)"],
  ["option_3_zh", "Option 3 (简体中文)"],
  ["why_3_en", "Explanation 3 (English)"],
  ["why_3_zh", "Explanation 3 (简体中文)"],
  ["correct", "Correct option / 正确选项"],
  ["notes", "Review notes / 审阅说明"],
];
const values = {
  type: "New question / 新增题目",
  id: "issue-context-check",
  topic: "respectful-discussion",
  prompt_en: "A reply seems unclear. How can you check what the writer meant?",
  prompt_zh: "一条回复意思不清，怎样确认作者的意思？",
  option_1_en: "Assume the worst.",
  option_1_zh: "往最坏的方向理解。",
  why_1_en: "Guessing hostile intent can turn uncertainty into conflict.",
  why_1_zh: "猜测对方有敌意，可能让误会变成冲突。",
  option_2_en: "Ask a calm clarifying question.",
  option_2_zh: "平静地询问对方的意思。",
  why_2_en: "A specific question gives the writer room to clarify.",
  why_2_zh: "具体询问能让作者有机会说明本意。",
  option_3_en: "Publish an accusation immediately.",
  option_3_zh: "立刻公开指责。",
  why_3_en: "An accusation can spread a misunderstanding before facts are checked.",
  why_3_zh: "事实核实前就指责，可能传播误解。",
  correct: "2",
  notes: "Fictional scenario; please review both translations. / 虚构情境，请审阅双语。",
};

function body(overrides = {}, omitted = []) {
  const next = { ...values, ...overrides };
  return headings.filter(([id]) => !omitted.includes(id))
    .map(([id, label]) => `### ${label}\n\n${next[id]}`).join("\n\n");
}

function asFields(question) {
  const fields = {
    type: SUBMISSION_TYPES.edit,
    id: question.id,
    topic: question.topic,
    prompt_en: question.prompt.en,
    prompt_zh: question.prompt.zh,
    correct: String(question.correctIndex + 1),
  };
  question.options.forEach((option, index) => {
    for (const locale of ["en", "zh"]) {
      fields[`option_${index + 1}_${locale}`] = option.label[locale];
      fields[`why_${index + 1}_${locale}`] = option.why[locale];
    }
  });
  return fields;
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test("GitHub form headings and dropdown values remain compatible with the parser", () => {
  assert.deepEqual(FIELDS.map(({ id, label }) => [id, label]), headings);
  assert.deepEqual(SUBMISSION_TYPES, {
    new: "New question / 新增题目",
    edit: "Improve existing question / 修改现有题目",
  });
  const template = fs.readFileSync(new URL("../../.github/ISSUE_TEMPLATE/rail-question.yml", import.meta.url), "utf8");
  // Inspect this template's field blocks only; this is not a general YAML parser.
  const blocks = template.split(/^  - type: /m).slice(1);
  const formFields = blocks.filter(block => /^    id: /m.test(block));
  assert.equal(formFields.length, headings.length);
  const formIds = formFields.map(block => block.match(/^    id: (.+)$/m)[1]);
  assert.equal(new Set(formIds).size, formIds.length, "form input IDs are unique");
  for (const [id, label] of headings) {
    const field = formFields.find(block => block.match(/^      label: (.+)$/m)?.[1].replace(/^["']|["']$/g, "") === label);
    assert.ok(field, `missing form field ${id}`);
    const actualLabel = field.match(/^      label: (.+)$/m)?.[1].replace(/^["']|["']$/g, "");
    assert.equal(actualLabel, label, `form label for ${id}`);
    if (id !== "notes") assert.match(field, /^      required: true$/m, `${id} is required`);
    else assert.doesNotMatch(field, /^      required: true$/m);
  }
  for (const value of Object.values(SUBMISSION_TYPES)) assert.ok(template.includes(value));
  const correctField = formFields.find(block => block.includes("label: Correct option / 正确选项"));
  assert.match(correctField, /^dropdown\n/);
  assert.deepEqual([...correctField.matchAll(/^        - ["']?([123])["']?$/gm)].map(match => match[1]), ["1", "2", "3"]);
});

test("a complete GitHub submission maps bilingual choices and the one-based correct option", () => {
  const result = parseSubmission(body(), bank);
  assert.equal(result.type, SUBMISSION_TYPES.new);
  assert.equal(result.notes, values.notes);
  assert.deepEqual(result.question, {
    id: values.id,
    topic: values.topic,
    prompt: { en: values.prompt_en, zh: values.prompt_zh },
    options: [1, 2, 3].map(index => ({
      label: { en: values[`option_${index}_en`], zh: values[`option_${index}_zh`] },
      why: { en: values[`why_${index}_en`], zh: values[`why_${index}_zh`] },
    })),
    correctIndex: 1,
  });
  for (const correct of ["1", "2", "3"]) {
    assert.equal(parseSubmission(body({ correct }), bank).question.correctIndex, Number(correct) - 1);
  }
});

test("CRLF form submissions and empty optional notes are accepted", () => {
  assert.deepEqual(parseSubmission(body().replaceAll("\n", "\r\n"), bank), parseSubmission(body(), bank));
  for (const notes of ["", "_No response_"]) assert.equal(parseSubmission(body({ notes }), bank).notes, "");
  assert.equal(parseSubmission(body({}, ["notes"]), bank).notes, "");
});

test("all required form fields reject omission, blanks and GitHub's no-response placeholder", () => {
  for (const [id] of headings.filter(([id]) => id !== "notes")) {
    assert.throws(() => parseSubmission(body({}, [id]), bank), `omitted ${id}`);
    for (const empty of ["", "   ", "_No response_"]) {
      assert.throws(() => parseSubmission(body({ [id]: empty }), bank), `empty ${id}`);
    }
  }
});

test("duplicate, misspelled and malformed form headings are rejected", () => {
  assert.throws(() => parseSubmission(`${body()}\n\n### Topic / 主题\n\nprivacy`, bank));
  assert.throws(() => parseSubmission(body().replace("### Prompt (English)", "### Prompt (English typo)"), bank));
  assert.throws(() => parseSubmission(body().replace("### Topic / 主题", "## Topic / 主题"), bank));
  assert.throws(() => parseSubmission(body().replace("### Topic / 主题", "### Unexpected field\n\nvalue\n\n### Topic / 主题"), bank));
  assert.throws(() => parseSubmission("Just an ordinary issue body.", bank));
});

test("notes can retain contributor formatting without becoming additional question fields", () => {
  const notes = "Context for reviewers.\n\n### References\n\nA fictional example, with no real people.";
  assert.equal(parseSubmission(body({ notes }), bank).notes, notes);
});

test("oversized issue bodies are rejected before parsing", () => {
  assert.throws(() => parseSubmission(body({ notes: "x".repeat(65_537) }), bank));
});

test("new questions cannot reuse stable IDs or either locale's existing prompt", () => {
  const existing = bank.questions[0];
  assert.throws(() => parseSubmission(body({ id: existing.id }), bank));
  assert.throws(() => parseSubmission(body({ prompt_en: existing.prompt.en.toUpperCase() }), bank));
  assert.throws(() => parseSubmission(body({ prompt_zh: existing.prompt.zh }), bank));
});

test("editing replaces the identified question and retains its review-only source without changing the bank", () => {
  const sourceQuestion = bank.questions.find(question => question.source);
  assert.ok(sourceQuestion, "fixture needs a source-backed question");
  const original = structuredClone(bank);
  const readOnlyBank = freezeDeep(structuredClone(bank));
  const result = parseSubmission(body({ ...asFields(sourceQuestion), why_1_en: values.why_1_en }), readOnlyBank);
  assert.equal(result.type, SUBMISSION_TYPES.edit);
  assert.equal(result.question.id, sourceQuestion.id);
  assert.equal(result.question.options[0].why.en, values.why_1_en);
  assert.deepEqual(result.question.source, sourceQuestion.source);
  assert.deepEqual(readOnlyBank, original);
  // Reusing this question's own prompt is valid; another question's is not.
  const other = bank.questions.find(question => question.id !== sourceQuestion.id);
  assert.throws(() => parseSubmission(body({ ...asFields(sourceQuestion), prompt_en: other.prompt.en.toUpperCase() }), readOnlyBank));
  assert.throws(() => parseSubmission(body({ type: SUBMISSION_TYPES.edit }), readOnlyBank));
});

test("accepted and rejected new submissions never mutate the supplied question bank", () => {
  const original = structuredClone(bank);
  const readOnlyBank = freezeDeep(structuredClone(bank));
  parseSubmission(body(), readOnlyBank);
  assert.throws(() => parseSubmission(body({ id: bank.questions[0].id }), readOnlyBank));
  assert.deepEqual(readOnlyBank, original);
});

test("editing an earlier question to duplicate a later one reports the contributor's form field", () => {
  for (const [locale, label] of [["en", "English"], ["zh", "简体中文"]]) {
    assert.throws(() => parseSubmission(body({
      ...asFields(bank.questions[0]),
      [`prompt_${locale}`]: bank.questions.at(-1).prompt[locale],
    }), bank), error => {
      assert.ok(error.message.startsWith(`Prompt (${label}):`));
      assert.ok(!error.message.includes("questions["));
      return true;
    });
  }
});

for (const [field, limit] of [
  ["prompt_en", 180], ["prompt_zh", 90],
  ["option_1_en", 72], ["option_1_zh", 36],
  ["why_1_en", 240], ["why_1_zh", 120],
]) {
  test(`submission ${field} obeys the production bank's ${limit}-character layout limit`, () => {
    assert.doesNotThrow(() => parseSubmission(body({ [field]: "x".repeat(limit) }), bank));
    assert.throws(() => parseSubmission(body({ [field]: "x".repeat(limit + 1) }), bank));
  });
}

test("duplicate answer labels are rejected independently in both languages", () => {
  assert.throws(() => parseSubmission(body({ option_2_en: values.option_1_en.toUpperCase() }), bank));
  assert.throws(() => parseSubmission(body({ option_2_zh: values.option_1_zh }), bank));
});

test("invalid IDs, topics, submission types and answer numbers do not enter the bank", () => {
  for (const field of ["id", "topic"]) {
    for (const value of ["Uppercase", "with spaces", "with_under_scores", "ends-", "3-start"]) {
      assert.throws(() => parseSubmission(body({ [field]: value }), bank), `${field}: ${value}`);
    }
  }
  assert.throws(() => parseSubmission(body({ type: "Delete question" }), bank));
  for (const correct of ["0", "4", "-1", "1.5", "01", "1text", "first"]) {
    assert.throws(() => parseSubmission(body({ correct }), bank), `correct: ${correct}`);
  }
});

test("shell substitutions and Actions commands remain inert submission text", () => {
  const prompt = 'Treat ${process.exit(9)}, $(touch /tmp/rail-issue-injected), and `whoami` as text.';
  const notes = "::error::contributor text\n::add-mask::literal\n${{ secrets.GITHUB_TOKEN }}";
  const result = parseSubmission(body({ prompt_en: prompt, notes }), bank);
  assert.equal(result.question.prompt.en, prompt);
  assert.equal(result.notes, notes);
});

test("issue recognition survives title edits, skips ordinary issues and excludes pull requests", () => {
  assert.equal(isRailQuestion({ title: "[Rail question] New scenario", body: "Incomplete" }), true);
  assert.equal(isRailQuestion({ title: "Renamed by a reviewer", body: body() }), true);
  assert.equal(isRailQuestion({ title: "Ordinary issue", body: "Submission type / 提交类型 and Question ID / 题目标识" }), false);
  assert.equal(isRailQuestion({ title: "Ordinary issue", body: "### Submission type / 提交类型\n\nNew" }), false);
  assert.equal(isRailQuestion({ title: "Fix [Rail question] wording", body: "Ordinary issue" }), false);
  assert.equal(isRailQuestion({ title: "Ordinary issue", body: null }), false);
  assert.equal(isRailQuestion({ title: "[Rail question] Pull request", body: body(), pull_request: { url: "https://api.github.com/repos/example/repo/pulls/1" } }), false);
});

test("validation reports are bilingual, identifiable and do not echo submitted teaching text", () => {
  const result = parseSubmission(body(), bank);
  const report = formatReport({ valid: true, question: result.question }, "https://github.com/example/repo/actions/runs/123");
  assert.equal(typeof report, "string");
  assert.ok(report.includes(marker));
  assert.match(report, /[\u3400-\u9fff]/u);
  assert.match(report, /review/i);
  assert.ok(report.includes("https://github.com/example/repo/actions/runs/123"));
  for (const text of [values.prompt_en, values.prompt_zh, values.option_1_en, values.why_1_en]) {
    assert.ok(!report.includes(text), "feedback does not quote submitted question content");
  }
});

test("invalid reports neutralize HTML, mentions, Markdown links and control characters in errors", () => {
  const attack = 'questions[0].id: <img src=x onerror=alert(1)> @reviewer [click](https://example.invalid) `code`\u0000\u0007\r\n::error::injected';
  const report = formatReport({ valid: false, error: attack }, "https://github.com/example/repo/actions/runs/123");
  assert.ok(report.includes(marker));
  assert.match(report, /[\u3400-\u9fff]/u);
  assert.ok(!report.includes("<img"));
  assert.ok(!report.includes("@reviewer"));
  const literalError = report.match(/<pre>([^<>]*)<\/pre>/)?.[1];
  assert.ok(literalError, "untrusted error is contained in an HTML-escaped literal block");
  assert.ok(literalError.includes("[click](https://example.invalid)"), "Markdown stays literal inside the pre block");
  assert.doesNotMatch(report, /[\u0000-\u0008\u000b-\u001f\u007f]/u);
  assert.doesNotMatch(report, /^::error::/m);
});

const repository = "example/repo";
const issueRoute = `/repos/${repository}/issues/42`;
const runUrl = "https://github.com/example/repo/actions/runs/123";
function issueEvent(overrides = {}) {
  return {
    action: "opened",
    repository: { full_name: repository },
    issue: { number: 42, title: "[Rail question] Clarifying a reply", state: "open", body: body(), ...overrides },
  };
}

function issueApi(event, { comments = [[]], latest = event.issue } = {}) {
  const calls = [];
  const summaries = [];
  return {
    calls,
    summaries,
    options: {
      repository,
      runUrl,
      request: async (method, route, data) => {
        calls.push({ method, route, data });
        const page = new RegExp(`^${issueRoute}/comments\\?per_page=100&page=(\\d+)$`).exec(route);
        if (method === "GET" && page) return comments[Number(page[1]) - 1] ?? [];
        if (method === "GET" && route === issueRoute) return latest;
        if (["POST", "PATCH"].includes(method)) return { id: 321 };
        assert.fail(`unexpected request: ${method} ${route}`);
      },
      writeSummary: report => summaries.push(report),
    },
  };
}

function mutations(api) {
  return api.calls.filter(call => call.method !== "GET");
}

test("opened submissions receive one bilingual comment and a matching Actions summary", async () => {
  const event = issueEvent();
  const api = issueApi(event);
  assert.deepEqual(await checkIssueEvent(event, api.options), { valid: true, skipped: false });
  const [comment] = mutations(api);
  assert.equal(mutations(api).length, 1);
  assert.equal(comment.method, "POST");
  assert.equal(comment.route, `${issueRoute}/comments`);
  assert.ok(comment.data.body.startsWith(marker));
  assert.deepEqual(api.summaries, [comment.data.body]);
  assert.deepEqual(api.calls.slice(0, 2).map(({ method, route }) => [method, route]), [
    ["GET", `${issueRoute}/comments?per_page=100&page=1`],
    ["GET", issueRoute],
  ]);
});

test("invalid submissions receive actionable field feedback and a failed validation result", async () => {
  const event = issueEvent({ body: body({ why_2_zh: "_No response_" }) });
  const api = issueApi(event);
  assert.deepEqual(await checkIssueEvent(event, api.options), { valid: false, skipped: false });
  assert.equal(mutations(api).length, 1);
  const report = mutations(api)[0].data.body;
  assert.match(report, /Explanation 2 \(简体中文\)/);
  assert.ok(!report.includes(values.prompt_en));
  assert.deepEqual(api.summaries, [report]);
});

test("edited submissions update the existing Actions bot feedback rather than adding comments", async () => {
  const event = issueEvent();
  event.action = "edited";
  const api = issueApi(event, {
    comments: [[{ id: 321, user: { login: "github-actions[bot]", type: "Bot" }, body: `${marker}\nOld feedback` }]],
  });
  await checkIssueEvent(event, api.options);
  assert.equal(mutations(api).length, 1);
  assert.equal(mutations(api)[0].method, "PATCH");
  assert.equal(mutations(api)[0].route, `/repos/${repository}/issues/comments/321`);
});

test("identical bot feedback does not cause a redundant comment write", async () => {
  const event = issueEvent();
  const report = formatReport({ valid: true, question: parseSubmission(event.issue.body, bank).question }, runUrl);
  const api = issueApi(event, {
    comments: [[{ id: 321, user: { login: "github-actions[bot]", type: "Bot" }, body: report }]],
  });
  assert.deepEqual(await checkIssueEvent(event, api.options), { valid: true, skipped: false });
  assert.deepEqual(mutations(api), []);
  assert.deepEqual(api.summaries, [report]);
});

test("feedback markers in human or other bot comments cannot make the checker edit those comments", async () => {
  const event = issueEvent();
  const api = issueApi(event, {
    comments: [[
      { id: 111, user: { login: "contributor", type: "User" }, body: marker },
      { id: 112, user: { login: "other[bot]", type: "Bot" }, body: marker },
      { id: 113, user: { login: "github-actions[bot]", type: "User" }, body: marker },
      { id: 114, user: { login: "github-actions[bot]", type: "Bot" }, body: `Quoted marker: ${marker}` },
    ]],
  });
  await checkIssueEvent(event, api.options);
  assert.equal(mutations(api).length, 1);
  assert.equal(mutations(api)[0].method, "POST");
});

test("comment pagination finds existing bot feedback beyond the first hundred comments", async () => {
  const event = issueEvent();
  const api = issueApi(event, {
    comments: [
      Array.from({ length: 100 }, (_, index) => ({ id: index + 1, user: { login: "contributor", type: "User" }, body: "Review discussion" })),
      [{ id: 321, user: { login: "github-actions[bot]", type: "Bot" }, body: marker }],
    ],
  });
  await checkIssueEvent(event, api.options);
  assert.ok(api.calls.some(call => call.route === `${issueRoute}/comments?per_page=100&page=2`));
  assert.equal(mutations(api).length, 1);
  assert.equal(mutations(api)[0].method, "PATCH");
});

test("stale or closed submissions never overwrite feedback after the freshness check", async () => {
  for (const change of [
    { body: body({ notes: "Updated since this workflow began." }) },
    { state: "closed" },
    { title: "Another issue", body: "No longer a railway question." },
  ]) {
    const event = issueEvent();
    const api = issueApi(event, { latest: { ...event.issue, ...change } });
    assert.deepEqual(await checkIssueEvent(event, api.options), { skipped: true });
    assert.deepEqual(mutations(api), []);
    assert.equal(api.summaries.length, 1);
    assert.match(api.summaries[0], /skipped/i);
  }
});

test("unrelated issues, closed issues and pull requests make no API calls", async () => {
  for (const change of [
    { title: "Ordinary issue", body: "General feedback." },
    { state: "closed" },
    { pull_request: { url: "https://api.github.com/repos/example/repo/pulls/42" } },
  ]) {
    const event = issueEvent(change);
    const api = issueApi(event);
    assert.deepEqual(await checkIssueEvent(event, api.options), { skipped: true });
    assert.deepEqual(api.calls, []);
    assert.deepEqual(api.summaries, []);
  }
});

test("repository and numeric identifiers are validated before building write routes", async () => {
  for (const number of [0, -1, 1.5, "42/../../comments/1", Number.MAX_SAFE_INTEGER + 1]) {
    const event = issueEvent({ number });
    const api = issueApi(event);
    await assert.rejects(checkIssueEvent(event, api.options));
    assert.deepEqual(api.calls, []);
  }
  const event = issueEvent();
  const api = issueApi(event);
  await assert.rejects(checkIssueEvent(event, { ...api.options, repository: "different/repository" }));
  assert.deepEqual(api.calls, []);
  const badCommentApi = issueApi(event, {
    comments: [[{ id: "321/../../1", user: { login: "github-actions[bot]", type: "Bot" }, body: marker }]],
  });
  await assert.rejects(checkIssueEvent(event, badCommentApi.options));
  assert.deepEqual(mutations(badCommentApi), []);
});

test("an API failure aborts feedback rather than reporting successful delivery", async () => {
  const event = issueEvent();
  const api = issueApi(event);
  await assert.rejects(checkIssueEvent(event, {
    ...api.options,
    request: async () => { throw new Error("API unavailable"); },
  }), /API unavailable/);
  assert.deepEqual(api.summaries, []);
});

test("local CLI validation returns useful exit codes without changing the question bank", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rail-question-issue-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const checker = fileURLToPath(new URL("../../scripts/check-rail-question.mjs", import.meta.url));
  const original = fs.readFileSync(new URL("../../src/lib/game/rail-questions.json", import.meta.url), "utf8");
  const file = path.join(directory, "issue.md");
  const invoke = (mode = "--body") => spawnSync(process.execPath, [checker, mode, file], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, GITHUB_TOKEN: "" },
  });
  fs.writeFileSync(file, body());
  const accepted = invoke();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.ok(accepted.stdout.includes(marker));
  assert.match(accepted.stdout, /passed/);
  assert.ok(!accepted.stdout.includes(values.prompt_en));

  fs.writeFileSync(file, body({ why_3_en: "_No response_" }));
  const rejected = invoke();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /Explanation 3 \(English\)/);
  assert.ok(rejected.stdout.includes(marker));

  fs.writeFileSync(file, JSON.stringify(issueEvent({ title: "General issue", body: "Not a question submission" })));
  const unrelated = invoke("--event");
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.match(unrelated.stdout, /no rail-question checks needed/);

  fs.writeFileSync(file, "bad JSON with private-looking content that should not appear in logs");
  const malformed = invoke("--event");
  assert.equal(malformed.status, 1);
  assert.ok(!malformed.stderr.includes("private-looking"));
  assert.equal(fs.readFileSync(new URL("../../src/lib/game/rail-questions.json", import.meta.url), "utf8"), original);
});
