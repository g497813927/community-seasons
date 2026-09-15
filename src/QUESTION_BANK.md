# Contribute and maintain railway questions / 铁路题库贡献与维护

[English](QUESTION_BANK.md) | [简体中文](QUESTION_BANK.zh-CN.md)

## Submit a question

Use the [railway question issue form](https://github.com/g497813927/community-seasons/issues/new?template=rail-question.yml) to propose one new question or correction per issue. You do not need to clone the repository or edit its documents or JSON. Corrections must include the complete replacement question, including both languages and all three choices.

- Select new question or correction. For a new question, propose an unused stable `id`; for a correction, use the existing ID from [`lib/game/rail-questions.json`](lib/game/rail-questions.json). IDs and topics start with a lowercase letter and use lowercase letters or digits separated by single hyphens, such as `respectful-disagreement`.
- Fill in English and Simplified Chinese prompts, exactly three bilingual choices, and a separate bilingual explanation for every choice, including incorrect answers. Keep the translations equivalent and exactly one answer defensible.
- Select correct option **1, 2 or 3** in form order. Maintainers map these to JSON `correctIndex` **0, 1 or 2**; gameplay shuffles the answer lanes.
- Optional review notes and source references are for maintainer review only. They are not imported into gameplay; maintainers verify any source metadata before adding it to the review JSON. Use fictional, redacted scenarios without real names or account identities in question text.

| Text | English limit | Simplified Chinese limit |
| --- | --- | --- |
| Prompt | 180 characters | 90 characters |
| Each choice label | 72 characters | 36 characters |
| Each choice explanation | 240 characters | 120 characters |

After submission, **Check rail question** posts or updates its own bot feedback comment and writes an Actions summary. It checks required fields, IDs, translations, duplicate prompts and choices, answer selection and the bank's text limits. Fix the issue body to rerun the check; keep the form's field headings. The check also runs when an issue is reopened. Unrelated issues are skipped. The workflow becomes active once merged into the default branch.

A passing check confirms structure only. Maintainers still review educational accuracy, translation quality and source suitability; an issue is never automatically imported or published. See the [CI guide](../docs/CI.md) for workflow details. For an optional offline check, save the issue body as Markdown and run this from the repository root:

```sh
node scripts/check-rail-question.mjs --body /path/to/issue.md
```

## Maintainer integration

After review, maintainers integrate accepted content into **`lib/game/rail-questions.json`**, the source for the game's question bank. Keep an existing question's ID when correcting it and manually review optional `source` metadata. All examples are fictional teaching scenarios; they do not quote real users or claim to reproduce official moderation decisions.

贡献者请通过[铁路题目 Issue 表单](https://github.com/g497813927/community-seasons/issues/new?template=rail-question.yml)提交，每个 Issue 包含一道完整双语题目，无需修改文件。自动检查通过后仍需人工审阅；维护者将采纳的内容整合到 **`lib/game/rail-questions.json`**。完整中文流程见[简体中文题库指南](QUESTION_BANK.zh-CN.md)。

Each question has:

| Field / 字段 | Meaning / 含义 |
| --- | --- |
| `id` | Stable unique identifier; keep it when editing an existing question. / 唯一标识；修改原题时保留。 |
| `topic` | Topic for review and organization. / 便于审阅和整理的主题。 |
| `prompt.en`, `prompt.zh` | English and Simplified Chinese question. / 英文及简体中文题干。 |
| `options` | Exactly three choices in JSON order. / 按 JSON 顺序排列的三个选项。 |
| `options[].label.en`, `.zh` | Choice text in both languages. / 双语选项文本。 |
| `options[].why.en`, `.zh` | Explanation shown when this choice is selected, including for wrong choices. / 选择该项后的双语解析，错误选项也需提供。 |
| `correctIndex` | **0 = first option, 1 = second, 2 = third.** / **0 为第一项，1 为第二项，2 为第三项。** |
| `source` (optional / 可选) | Review-only source dynamic, account, date, section, and an adaptation note. Excluded from the game and share cards. / 仅供审阅的来源动态、账号、日期、段落及改编说明，不进入游戏及分享卡片。 |

The bank contains fictional scenarios and fictional adaptations inspired by public governance dynamics. For source-backed adaptations, `source.dateType` distinguishes a publication date from a displayed edit date. Source accounts, real events, real names, and links stay in this review JSON; the generated game only contains the adapted questions and answers.

题库包含虚构情境题，以及依据公开治理动态改编的虚构题。有来源的改编题通过 `source.dateType` 区分发布时间与页面显示的编辑时间。来源账号、真实事件、真实姓名和链接仅保留在审阅 JSON 中，游戏只使用改编后的题目和答案。

`correctIndex` is **not a fixed left/center/right lane**: the game shuffles the options for each question. A cart ride still draws 3–4 distinct questions. Adding questions expands the pool without lengthening a ride.

`correctIndex` **不对应固定的左、中、右轨道**：游戏会打乱选项顺序。每次小列车仍随机抽取 3–4 道不重复的题；增加题库不会延长单次答题。

The session deck protects recently shown questions across retries and refills. Preserve that protection when editing question selection or reshuffling: a retry must not discard recent-question history or consume questions the player has not yet seen.

会话题组会在重试和补充题目时保留近期出题保护。修改抽题或重新洗牌逻辑时，必须保留这项保护：重试不得丢弃近期出题记录，也不得消耗玩家尚未看到的题目。

After an answer is judged, **Share lesson** creates a card in the current language using the fictional question, its correct answer, and that answer’s explanation. Obstacle review dialogs offer the same feature with their redacted example and suggested response. Opening a railway card pauses the run; after closing it, press Resume when ready. Cards use Toy’s default game QR code and contain no real-case source links or account identities. Nothing is shared or saved automatically.

答案判定后，可点击**分享这道题**，用当前语言将虚构题干、正确答案及其解析生成学习卡。障碍物观察站也可以通过**分享这份提醒**分享脱敏示例和建议做法。打开铁路学习卡会暂停游戏，关闭后准备好再继续。卡片使用 Toy 默认游戏二维码，不包含真实案例链接或来源账号身份，也不会自动发送或保存。

Keep both translations equivalent, exactly one defensible correct answer, and a reason specific to every choice. Keep labels short for phone screens. Use placeholders such as `[insult]` / `[侮辱词]` for sensitive content. Do not add real names or unverified case links.

请保持双语含义一致、每题只有一个明确正确答案，并为每个选项提供对应解析。选项应简短，适合手机屏幕；敏感内容使用 `[侮辱词]` 等占位符，不添加真实姓名或未经核实的案例链接。

After integrating a reviewed question, run these commands from the repository root:

```sh
npm --prefix src run questions:sync
npm --prefix src run questions:validate
npm test
npm run build
```

`npm run dev` and `npm run build` synchronize the JSON automatically before starting. If you edit JSON while the dev server is already running, run `npm --prefix src run questions:sync` from the repository root to update the game. Invalid JSON, missing translations, duplicate IDs, duplicate choices, invalid answer indexes, or excessively long text fail validation with a field location. Validation checks structure, not whether an answer is educationally correct; review the content before publishing.

`npm run dev` 和 `npm run build` 启动前会自动同步 JSON。开发服务器运行时修改 JSON，请在仓库根目录再运行一次 `npm --prefix src run questions:sync`。格式错误、翻译缺失、标识或选项重复、答案索引错误以及文本过长，都会报告具体字段。自动校验只检查结构，题意和答案仍需人工审阅后发布。

The `RAIL_QUESTIONS` section inside `lib/game/railway.ts` is generated. Edit the JSON rather than that generated section; the rest of the railway logic is unchanged.

`lib/game/railway.ts` 内的 `RAIL_QUESTIONS` 区段由脚本生成。请编辑 JSON，避免直接修改生成的区段。
