import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestionBank } from '../src/scripts/question-bank.mjs';

const bankUrl = new URL('../src/lib/game/rail-questions.json', import.meta.url);
export const SUBMISSION_TYPES = {
  new: 'New question / 新增题目',
  edit: 'Improve existing question / 修改现有题目',
};
export const FIELDS = [
  { id: 'type', label: 'Submission type / 提交类型' },
  { id: 'id', label: 'Question ID / 题目标识', path: 'id' },
  { id: 'topic', label: 'Topic / 主题', path: 'topic' },
  { id: 'prompt_en', label: 'Prompt (English)', path: 'prompt.en' },
  { id: 'prompt_zh', label: 'Prompt (简体中文)', path: 'prompt.zh' },
  ...[1, 2, 3].flatMap(i => [
    { id: `option_${i}_en`, label: `Option ${i} (English)`, path: `options[${i - 1}].label.en` },
    { id: `option_${i}_zh`, label: `Option ${i} (简体中文)`, path: `options[${i - 1}].label.zh` },
    { id: `why_${i}_en`, label: `Explanation ${i} (English)`, path: `options[${i - 1}].why.en` },
    { id: `why_${i}_zh`, label: `Explanation ${i} (简体中文)`, path: `options[${i - 1}].why.zh` },
  ]),
  { id: 'correct', label: 'Correct option / 正确选项', path: 'correctIndex' },
  { id: 'notes', label: 'Review notes / 审阅说明' },
];
const labels = new Map(FIELDS.map(field => [field.label, field]));
export const COMMENT_MARKER = '<!-- community-seasons:rail-question-check -->';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function isRailQuestion(issue) {
  if (!issue || issue.pull_request) return false;
  return /^\[Rail question\]/i.test(issue.title ?? '') || (
    /^### Submission type \/ 提交类型\s*$/m.test(issue.body ?? '') &&
    /^### Question ID \/ 题目标识\s*$/m.test(issue.body ?? '')
  );
}

export function parseSubmission(body, bank) {
  requireValue(typeof body === 'string' && body.length <= 65_536, 'Issue body must be text within 65,536 characters. / 正文须为不超过 65,536 字符的文本。');
  const sections = new Map();
  let current;
  // GitHub turns each form label into a level-three Markdown heading. Labels
  // are a versioned interface: keep the template and contract tests in sync.
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^### (.+?)\s*$/.exec(line);
    const field = heading && labels.get(heading[1]);
    if (field) {
      requireValue(!sections.has(field.id), `${field.label}: duplicate field heading / 字段标题重复。`);
      current = field.id;
      sections.set(current, []);
    } else {
      requireValue(!heading || current === 'notes', 'Unknown field heading; keep the form headings unchanged. / 未知字段标题，请保留表单原有标题。');
      if (current) sections.get(current).push(line);
      else requireValue(!line.trim(), 'Use the rail-question issue form. / 请使用铁路题目 Issue 表单。');
    }
  }
  const values = {};
  for (const { id, label } of FIELDS) {
    const value = sections.get(id)?.join('\n').trim() ?? '';
    values[id] = value === '_No response_' ? '' : value;
    if (id !== 'notes') requireValue(values[id], `${label}: required / 必填。`);
  }
  requireValue(Object.values(SUBMISSION_TYPES).includes(values.type), 'Submission type / 提交类型: choose New question or Improve existing question / 请选择新增或修改。');
  requireValue(/^[123]$/.test(values.correct), 'Correct option / 正确选项: choose 1, 2, or 3 / 请选择 1、2 或 3。');
  for (const id of ['id', 'topic']) {
    requireValue(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(values[id]), `${FIELDS.find(field => field.id === id).label}: use a lowercase hyphenated identifier / 使用小写字母、数字和连字符标识。`);
  }

  const existingIndex = bank.questions.findIndex(question => question.id === values.id);
  const editing = values.type === SUBMISSION_TYPES.edit;
  requireValue(editing ? existingIndex >= 0 : existingIndex < 0, editing
    ? 'Question ID / 题目标识: existing question not found; use its stable ID / 未找到原题，请使用已有标识。'
    : 'Question ID / 题目标识: ID already exists; choose a new ID or submit an improvement / 标识已存在，请更换标识或选择修改。');
  const question = {
    id: values.id,
    topic: values.topic,
    prompt: { en: values.prompt_en, zh: values.prompt_zh },
    options: [1, 2, 3].map(i => ({
      label: { en: values[`option_${i}_en`], zh: values[`option_${i}_zh`] },
      why: { en: values[`why_${i}_en`], zh: values[`why_${i}_zh`] },
    })),
    correctIndex: Number(values.correct) - 1,
  };
  // Notes and references require human review. Never fetch links or turn notes
  // into source metadata; retain existing metadata when checking corrections.
  if (editing && bank.questions[existingIndex].source) {
    question.source = structuredClone(bank.questions[existingIndex].source);
  }
  const candidate = structuredClone(bank);
  const index = editing ? existingIndex : candidate.questions.length;
  if (editing) candidate.questions[index] = question;
  else candidate.questions.push(question);
  try {
    validateQuestionBank(candidate);
  } catch (error) {
    // Duplicate prompts can be reported at a later bank entry when correcting
    // an earlier one. Feedback should still name the contributor's form field.
    const message = error.message.replace(/^questions\[\d+\]\./, '');
    const colon = message.indexOf(':');
    const field = FIELDS.find(field => field.path === message.slice(0, colon));
    throw new Error(field ? `${field.label}${message.slice(colon)}` : message);
  }
  return { type: values.type, question, notes: values.notes };
}

// Do not let issue text create mentions, links, HTML, Markdown or Actions log
// commands in feedback. The validator reports field names, not submitted prose.
function safeError(error) {
  return String(error).replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0, 800)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@/g, '&#64;').replace(/`/g, '&#96;');
}

export function formatReport(result, runUrl) {
  const lines = [COMMENT_MARKER, '### Rail question check / 铁路题目检查', ''];
  if (result.valid) {
    lines.push('✅ Structural checks passed. / 结构检查通过。', '',
      'Maintainers still need to review the answer, translations, and sources before adding this question to the bank. Nothing is imported automatically.',
      '维护者仍需审阅答案、翻译及来源，再将题目加入题库；不会自动导入。');
  } else {
    lines.push('❌ Please fix the submission. / 请修正提交内容。', '',
      `<pre>${safeError(result.error)}</pre>`, '',
      'Edit the issue body, keeping the form headings, to run the checks again. Further errors may appear after this one is fixed.',
      '请编辑 Issue 正文并保留表单标题，检查将重新运行；修正后可能显示下一处问题。');
  }
  if (/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(runUrl ?? '')) {
    lines.push('', `[View check run / 查看检查记录](${runUrl})`);
  }
  return `${lines.join('\n')}\n`;
}

export async function checkIssueEvent(event, { repository, runUrl, request, writeSummary }) {
  const issue = event.issue;
  if (!isRailQuestion(issue) || issue.state !== 'open') return { skipped: true };
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') && event.repository?.full_name === repository, 'Unexpected repository context.');
  requireValue(Number.isSafeInteger(issue.number) && issue.number > 0, 'Invalid issue number.');
  const route = `/repos/${repository}/issues/${issue.number}`;
  const bank = JSON.parse(fs.readFileSync(bankUrl, 'utf8'));
  validateQuestionBank(bank); // Broken repository data is an infrastructure error.
  let result;
  try {
    result = { valid: true, ...parseSubmission(issue.body, bank) };
  } catch (error) {
    result = { valid: false, error: error.message };
  }
  const report = formatReport(result, runUrl);
  let ownComment;
  // Bound API work while paginating so reruns find the existing bot comment.
  for (let page = 1; page <= 20; page++) {
    const comments = await request('GET', `${route}/comments?per_page=100&page=${page}`);
    requireValue(Array.isArray(comments), 'Invalid comment list response.');
    ownComment = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot' && comment.body?.startsWith(COMMENT_MARKER));
    if (ownComment || comments.length < 100) break;
    requireValue(page < 20, 'Too many comments to safely find existing feedback.');
  }
  // An edit can arrive during validation or comment lookup. Its newer workflow
  // owns feedback; a stale run must not overwrite it or comment on closed issues.
  const latest = await request('GET', route);
  if (latest.body !== issue.body || latest.state !== 'open' || !isRailQuestion(latest)) {
    writeSummary('Submission changed or closed; skipped stale feedback. / 提交已更改或关闭，跳过过期反馈。\n');
    return { skipped: true };
  }
  if (ownComment) {
    requireValue(Number.isSafeInteger(ownComment.id) && ownComment.id > 0, 'Invalid feedback comment ID.');
    if (ownComment.body !== report) await request('PATCH', `/repos/${repository}/issues/comments/${ownComment.id}`, { body: report });
  } else {
    await request('POST', `${route}/comments`, { body: report });
  }
  writeSummary(report);
  return { valid: result.valid, skipped: false };
}

function githubRequest(token) {
  requireValue(token, 'GITHUB_TOKEN is required for issue feedback.');
  return async (method, route, body) => {
    // Routes are built from trusted repository context and validated numeric IDs,
    // never from issue-provided URLs. Do not log credentials or response bodies.
    const response = await fetch(`https://api.github.com${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    requireValue(response.ok, `GitHub API request failed (HTTP ${response.status}).`);
    return response.json();
  };
}

async function main() {
  const [mode, filename, ...extra] = process.argv.slice(2);
  requireValue(['--body', '--event'].includes(mode) && filename && extra.length === 0, 'Usage: node scripts/check-rail-question.mjs --body issue.md | --event event.json');
  if (mode === '--body') {
    const bank = JSON.parse(fs.readFileSync(bankUrl, 'utf8'));
    validateQuestionBank(bank);
    let result;
    try {
      result = { valid: true, ...parseSubmission(fs.readFileSync(filename, 'utf8'), bank) };
    } catch (error) {
      result = { valid: false, error: error.message };
    }
    process.stdout.write(formatReport(result));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  const event = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!isRailQuestion(event.issue) || event.issue.state !== 'open') {
    console.log('Unrelated or closed issue; no rail-question checks needed.');
    return;
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const result = await checkIssueEvent(event, {
    repository,
    runUrl: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    request: githubRequest(process.env.GITHUB_TOKEN),
    writeSummary: report => {
      if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    },
  });
  console.log(result.skipped ? 'Skipped stale issue feedback.' : result.valid ? 'Rail question structure passed; awaiting maintainer review.' : 'Rail question needs corrections; see issue feedback.');
  if (!result.skipped && !result.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Fetch/JSON errors may contain response details. Keep CI output generic.
    console.error('Rail question checker failed. Check the input file, repository data, and workflow token permissions.');
    process.exitCode = 1;
  });
}
