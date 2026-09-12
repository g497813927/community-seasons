import type { ObstacleKind } from "./engine";
export interface Bilingual {
  en: string;
  zh: string;
}
export interface CommunityLesson {
  id: string;
  title: Bilingual;
  label: Bilingual;
  example: Bilingual;
  why: Bilingual;
  response: Bilingual;
  rewrite: Bilingual;
}
// Original fictional examples: no case identifiers, real usernames, or raw slurs.
export const LESSONS: readonly CommunityLesson[] = [
  {
    id: "personal-attack",
    title: {
      en: "Personal attack",
      zh: "人身攻击",
    },
    label: {
      en: "INSULTS",
      zh: "人身攻击",
    },
    example: {
      en: "You are [insult]. Stop posting.",
      zh: "你就是[辱骂]，别发言了。",
    },
    why: {
      en: "This targets a person instead of addressing their idea.",
      zh: "这段话攻击个人，而不是回应观点。",
    },
    response: {
      en: "Do not retaliate. Report the abusive post and leave the exchange.",
      zh: "不对骂，举报攻击内容，退出争执。",
    },
    rewrite: {
      en: "I disagree with this claim because…",
      zh: "我不同意这个观点，因为……",
    },
  },
  {
    id: "group-hostility",
    title: {
      en: "Group-based hostility",
      zh: "群体贬损",
    },
    label: {
      en: "GROUP HATE",
      zh: "群体贬损",
    },
    example: {
      en: "Everyone from [group] is [slur]. They do not belong here.",
      zh: "[某群体]都是[贬损词]，不配在这里。",
    },
    why: {
      en: "It reduces an entire group to a demeaning label and excludes people by identity.",
      zh: "它用蔑称概括整个群体，并因身份排斥他人。",
    },
    response: {
      en: "Report the hostility without repeating or spreading the label.",
      zh: "举报群体攻击，不复述、不扩散蔑称。",
    },
    rewrite: {
      en: "This specific behavior causes harm because…",
      zh: "这个具体行为会造成伤害，因为……",
    },
  },
  {
    id: "threat",
    title: {
      en: "Threats and intimidation",
      zh: "威胁恐吓",
    },
    label: {
      en: "THREATS",
      zh: "威胁恐吓",
    },
    example: {
      en: "Keep disagreeing and I will [violent threat].",
      zh: "再反对我就[威胁内容]。",
    },
    why: {
      en: "Threatening harm makes a discussion unsafe; disagreement does not justify intimidation.",
      zh: "以伤害相威胁会破坏安全交流；意见不同不是恐吓的理由。",
    },
    response: {
      en: "Keep evidence, block and report. Seek help if there is an immediate real-world danger.",
      zh: "保留证据，拉黑并举报；如有现实紧急危险，及时求助。",
    },
    rewrite: {
      en: "I am stepping away from this conversation.",
      zh: "我先退出这次讨论。",
    },
  },
  {
    id: "privacy",
    title: {
      en: "Sharing private information",
      zh: "隐私泄露",
    },
    label: {
      en: "PRIVACY",
      zh: "隐私泄露",
    },
    example: {
      en: "Their home address is [address removed]. Go find them.",
      zh: "他的住址是[地址已遮挡]，去找他。",
    },
    why: {
      en: "Private information is exposed without consent and used to direct attention at someone.",
      zh: "未经同意公开私人信息，并引导他人针对当事人。",
    },
    response: {
      en: "Report the disclosure. Do not repost the address, even to condemn it.",
      zh: "举报泄露行为；即使为了谴责，也不要转发地址。",
    },
    rewrite: {
      en: "Discuss the public claim without sharing private details.",
      zh: "只讨论公开观点，不公开私人信息。",
    },
  },
  {
    id: "pile-on",
    title: {
      en: "Coordinated harassment",
      zh: "煽动围攻",
    },
    label: {
      en: "PILE-ON",
      zh: "煽动围攻",
    },
    example: {
      en: "Everyone spam [user] until they leave the community.",
      zh: "大家去刷屏[某用户]，直到他退网。",
    },
    why: {
      en: "This recruits people to harass someone rather than debate a claim.",
      zh: "这是组织他人骚扰个人，而不是讨论观点。",
    },
    response: {
      en: "Do not join the pile-on. Report the call to harass.",
      zh: "不参与围攻，举报煽动骚扰的内容。",
    },
    rewrite: {
      en: "Share your own disagreement respectfully; do not mobilize a crowd.",
      zh: "尊重地表达自己的不同意见，不号召围攻。",
    },
  },
  {
    id: "unsupported-claim",
    title: {
      en: "An accusation without evidence",
      zh: "未经核实的指控",
    },
    label: {
      en: "FALSE CLAIM",
      zh: "无据指控",
    },
    example: {
      en: "[Person] definitely stole it. No evidence needed—share this!",
      zh: "[某人]肯定偷了，不用证据，快转发！",
    },
    why: {
      en: "An unsupported accusation is presented as a fact and amplified. Asking questions is different.",
      zh: "把缺乏证据的指控当作事实传播，与提出问题不同。",
    },
    response: {
      en: "Check reliable sources and context before sharing. Report deliberate harmful fabrication.",
      zh: "先核实可靠来源与上下文，再决定是否分享；举报恶意有害捏造。",
    },
    rewrite: {
      en: "I cannot verify this. Is there a reliable source?",
      zh: "我还无法核实，有可靠来源吗？",
    },
  },
  {
    id: "scam",
    title: {
      en: "Scam and account-theft bait",
      zh: "诈骗与盗号诱导",
    },
    label: {
      en: "SCAM BAIT",
      zh: "诈骗诱导",
    },
    example: {
      en: "Free coins! Send your login verification code to [account removed].",
      zh: "免费金币！把登录验证码发给[账号已遮挡]。",
    },
    why: {
      en: "A reward is used to lure someone into exposing account access.",
      zh: "用奖励诱导他人交出账号访问凭证。",
    },
    response: {
      en: "Never share login codes. Check offers in the official app and report the bait.",
      zh: "不交出登录验证码；通过官方应用核实活动，并举报诱导内容。",
    },
    rewrite: {
      en: "Check this offer through the official app; keep your codes private.",
      zh: "请通过官方应用核实活动，并保管好验证码。",
    },
  },
  {
    id: "shock-bait",
    title: {
      en: "Graphic shock bait",
      zh: "不适内容诱导",
    },
    label: {
      en: "SHOCK BAIT",
      zh: "猎奇诱导",
    },
    example: {
      en: "A surprise for your feed: [graphic material removed].",
      zh: "给你一个惊喜：[强刺激画面已遮挡]。",
    },
    why: {
      en: "Disturbing material is pushed without suitable context or regard for the audience.",
      zh: "缺乏适当背景、不顾受众地展示强刺激内容，可能造成伤害。",
    },
    response: {
      en: "Stop viewing and report unsuitable content. Do not forward it as a joke.",
      zh: "停止观看，举报不适内容，不以玩笑为由转发。",
    },
    rewrite: {
      en: "Describe the topic calmly and use suitable context instead of shock material.",
      zh: "平和说明主题，提供适当背景，避免以刺激画面吸引注意。",
    },
  },
];
export function getLesson(obstacle: { id: number; kind: ObstacleKind }): CommunityLesson {
  const offset = { block: 0, arch: 2, pillar: 4, roots: 6 }[obstacle.kind];
  return LESSONS[(Math.abs(Math.trunc(obstacle.id)) * 31 + offset) % LESSONS.length];
}
export function localized(text: Bilingual, locale: "en" | "zh-CN") {
  return locale === "zh-CN" ? text.zh : text.en;
}
export const GUIDELINES_URL = "https://www.bilibili.com/blackboard/blackroomrule_v17.html";
export const CASES_URL = "https://www.bilibili.com/blackroom/ban";

export interface LessonReference {
  kind: "case" | "archive";
  url: string;
  title: Bilingual;
  note: Bilingual;
  verifiedOn: string;
}

export const CASE_REFERENCE_NOTICE: Bilingual = {
  en: "The game examples are fictional. These links open related real cases published by Bilibili; their facts and wording can differ from the lesson. Do not contact or harass anyone involved.",
  zh: "游戏示例为虚构内容。以下链接通往哔哩哔哩公开的相关真实案例，具体事实和措辞可能与关卡不同。请勿联系或骚扰涉事人员。",
};

// Canonical links were read from the public archive and each detail page was
// opened and checked on this date. Only neutral summaries are kept here.
// A related case illustrates a behavior; it is not the source of our fiction.
export const LESSON_REFERENCES: Readonly<Record<string, LessonReference>> = {
  "personal-attack": {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4339707",
    title: { en: "Real case: repeated personal attacks", zh: "真实案例：持续人身攻击" },
    note: {
      en: "The published case describes repeated personal attacks made through several accounts. The in-game insult is a fictional example.",
      zh: "公示案情涉及通过多个账号持续发布人身攻击。游戏里的辱骂示例为虚构内容。",
    },
    verifiedOn: "2026-09-07",
  },
  "group-hostility": {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4453194",
    title: { en: "Real case: hostility toward player groups", zh: "真实案例：攻击玩家群体" },
    note: {
      en: "This case describes insulting a group of game players and manipulating reactions through multiple accounts. It is a related example, not the fictional group shown in the lesson.",
      zh: "该案例涉及辱骂游戏玩家群体，并通过多个账号操纵他人反应。它是相关案例，并非关卡中的虚构群体。",
    },
    verifiedOn: "2026-09-07",
  },
  threat: {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4177256",
    title: {
      en: "Real case: abusive attacks and death wishes",
      zh: "真实案例：恶意辱骂与死亡诅咒",
    },
    note: {
      en: "The case describes repeated abusive attacks and death wishes through multiple accounts. Bilibili classifies it as personal attacks. It is a related example of hostile intimidation; the summary does not establish a stated intent to physically harm someone. The lesson's threat is fictional.",
      zh: "案情涉及通过多个账号反复辱骂他人，并使用死亡诅咒；平台分类为“发布人身攻击言论”。这是敌意恐吓的相关案例，公示摘要未证实明确表示将亲自实施暴力伤害。关卡中的威胁示例为虚构内容。",
    },
    verifiedOn: "2026-09-08",
  },
  privacy: {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4175673",
    title: {
      en: "Real case: threats to expose private information",
      zh: "真实案例：以曝光隐私相威胁",
    },
    note: {
      en: "The official case concerns attempts to obtain sensitive private material and threats to expose personal and family information. The summary does not establish that disclosure actually occurred. No real personal details are reproduced in the game.",
      zh: "官方案情涉及索取敏感隐私材料，并在遭拒后威胁曝光个人及家属信息；公示摘要未证实实际公开隐私。游戏未转载任何真实个人信息。",
    },
    verifiedOn: "2026-09-08",
  },
  "pile-on": {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4268407",
    title: {
      en: "Real case: staged conflict through multiple accounts",
      zh: "真实案例：操纵多账号制造冲突",
    },
    note: {
      en: "The operator used alternate accounts to provoke conflict and a main account to condemn those same accounts. Bilibili classifies this as inflammatory comments. It illustrates manipulation of community conflict; the summary does not establish that other people were recruited to harass someone. The lesson's crowd-directed wording is fictional.",
      zh: "案情涉及操纵多个小号反串引战，再用大号抨击自己的小号；平台分类为“发布引战言论”。它展示了操纵社区冲突的行为，公示摘要未证实招募其他人实施围攻。关卡中号召他人刷屏的措辞为虚构内容。",
    },
    verifiedOn: "2026-09-08",
  },
  "unsupported-claim": {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4158016",
    title: { en: "Real case: a fabricated accusation", zh: "真实案例：伪造指控" },
    note: {
      en: "The published investigation describes an impersonating account and misleading screenshots used to implicate another person. The lesson's theft accusation is fictional.",
      zh: "公示调查说明了冒充账号与误导截图被用来嫁祸他人的过程。关卡中的偷窃指控为虚构内容。",
    },
    verifiedOn: "2026-09-07",
  },
  scam: {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4464686",
    title: { en: "Real case: a fake coin giveaway", zh: "真实案例：虚假赠送硬币骗局" },
    note: {
      en: "This case describes coin-giveaway bait that directs people to an unknown app and seeks personal and financial information. The game's login-code example is fictional.",
      zh: "该案例涉及以赠送硬币为诱饵，引导下载不明应用并窃取个人及财产相关信息。游戏里的验证码示例为虚构内容。",
    },
    verifiedOn: "2026-09-07",
  },
  "shock-bait": {
    kind: "case",
    url: "https://www.bilibili.com/blackroom/ban/4221831",
    title: {
      en: "Real case: graphic content using cartoon characters",
      zh: "真实案例：借卡通形象传播血腥暴力内容",
    },
    note: {
      en: "The official summary describes graphic, violent and cruel material made with familiar cartoon characters that harmed young audiences. Bilibili classifies it as harmful content for minors. It illustrates this lesson's concern about disturbing material and its audience; the in-game example remains fictional.",
      zh: "官方案情涉及以经典卡通形象制作、传播血腥暴力及残酷内容，影响未成年人身心健康；公示类别为“发布青少年不良内容”。该案例对应本关对强刺激内容及受众影响的讨论，游戏示例仍为虚构。",
    },
    verifiedOn: "2026-09-08",
  },
};

const ARCHIVE_REFERENCE: LessonReference = {
  kind: "archive",
  url: CASES_URL,
  title: { en: "Browse the official case archive", zh: "浏览官方案例公示" },
  note: {
    en: "No individual case has been matched to this lesson. This link opens the general archive.",
    zh: "此关卡尚未匹配具体案例；该链接打开的是案例公示列表。",
  },
  verifiedOn: "2026-09-07",
};

export function getLessonReference(id: string): LessonReference {
  return Object.hasOwn(LESSON_REFERENCES, id) ? LESSON_REFERENCES[id] : ARCHIVE_REFERENCE;
}
