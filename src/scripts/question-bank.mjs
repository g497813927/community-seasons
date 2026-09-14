import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const bankUrl = new URL("../lib/game/rail-questions.json", import.meta.url);
const sourceUrl = new URL("../lib/game/railway.ts", import.meta.url);
const START = "// BEGIN GENERATED RAIL QUESTIONS";
const END = "// END GENERATED RAIL QUESTIONS";

function requireValue(condition, location, message) {
  if (!condition) throw new Error(`${location}: ${message}`);
}
function keys(value, expected, location, optional = []) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), location, "expected an object");
  requireValue(expected.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => expected.includes(key) || optional.includes(key)), location, `expected fields: ${expected.join(", ")}`);
}
function copy(value, location, enLimit, zhLimit) {
  keys(value, ["en", "zh"], location);
  for (const [locale, limit] of [["en", enLimit], ["zh", zhLimit]]) {
    const text = value[locale];
    requireValue(typeof text === "string" && text.trim() === text && text.length > 0, `${location}.${locale}`, "use non-empty text without surrounding whitespace");
    requireValue(text.length <= limit, `${location}.${locale}`, `keep within ${limit} characters for the game layout`);
  }
}

export function validateQuestionBank(bank) {
  keys(bank, ["$schema", "version", "contentNote", "questions"], "bank");
  requireValue(bank.$schema === "./rail-questions.schema.json", "bank.$schema", "keep the local schema reference");
  requireValue(bank.version === 1, "bank.version", "expected version 1");
  copy(bank.contentNote, "bank.contentNote", 300, 150);
  requireValue(Array.isArray(bank.questions) && bank.questions.length >= 4, "bank.questions", "at least four questions are required for a cart ride");
  const ids = new Set();
  const prompts = { en: new Set(), zh: new Set() };
  for (const [index, question] of bank.questions.entries()) {
    const at = `questions[${index}]`;
    keys(question, ["id", "topic", "prompt", "options", "correctIndex"], at, ["source"]);
    if (question.source !== undefined) {
      const s = question.source;
      keys(s, ["accountName", "accountUrl", "url", "publishedDate", "dateType", "title", "section", "note"], `${at}.source`);
      requireValue(/^https:\/\/(?:www\.bilibili\.com\/opus|t\.bilibili\.com)\/[0-9]+$/.test(s.url), `${at}.source.url`, "use a canonical Bilibili dynamic URL");
      requireValue(/^https:\/\/space\.bilibili\.com\/[0-9]+$/.test(s.accountUrl), `${at}.source.accountUrl`, "use the source account URL");
      requireValue(/^\d{4}-\d{2}-\d{2}$/.test(s.publishedDate), `${at}.source.publishedDate`, "use YYYY-MM-DD");
      requireValue(["published", "edited"].includes(s.dateType), `${at}.source.dateType`, "identify whether the displayed date is published or edited");
      for (const key of ["accountName", "title", "section"]) requireValue(typeof s[key] === "string" && s[key].trim().length > 0 && s[key].length <= 240, `${at}.source.${key}`, "provide concise source information");
      copy(s.note, `${at}.source.note`, 400, 200);
    }
    for (const key of ["id", "topic"]) {
      requireValue(typeof question[key] === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(question[key]), `${at}.${key}`, "use a lowercase hyphenated identifier");
    }
    requireValue(!ids.has(question.id), `${at}.id`, `duplicate id: ${question.id}`);
    ids.add(question.id);
    copy(question.prompt, `${at}.prompt`, 180, 90);
    for (const locale of ["en", "zh"]) {
      const text = question.prompt[locale].toLowerCase();
      requireValue(!prompts[locale].has(text), `${at}.prompt.${locale}`, "duplicate question text");
      prompts[locale].add(text);
    }
    requireValue(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 2, `${at}.correctIndex`, "use 0, 1, or 2 (the option index, not a fixed lane)");
    requireValue(Array.isArray(question.options) && question.options.length === 3, `${at}.options`, "exactly three answer options are required");
    const labels = { en: new Set(), zh: new Set() };
    for (const [optionIndex, option] of question.options.entries()) {
      const optionAt = `${at}.options[${optionIndex}]`;
      keys(option, ["label", "why"], optionAt);
      copy(option.label, `${optionAt}.label`, 72, 36);
      copy(option.why, `${optionAt}.why`, 240, 120);
      for (const locale of ["en", "zh"]) {
        const text = option.label[locale].toLowerCase();
        requireValue(!labels[locale].has(text), `${optionAt}.label.${locale}`, "answer labels must be distinct");
        labels[locale].add(text);
      }
    }
  }
  return bank;
}

export function renderQuestionBank(bank) {
  validateQuestionBank(bank);
  // Source cases are review material only. The game and its share cards receive
  // fictional adaptations, never the original titles, people, places, or links.
  const questions = bank.questions.map(({ source, ...question }) => question);
  return `${START}\n// Edit lib/game/rail-questions.json, then run npm run questions:sync.\n// Fictional, redacted teaching examples; not official moderation decisions.\nexport const RAIL_QUESTIONS: readonly RailQuestion[] = ${JSON.stringify(questions, null, 2)};\n${END}`;
}

function main() {
  const flag = process.argv[2] ?? "--check";
  requireValue(["--check", "--write"].includes(flag) && process.argv.length <= 3, "command", "use --check or --write");
  const bank = validateQuestionBank(JSON.parse(fs.readFileSync(bankUrl, "utf8")));
  const source = fs.readFileSync(sourceUrl, "utf8");
  const begin = source.indexOf(START);
  const end = source.indexOf(END, begin);
  requireValue(begin >= 0 && end > begin, "railway.ts", "generated question markers are missing");
  const next = source.slice(0, begin) + renderQuestionBank(bank) + source.slice(end + END.length);
  if (flag === "--write" && next !== source) fs.writeFileSync(sourceUrl, next);
  else requireValue(next === source, "railway.ts", "JSON has changed; run npm run questions:sync");
  console.log(`Question bank valid: ${bank.questions.length} bilingual questions; game data synchronized.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
