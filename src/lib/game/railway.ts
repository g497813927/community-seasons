export interface RailCopy {
  en: string;
  zh: string;
}
export interface RailOption {
  label: RailCopy;
  why: RailCopy;
}
export interface RailQuestion {
  id: string;
  topic: string;
  prompt: RailCopy;
  options: [RailOption, RailOption, RailOption];
  correctIndex: 0 | 1 | 2;
}
export interface RailQuestionDeck {
  remaining: string[];
  recent: string[];
}
export interface RailRide {
  elapsed: number;
  // Optional for existing in-memory rides after a hot reload. New rides latch
  // these from normal run progression, excluding temporary speed boosters.
  speed?: number;
  entryNormalSpeed?: number;
  phase: "boarding" | "question" | "feedback" | "falling" | "complete";
  questions: string[];
  questionDeck?: RailQuestionDeck;
  index: number;
  remaining: number;
  duration: number;
  optionOrder: [number, number, number];
  answerLane: number | null;
  correct: boolean | null;
  correctCount: number;
  failure: { questionId: string; optionIndex: number; correctIndex: number } | null;
  reward: number;
}
// BEGIN GENERATED RAIL QUESTIONS
// Edit lib/game/rail-questions.json, then run npm run questions:sync.
// Fictional, redacted teaching examples; not official moderation decisions.
export const RAIL_QUESTIONS: readonly RailQuestion[] = [
  {
    "id": "respectful-disagreement",
    "prompt": {
      "en": "You disagree with a review. Which reply keeps the discussion respectful?",
      "zh": "你不同意一篇测评，哪种回复更尊重他人？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Explain your different evidence.",
          "zh": "说明你的不同依据。"
        },
        "why": {
          "en": "Addressing the argument with evidence makes disagreement useful.",
          "zh": "针对观点提供依据，可以让分歧变成有益讨论。"
        }
      },
      {
        "label": {
          "en": "Call the author [insult].",
          "zh": "骂作者是[侮辱词]。"
        },
        "why": {
          "en": "Insulting the author attacks a person instead of discussing the evidence.",
          "zh": "辱骂作者是在攻击个人，而不是讨论观点与依据。"
        }
      },
      {
        "label": {
          "en": "Ask everyone to flood their inbox.",
          "zh": "号召大家刷爆对方私信。"
        },
        "why": {
          "en": "Organizing unwanted messages is harassment, even when you disagree.",
          "zh": "即使观点不同，组织刷私信仍属于骚扰。"
        }
      }
    ],
    "topic": "respectful-discussion"
  },
  {
    "id": "private-address",
    "prompt": {
      "en": "A post shares someone’s home address without permission. What should you do?",
      "zh": "动态未经同意公开了他人的住址，你应该怎么做？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Report it without reposting the address.",
          "zh": "举报，不再传播地址。"
        },
        "why": {
          "en": "Reporting while limiting exposure helps protect the person’s privacy.",
          "zh": "举报并减少传播，有助于保护当事人的隐私。"
        }
      },
      {
        "label": {
          "en": "Quote the full address as a warning.",
          "zh": "转发完整地址提醒大家。"
        },
        "why": {
          "en": "Repeating private details spreads the exposure, even with good intentions.",
          "zh": "即使出于提醒，重复私人信息也会扩大泄露。"
        }
      },
      {
        "label": {
          "en": "Ask strangers to visit that address.",
          "zh": "让陌生人去那个地址。"
        },
        "why": {
          "en": "Directing others to a private address escalates the privacy and safety harm.",
          "zh": "引导他人前往私人住址，会加重隐私和安全风险。"
        }
      }
    ],
    "topic": "privacy"
  },
  {
    "id": "login-code",
    "prompt": {
      "en": "A stranger offers a prize but asks for your login code. Which response is safer?",
      "zh": "陌生人说你中奖了，却索要登录验证码，哪种回应更安全？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Keep the code private; verify and report.",
          "zh": "不提供验证码，核实并举报。"
        },
        "why": {
          "en": "Login codes protect your account. Verify prizes through official channels.",
          "zh": "登录验证码用于保护账号，中奖信息应通过官方渠道核实。"
        }
      },
      {
        "label": {
          "en": "Send the code to claim the prize.",
          "zh": "发送验证码领取奖品。"
        },
        "why": {
          "en": "Sharing a login code can give someone else access to your account.",
          "zh": "交出登录验证码，可能让对方进入你的账号。"
        }
      },
      {
        "label": {
          "en": "Forward the offer to other users.",
          "zh": "把中奖消息转发给别人。"
        },
        "why": {
          "en": "An unverified offer asking for login codes can spread a scam to others.",
          "zh": "传播索要验证码的未核实消息，可能让更多人受骗。"
        }
      }
    ],
    "topic": "account-security"
  },
  {
    "id": "coordinated-pile-on",
    "prompt": {
      "en": "A comment says “Everyone spam this user until they leave.” What is the problem?",
      "zh": "评论里有人说“大家一起刷屏，把这个人赶走”，问题是什么？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It organizes harassment of a person.",
          "zh": "这是组织针对个人的骚扰。"
        },
        "why": {
          "en": "Coordinating repeated unwanted contact can intimidate someone out of a community.",
          "zh": "组织持续骚扰，会迫使他人无法正常参与社区。"
        }
      },
      {
        "label": {
          "en": "It is harmless because many agree.",
          "zh": "只要赞同的人多，就没有问题。"
        },
        "why": {
          "en": "The size of a group does not make targeted harassment acceptable.",
          "zh": "参与人数多，并不能让针对他人的骚扰变得合理。"
        }
      },
      {
        "label": {
          "en": "It is fine if every message is short.",
          "zh": "每条消息很短，就可以这样做。"
        },
        "why": {
          "en": "Many short messages can still form a deliberate harassment campaign.",
          "zh": "大量短消息同样可能构成有组织的骚扰。"
        }
      }
    ],
    "topic": "harassment"
  },
  {
    "id": "threatening-message",
    "prompt": {
      "en": "Someone posts “I will find you and [harm you].” What is the safest next step?",
      "zh": "有人发动态说“我要找到你并[伤害你]”，下一步应怎么做？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Preserve evidence and report the threat.",
          "zh": "保留证据，举报威胁。"
        },
        "why": {
          "en": "Save evidence and use reporting or safety channels rather than escalating. Seek urgent help if there is immediate danger.",
          "zh": "保留证据并通过举报或安全渠道处理，避免升级冲突；如有紧迫危险，应及时求助。"
        }
      },
      {
        "label": {
          "en": "Reply with a more serious threat.",
          "zh": "回复更严重的威胁。"
        },
        "why": {
          "en": "Threatening back escalates danger and adds another harmful message.",
          "zh": "以威胁回应威胁，会升级危险并制造新的伤害。"
        }
      },
      {
        "label": {
          "en": "Share their private details in revenge.",
          "zh": "公开对方隐私进行报复。"
        },
        "why": {
          "en": "Retaliatory exposure creates another privacy violation instead of resolving the threat.",
          "zh": "报复性公开隐私会造成新的侵害，不能解决威胁。"
        }
      }
    ],
    "topic": "threats"
  },
  {
    "id": "identity-targeting",
    "prompt": {
      "en": "A comment says a whole identity group deserves [harm]. Which description fits?",
      "zh": "评论称某个身份群体都应该遭受[伤害]，应如何理解？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It targets a group with harmful hostility.",
          "zh": "这是针对群体的有害敌意。"
        },
        "why": {
          "en": "Calling for harm against people because of their identity goes beyond criticizing an idea.",
          "zh": "因身份而鼓吹伤害一个群体，超出了对观点的批评。"
        }
      },
      {
        "label": {
          "en": "It is only a review of someone’s work.",
          "zh": "这只是对作品的评价。"
        },
        "why": {
          "en": "The comment targets people’s identity, not the content of their work.",
          "zh": "这条评论针对的是群体身份，而不是作品内容。"
        }
      },
      {
        "label": {
          "en": "Adding “just joking” makes it harmless.",
          "zh": "加一句“开玩笑”就没关系。"
        },
        "why": {
          "en": "A joking disclaimer does not remove a harmful call aimed at a group.",
          "zh": "“开玩笑”的声明，不能消除针对群体鼓吹伤害的问题。"
        }
      }
    ],
    "topic": "group-hostility"
  },
  {
    "id": "unverified-rumor",
    "prompt": {
      "en": "An accusation names someone but provides no evidence. Which reply helps?",
      "zh": "一条指名指控没有提供证据，哪种回复更有帮助？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Ask for reliable sources; avoid spreading it.",
          "zh": "询问可靠来源，避免扩散。"
        },
        "why": {
          "en": "Check evidence and context before repeating claims about a person.",
          "zh": "在重复涉及他人的指控前，应核查证据与上下文。"
        }
      },
      {
        "label": {
          "en": "Repeat it as a proven fact.",
          "zh": "把指控当成事实继续传播。"
        },
        "why": {
          "en": "Repetition can harm someone’s reputation without establishing that the claim is true.",
          "zh": "未经核实的重复传播，可能损害他人声誉，却不能证明指控属实。"
        }
      },
      {
        "label": {
          "en": "Invent extra details to support it.",
          "zh": "编造更多细节来支持指控。"
        },
        "why": {
          "en": "Invented details create misinformation and can intensify harm.",
          "zh": "编造细节会制造虚假信息，并可能加重伤害。"
        }
      }
    ],
    "topic": "misinformation"
  },
  {
    "id": "redacted-content",
    "prompt": {
      "en": "You want to discuss an abusive comment. How can you share context responsibly?",
      "zh": "你想讨论一条辱骂评论，怎样更负责地提供上下文？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Redact private details and explain the issue.",
          "zh": "遮盖隐私并说明问题。"
        },
        "why": {
          "en": "Limited, redacted context supports learning without amplifying personal exposure or abuse.",
          "zh": "适度提供经过遮盖的上下文，有助于学习，也能减少隐私泄露和辱骂传播。"
        }
      },
      {
        "label": {
          "en": "Display the author’s phone number.",
          "zh": "展示作者的手机号码。"
        },
        "why": {
          "en": "A phone number is private information and is not needed to explain why a comment is abusive.",
          "zh": "手机号码属于私人信息，解释辱骂问题并不需要公开它。"
        }
      },
      {
        "label": {
          "en": "Invite everyone to insult the author.",
          "zh": "邀请大家一起辱骂作者。"
        },
        "why": {
          "en": "Responding to abuse with a pile-on creates more harassment.",
          "zh": "用围攻辱骂回应不当言论，会造成更多骚扰。"
        }
      }
    ],
    "topic": "responsible-sharing"
  },
  {
    "id": "specific-work-criticism",
    "topic": "respectful-criticism",
    "prompt": {
      "en": "A comment says, “The editing makes this tutorial hard to follow.” How should you assess this comment?",
      "zh": "一条评论写道：“剪辑让这个教程很难看懂。”应如何判断这条评论？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It criticizes the work without attacking the person.",
          "zh": "它在批评作品，没有攻击个人。"
        },
        "why": {
          "en": "Specific criticism of a work can be respectful even when it is negative. This comment addresses the editing, not the creator’s worth.",
          "zh": "负面评价也可以是尊重他人的具体批评。这条评论针对剪辑，而非贬低创作者的人格。"
        }
      },
      {
        "label": {
          "en": "Any negative review is personal harassment.",
          "zh": "任何负面评价都是人身骚扰。"
        },
        "why": {
          "en": "Disliking a work is not the same as harassing its creator. Look at what the comment targets and how it is expressed.",
          "zh": "不喜欢作品不等于骚扰创作者，应看评论针对什么、如何表达。"
        }
      },
      {
        "label": {
          "en": "The creator may insult the reviewer in return.",
          "zh": "创作者可以用辱骂回击测评者。"
        },
        "why": {
          "en": "A critical review does not justify personal insults. A useful reply can address the editing choices or ask for a specific example.",
          "zh": "批评不能成为辱骂他人的理由。可以回应剪辑思路，或请对方举出具体例子。"
        }
      }
    ]
  },
  {
    "id": "fandom-rivalry",
    "topic": "fandom-disagreement",
    "prompt": {
      "en": "Two fan groups disagree about an actor’s performance. Which reply keeps the debate about the performance?",
      "zh": "两个粉丝群体对演员的表演有分歧，哪种回复仍在讨论表演本身？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "“Only [insult] would be fans of this actor.”",
          "zh": "“只有[侮辱词]才会粉这个演员。”"
        },
        "why": {
          "en": "This attacks people for being fans instead of explaining a view about the performance. Fandom rivalry does not excuse insults.",
          "zh": "这在攻击粉丝，而不是解释对表演的看法。粉圈分歧不能成为辱骂的理由。"
        }
      },
      {
        "label": {
          "en": "“The pauses in that scene felt unnatural to me.”",
          "zh": "“那场戏的停顿让我觉得不自然。”"
        },
        "why": {
          "en": "This offers a specific, subjective observation about the acting. Others can disagree without turning the discussion into attacks on fans.",
          "zh": "这提出了针对表演的具体主观感受，他人可以反驳，而不必攻击粉丝群体。"
        }
      },
      {
        "label": {
          "en": "“Find rival fans and fill their pages with insults.”",
          "zh": "“找出对家粉丝，去他们主页刷骂。”"
        },
        "why": {
          "en": "Sending people to target other fans creates harassment. It contributes nothing to evaluating the actor’s performance.",
          "zh": "号召他人去针对粉丝会制造骚扰，对评价演员的表演没有帮助。"
        }
      }
    ]
  },
  {
    "id": "cropped-quote-context",
    "topic": "misleading-screenshots",
    "prompt": {
      "en": "A screenshot cuts “I do not support” from a quote, reversing its meaning. What should you do before judging its author?",
      "zh": "一张截图删掉了引语中的“我不支持”，使原意相反。评价作者前应怎么做？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Treat the cropped image as the complete statement.",
          "zh": "把裁剪后的截图当成完整表态。"
        },
        "why": {
          "en": "The missing words reverse the meaning. Judging from the crop would attribute a position the author did not express.",
          "zh": "被删掉的词改变了原意，仅凭裁剪图判断，会把作者没表达的立场强加给对方。"
        }
      },
      {
        "label": {
          "en": "Share it first and correct it only if challenged.",
          "zh": "先转发，等有人质疑再更正。"
        },
        "why": {
          "en": "A later correction may not reach everyone who saw the misleading image. Check the full statement before amplifying it.",
          "zh": "后续更正未必能触达看过误导截图的人，应先核对完整表述再传播。"
        }
      },
      {
        "label": {
          "en": "Check the full quote and explain the missing context.",
          "zh": "核对完整引语，说明被删掉的语境。"
        },
        "why": {
          "en": "Restoring the missing context lets people assess what was actually said. Keep any explanation focused on the evidence.",
          "zh": "补回缺失语境，才能判断对方实际说了什么；说明问题时应围绕证据。"
        }
      }
    ]
  },
  {
    "id": "unwanted-dm-persistence",
    "topic": "private-message-boundaries",
    "prompt": {
      "en": "A member says, “Please stop messaging me.” You still want an explanation. What is the respectful response?",
      "zh": "一名成员说“请别再私信我”，但你仍想要解释。怎样回应更尊重对方？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Stop contacting them and respect their boundary.",
          "zh": "停止联系，尊重对方的边界。"
        },
        "why": {
          "en": "Wanting an answer does not entitle you to continued contact. If there is a genuine safety concern, use an appropriate reporting channel.",
          "zh": "想得到答复，不代表可以持续联系对方。如确有安全问题，可通过适当的举报渠道处理。"
        }
      },
      {
        "label": {
          "en": "Use a new account to get around their block.",
          "zh": "换个账号绕过对方的拉黑。"
        },
        "why": {
          "en": "Changing accounts does not reset someone’s request for no contact. It deliberately overrides an expressed boundary.",
          "zh": "换账号不会让“停止联系”的要求失效，这仍是在故意越过对方明确的边界。"
        }
      },
      {
        "label": {
          "en": "Send polite reminders every hour until they reply.",
          "zh": "每小时礼貌提醒，直到对方回复。"
        },
        "why": {
          "en": "Polite wording does not make repeated unwanted messages welcome. The person has already asked you to stop.",
          "zh": "措辞礼貌，也不能让对方不愿接收的反复私信变得合适；对方已经要求停止。"
        }
      }
    ]
  },
  {
    "id": "regional-stereotype",
    "topic": "stereotyping",
    "prompt": {
      "en": "Someone dismisses a member’s evidence by saying, “People from [region] always lie.” What is a better response?",
      "zh": "有人用“[某地区]的人都爱撒谎”否定一名成员的证据，怎样回应更合适？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Make the same claim about another region.",
          "zh": "用同样的话攻击另一个地区。"
        },
        "why": {
          "en": "Answering one stereotype with another repeats the same unfair treatment. It does not evaluate the evidence.",
          "zh": "用另一种地域刻板印象回击，只会重复不公平的对待，并没有评价证据。"
        }
      },
      {
        "label": {
          "en": "Assess the evidence, not the person’s region.",
          "zh": "评价证据，不以对方的地域下结论。"
        },
        "why": {
          "en": "A person’s region does not establish whether their claim is true. Discuss the sources and reasoning rather than stereotyping a group.",
          "zh": "一个人的地域不能证明其说法真假。应讨论来源和推理，而不是给整个群体贴标签。"
        }
      },
      {
        "label": {
          "en": "Accept it if the stereotype is widely repeated.",
          "zh": "只要这种说法常见，就可以接受。"
        },
        "why": {
          "en": "Repeating a stereotype does not turn it into evidence. Common claims can still unfairly target a whole group.",
          "zh": "重复出现的刻板印象不会因此成为证据；常见说法同样可能不公平地针对整个群体。"
        }
      }
    ]
  },
  {
    "id": "retaliatory-reports",
    "topic": "reporting-in-good-faith",
    "prompt": {
      "en": "A post politely disagrees with you and breaks no stated rule. A friend suggests mass-reporting it. What should you do?",
      "zh": "一条动态礼貌地反对你，也未违反明确规则。朋友建议集体举报，你应怎么做？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Choose an unrelated report reason to remove it.",
          "zh": "随便选个无关理由，让动态被删。"
        },
        "why": {
          "en": "An invented report reason misrepresents the post. Reporting should identify an actual concern, not serve as a tool for retaliation.",
          "zh": "编造举报理由会歪曲动态内容。举报应反映实际问题，而不是用来报复。"
        }
      },
      {
        "label": {
          "en": "Recruit more accounts to make the report look valid.",
          "zh": "找更多账号举报，让它显得有问题。"
        },
        "why": {
          "en": "The number of reports does not establish wrongdoing. Coordinating false reports can silence a legitimate disagreement.",
          "zh": "举报数量不能证明违规；组织虚假举报可能压制正常的不同意见。"
        }
      },
      {
        "label": {
          "en": "Decline; disagreement alone is not a report reason.",
          "zh": "拒绝；观点不同本身不是举报理由。"
        },
        "why": {
          "en": "Keep reporting tied to actual conduct and relevant rules. You can respond respectfully, mute the discussion, or move on.",
          "zh": "举报应针对实际行为和相关规则。你可以尊重地回应、屏蔽讨论，或不再参与。"
        }
      }
    ]
  },
  {
    "id": "impersonating-a-member",
    "topic": "impersonation",
    "prompt": {
      "en": "An account pretends to be another member and posts insults under their name. What makes this harmful?",
      "zh": "一个账号冒充另一名成员，以对方的名义发出辱骂言论。问题是什么？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It falsely attributes harmful words to another person.",
          "zh": "把有害言论冒充成另一个人说的话。"
        },
        "why": {
          "en": "Pretending to be someone else can mislead readers and damage that person’s reputation. Assess the false identity and the messages together.",
          "zh": "冒充他人可能误导读者并损害当事人的声誉，应结合虚假身份和发布内容判断。"
        }
      },
      {
        "label": {
          "en": "Using their name is fine if no photo is copied.",
          "zh": "只要没复制照片，用对方名字就没问题。"
        },
        "why": {
          "en": "A name and a false claim of identity can mislead people without a copied photo. Look at whether the account is pretending to be that person.",
          "zh": "即使没有复制照片，名字和虚假身份声明也可能误导他人。应看账号是否在冒充当事人。"
        }
      },
      {
        "label": {
          "en": "It is acceptable if the person is unpopular.",
          "zh": "只要对方不受欢迎，就可以这样做。"
        },
        "why": {
          "en": "Disliking someone does not justify putting words in their mouth. Criticize actual conduct without inventing statements under their identity.",
          "zh": "不喜欢一个人，不能成为冒充其发言的理由。应针对实际行为提出批评，而不是以其身份编造言论。"
        }
      }
    ]
  },
  {
    "id": "targeted-hostile-username",
    "topic": "harassment-in-profiles",
    "prompt": {
      "en": "An account named “[user] is [insult]” keeps commenting on that user’s posts. Even if the comments are polite, what is the issue?",
      "zh": "一个账号用“[某用户]是[侮辱词]”作昵称，反复在对方动态下评论。即使评论本身很客气，问题是什么？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "It is fine if the comments themselves are polite.",
          "zh": "只要评论本身客气，就没有问题。"
        },
        "why": {
          "en": "A visible username still delivers a targeted insult. Polite comments do not cancel the insulting name shown alongside them.",
          "zh": "昵称会随评论一起展示，仍在传达针对个人的侮辱。评论语气客气，也不能消除昵称中的攻击。"
        }
      },
      {
        "label": {
          "en": "The username itself repeatedly targets a person.",
          "zh": "昵称本身就在反复针对个人。"
        },
        "why": {
          "en": "Harassment can appear in names, avatars, or profiles as well as posts. Here the account keeps displaying an insult aimed at a user.",
          "zh": "骚扰不仅会出现在动态中，也可能出现在昵称、头像或简介里。这里的账号在持续展示针对用户的侮辱。"
        }
      },
      {
        "label": {
          "en": "It becomes acceptable if others find it funny.",
          "zh": "只要别人觉得好笑，就可以这样做。"
        },
        "why": {
          "en": "Other people’s amusement does not remove the targeted insult. A joke can still make someone unwelcome in a community.",
          "zh": "旁人的笑声不能消除针对个人的侮辱，玩笑也可能让他人难以正常参与社区。"
        }
      }
    ]
  },
  {
    "id": "support-without-amplifying",
    "topic": "bystander-support",
    "prompt": {
      "en": "A member is being mocked and asks people not to repost the attack. Which response supports them?",
      "zh": "一名成员遭到嘲讽，并请求大家不要转发攻击内容。哪种做法更能支持对方？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Repost the attack with their name to rally attention.",
          "zh": "带上对方姓名转发攻击，吸引关注。"
        },
        "why": {
          "en": "This amplifies the attack against their expressed wishes. Support should not create more unwanted exposure.",
          "zh": "这违背了对方明确的意愿，也扩大了攻击内容的传播。支持不应制造更多不必要的曝光。"
        }
      },
      {
        "label": {
          "en": "Demand that they explain their distress publicly.",
          "zh": "要求对方公开解释为什么难受。"
        },
        "why": {
          "en": "A person does not owe a public account of their distress. Pressuring them can add another burden while they are being targeted.",
          "zh": "当事人没有义务公开解释自己的痛苦；在其受到针对时施压，可能增加负担。"
        }
      },
      {
        "label": {
          "en": "Offer support without spreading the attack.",
          "zh": "提供支持，不扩散攻击内容。"
        },
        "why": {
          "en": "Respect their wishes, avoid repeating the abuse, and offer help they can choose to accept. Report the harmful content through the proper channel.",
          "zh": "尊重对方意愿，不重复辱骂，提供由对方自主决定是否接受的帮助，并通过适当渠道举报有害内容。"
        }
      }
    ]
  },
  {
    "id": "humiliating-face-edit",
    "topic": "nonconsensual-humiliation",
    "prompt": {
      "en": "Someone puts a classmate’s face into a humiliating meme. The classmate objects, but others call it “just an edit.” What helps?",
      "zh": "有人把同学的脸做成羞辱性表情包。同学反对后，别人说“只是剪辑”。怎样做更合适？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Stop sharing it and support its removal.",
          "zh": "停止传播，并支持移除这张图。"
        },
        "why": {
          "en": "An edited image can still humiliate a real person. Calling it an edit does not remove the harm or the person’s objection.",
          "zh": "经过编辑的图片仍可能羞辱真实的人。“只是剪辑”不能消除伤害，也不能无视当事人的反对。"
        }
      },
      {
        "label": {
          "en": "Keep sharing because the picture is not real.",
          "zh": "图片不是真的，所以可以继续传。"
        },
        "why": {
          "en": "The image being fabricated does not make its impact fictional. Reposting it extends the humiliation of the person depicted.",
          "zh": "图片是虚构的，不代表影响也是虚构的。继续转发会扩大对被描绘者的羞辱。"
        }
      },
      {
        "label": {
          "en": "Make a more humiliating edit of the editor.",
          "zh": "给制图者做一张更羞辱的图片。"
        },
        "why": {
          "en": "Retaliating with another humiliating image repeats the harm. Removing and reporting the original is a more constructive response.",
          "zh": "以另一张羞辱性图片报复，只会重复伤害。推动删除并举报原内容，是更有建设性的处理。"
        }
      }
    ]
  },
  {
    "id": "good-faith-correction",
    "topic": "mistakes-and-corrections",
    "prompt": {
      "en": "A member posted the wrong event date, then clearly corrected it after checking. Which reply encourages accurate discussion?",
      "zh": "一名成员写错了活动日期，核实后已明确更正。哪种回复有助于准确讨论？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Keep circulating the old post as proof they always lie.",
          "zh": "继续转发旧动态，证明对方一直在撒谎。"
        },
        "why": {
          "en": "One corrected mistake does not establish a pattern of dishonesty. Sharing the old version without the correction also misleads readers.",
          "zh": "一次已更正的错误不能证明对方一贯不诚实；只传旧版本、不提更正，也会误导读者。"
        }
      },
      {
        "label": {
          "en": "Acknowledge the correction and use the verified date.",
          "zh": "认可更正，使用已核实的日期。"
        },
        "why": {
          "en": "Recognizing a clear correction helps accurate information replace the mistake. You can still ask for the source without attacking the person.",
          "zh": "认可明确更正，有助于让准确信息替代错误。仍可以询问来源，而不必攻击个人。"
        }
      },
      {
        "label": {
          "en": "Require everyone to stop trusting anything they say.",
          "zh": "要求所有人不再相信对方的任何话。"
        },
        "why": {
          "en": "A blanket attack goes beyond the corrected error. Assess later claims by their evidence rather than treating a mistake as permanent disgrace.",
          "zh": "一概否定超出了这次已更正的错误。应依据证据评价后续说法，而不是让一次失误成为永久污点。"
        }
      }
    ]
  },
  {
    "id": "accessible-participation",
    "topic": "respectful-accessibility",
    "prompt": {
      "en": "A member asks for captions because they cannot hear the video. Which reply helps them participate respectfully?",
      "zh": "一名成员因无法听清视频而请求字幕，哪种回复有助于对方平等参与？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Mock them for needing a different format.",
          "zh": "嘲笑对方需要不同的观看方式。"
        },
        "why": {
          "en": "Mocking an access need targets the person instead of helping them join the discussion. Different formats can enable equal participation.",
          "zh": "嘲笑无障碍需求是在针对个人，而不是帮助其参与讨论。不同形式的信息可以支持平等参与。"
        }
      },
      {
        "label": {
          "en": "Tell them the discussion is only for people who hear.",
          "zh": "告诉对方，讨论只欢迎听得见的人。"
        },
        "why": {
          "en": "Excluding someone because they cannot hear creates an unnecessary barrier. The request is about accessing the same content.",
          "zh": "因对方无法听清而将其排除，会制造不必要的障碍。对方只是希望能获取同样的内容。"
        }
      },
      {
        "label": {
          "en": "Offer captions or a text summary if available.",
          "zh": "如有条件，提供字幕或文字摘要。"
        },
        "why": {
          "en": "An accessible alternative helps the member understand the content. If you cannot provide it, respond respectfully and say what is available.",
          "zh": "可访问的替代形式有助于对方理解内容。若暂时无法提供，也应尊重地回应并说明现有方式。"
        }
      }
    ]
  },
  {
    "id": "repeated-self-promotion",
    "topic": "spam-self-promotion",
    "prompt": {
      "en": "A creator pastes the same channel ad under many unrelated posts. What would improve their approach?",
      "zh": "创作者在许多无关动态下粘贴同一条频道广告，怎样做更合适？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Shorten the ad and keep posting it everywhere.",
          "zh": "缩短广告，继续到处发。"
        },
        "why": {
          "en": "Shorter wording does not fix repeated, unrelated promotion that disrupts discussions.",
          "zh": "字数变少，并不能解决反复发布无关推广、打断讨论的问题。"
        }
      },
      {
        "label": {
          "en": "Promote only where relevant and allowed; avoid repetition.",
          "zh": "只在相关且允许的地方推广，避免重复。"
        },
        "why": {
          "en": "Relevant promotion in spaces that allow it respects the discussion and other participants.",
          "zh": "在允许推广的相关场合适度介绍内容，才能尊重讨论和其他参与者。"
        }
      },
      {
        "label": {
          "en": "Use more accounts to repeat the same ad.",
          "zh": "换多个账号重复发同一广告。"
        },
        "why": {
          "en": "Spreading the same promotion across accounts adds more spam rather than making it relevant.",
          "zh": "换账号重复推广只会增加刷屏，并不会让内容变得相关。"
        }
      }
    ]
  },
  {
    "id": "graphic-content-bait",
    "topic": "graphic-content-bait",
    "prompt": {
      "en": "A post says “Click to see [graphic injury]” and pushes people to open a disturbing clip. What is a safer response?",
      "zh": "动态用“点开看[血腥伤害]”诱导大家观看不适片段，怎样回应更安全？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Repost the clip so everyone knows what to avoid.",
          "zh": "转发片段，提醒大家避雷。"
        },
        "why": {
          "en": "Reposting the disturbing clip exposes more people to it, even when the caption warns them.",
          "zh": "即使配上提醒，转发不适片段仍会让更多人接触到它。"
        }
      },
      {
        "label": {
          "en": "Challenge friends to watch it to prove their courage.",
          "zh": "让朋友观看，证明自己胆子大。"
        },
        "why": {
          "en": "Pressuring others to watch uses the same harmful bait and disregards their boundaries.",
          "zh": "逼别人观看是在延续这种诱导，也不尊重他人的边界。"
        }
      },
      {
        "label": {
          "en": "Avoid amplifying it and report the concerning post.",
          "zh": "不扩大传播，并举报这条问题动态。"
        },
        "why": {
          "en": "Reporting the post without redistributing the clip lets it be reviewed while limiting exposure.",
          "zh": "举报原动态而不转传片段，可以让内容接受审核，同时减少不必要的传播。"
        }
      }
    ]
  },
  {
    "id": "unwanted-sexual-remarks",
    "topic": "unwanted-sexual-remarks",
    "prompt": {
      "en": "Someone keeps posting [sexual remarks] at a user who has asked them to stop. What makes this inappropriate?",
      "zh": "对方已要求停止，有人仍不断向其发送[性暗示言论]，问题在哪里？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It ignores a boundary and continues unwanted sexual remarks.",
          "zh": "无视边界，持续发送对方不愿接受的性言论。"
        },
        "why": {
          "en": "Sexual comments do not become welcome because the sender calls them compliments. The request to stop must be respected.",
          "zh": "发送者称其为赞美，并不代表对方愿意接受。应尊重对方停止发送此类言论的要求。"
        }
      },
      {
        "label": {
          "en": "It is welcome if the sender adds a heart emoji.",
          "zh": "加上爱心表情，就算对方愿意接受。"
        },
        "why": {
          "en": "An emoji does not establish consent or cancel a clear request to stop.",
          "zh": "表情符号不能代表同意，也不能抵消明确的停止要求。"
        }
      },
      {
        "label": {
          "en": "Only pictures can cross this boundary, not words.",
          "zh": "只有图片会越界，文字不会。"
        },
        "why": {
          "en": "Unwanted sexual remarks can violate someone's boundaries without any pictures.",
          "zh": "即使没有图片，不受欢迎的性言论也可能侵犯他人的边界。"
        }
      }
    ]
  },
  {
    "id": "impersonated-support-qr",
    "topic": "scam-qr-impersonation",
    "prompt": {
      "en": "An account copying the support logo sends a QR code to “secure your account.” What should you do first?",
      "zh": "一个冒用客服标志的账号发来“保护账号”的二维码，首先应该怎么做？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Scan it because the logo looks official.",
          "zh": "标志像官方的，直接扫码。"
        },
        "why": {
          "en": "Logos can be copied. A familiar picture does not verify who sent the code or where it leads.",
          "zh": "标志可以被复制，熟悉的图片不能证明发送者身份或二维码去向。"
        }
      },
      {
        "label": {
          "en": "Open support independently in the official app to verify.",
          "zh": "自行打开官方应用的客服入口核实。"
        },
        "why": {
          "en": "An independently opened official channel avoids relying on the sender's QR code or claimed identity.",
          "zh": "自行进入官方渠道核实，避免依赖对方提供的二维码和自称的身份。"
        }
      },
      {
        "label": {
          "en": "Forward the QR code to friends to test it.",
          "zh": "转发二维码，让朋友帮忙试。"
        },
        "why": {
          "en": "Asking friends to test an unverified code can expose their accounts to the same risk.",
          "zh": "让朋友测试未经核实的二维码，可能把同样的风险带给他们。"
        }
      }
    ]
  },
  {
    "id": "screenshot-redaction-check",
    "topic": "safe-screenshot-redaction",
    "prompt": {
      "en": "You hid a chat username in a screenshot, but a notification shows a phone number. Before sharing, what should you do?",
      "zh": "聊天截图已遮住用户名，但通知栏还露着手机号。分享前应该怎么做？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Share it; hiding the username is enough.",
          "zh": "用户名遮住了，直接分享。"
        },
        "why": {
          "en": "Notifications and other parts of a screenshot can reveal private details even when the username is hidden.",
          "zh": "即使用户名已遮住，通知栏等其他区域仍可能泄露私人信息。"
        }
      },
      {
        "label": {
          "en": "Add a translucent mark over the number.",
          "zh": "在号码上加一个半透明标记。"
        },
        "why": {
          "en": "A translucent mark may leave the number readable. Privacy protection should not depend on people overlooking it.",
          "zh": "半透明标记可能仍让号码清晰可见，不能依赖别人没有注意到来保护隐私。"
        }
      },
      {
        "label": {
          "en": "Cover all private details opaquely; check the exported image.",
          "zh": "完全遮盖所有隐私，并检查导出的图片。"
        },
        "why": {
          "en": "Check the entire exported image, including notifications. Use permanent, opaque covers or remove unnecessary private areas.",
          "zh": "检查导出图片的全部区域，包括通知栏；使用不透明的永久遮盖，或裁去不必要的隐私区域。"
        }
      }
    ]
  },
  {
    "id": "giveaway-engagement-bait",
    "topic": "misleading-giveaway-bait",
    "prompt": {
      "en": "A post guarantees a prize for tagging 100 people but gives no rules or organizer details. What is the warning sign?",
      "zh": "动态保证“艾特100人就有奖”，却没有活动规则或主办方信息。警示信号是什么？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "An unverified reward is being used to demand engagement.",
          "zh": "用未经核实的奖励诱导大量互动。"
        },
        "why": {
          "en": "A guaranteed reward without clear rules or an identifiable organizer is a reason to verify independently before participating.",
          "zh": "没有明确规则和可核实的主办方，却保证发奖，应先通过独立渠道核实再参与。"
        }
      },
      {
        "label": {
          "en": "Many replies prove that the prize is genuine.",
          "zh": "回复很多，就证明奖品是真的。"
        },
        "why": {
          "en": "High engagement shows that people reacted; it does not establish that a reward exists or will be delivered.",
          "zh": "互动多只能说明有人参与，不能证明奖品存在或一定会兑现。"
        }
      },
      {
        "label": {
          "en": "A friend's repost makes verification unnecessary.",
          "zh": "朋友转发过，就不用核实。"
        },
        "why": {
          "en": "Friends can also share unverified claims. Their repost is not evidence of the giveaway's terms or reliability.",
          "zh": "朋友也可能转发未经核实的消息，转发本身不能证明活动条款或可靠性。"
        }
      }
    ]
  },
  {
    "id": "malicious-help-link",
    "topic": "malicious-links-disguised-as-help",
    "prompt": {
      "en": "A “helpful” reply says to install an unknown extension and disable browser protection to fix login. What is safer?",
      "zh": "一条“热心帮助”让你安装陌生扩展、关闭浏览器防护来修复登录，怎样更安全？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Disable protection only until the extension is installed.",
          "zh": "只在安装扩展时暂时关闭防护。"
        },
        "why": {
          "en": "Temporarily disabling protection still exposes you during installation, when untrusted software can gain access.",
          "zh": "临时关闭防护仍会在安装时暴露风险，让不可信的软件获得访问机会。"
        }
      },
      {
        "label": {
          "en": "Try it with another account on the same browser.",
          "zh": "在同一浏览器换个账号试试。"
        },
        "why": {
          "en": "An extension may access browser data beyond the account used to test it. Switching accounts does not make it trustworthy.",
          "zh": "扩展可能访问测试账号以外的浏览器数据，换账号并不能让它变得可信。"
        }
      },
      {
        "label": {
          "en": "Keep protection on and use official troubleshooting help.",
          "zh": "保持防护开启，使用官方排查指引。"
        },
        "why": {
          "en": "Use help reached independently through the official service. Do not install unknown software or weaken protection on a stranger's request.",
          "zh": "自行通过官方服务查找帮助，不因陌生人的要求安装未知软件或降低防护。"
        }
      }
    ]
  },
  {
    "id": "private-chat-repost-consent",
    "topic": "private-chat-consent",
    "prompt": {
      "en": "A friend shares a personal story in a private chat. You want to repost it publicly. What should come first?",
      "zh": "朋友在私信中分享了个人经历，你想公开转发。首先应该做什么？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Remove their avatar and publish without asking.",
          "zh": "去掉头像，不询问就发布。"
        },
        "why": {
          "en": "The story itself may identify your friend. Removing an avatar does not replace permission to share a private conversation.",
          "zh": "经历本身也可能让人认出朋友，去掉头像不能代替公开私信所需的同意。"
        }
      },
      {
        "label": {
          "en": "Ask permission and agree on what can be shared or redacted.",
          "zh": "先征得同意，商量分享范围和遮盖内容。"
        },
        "why": {
          "en": "Consent should cover public sharing and its scope. If your friend declines, respect that decision and keep the chat private.",
          "zh": "应明确征得公开分享及其范围的同意；如果朋友拒绝，就尊重决定，保留私信的私密性。"
        }
      },
      {
        "label": {
          "en": "Publish first because the story was sent to you.",
          "zh": "对方发给了你，所以可以先发布。"
        },
        "why": {
          "en": "Receiving a private message does not mean its sender agreed to a public audience.",
          "zh": "收到一条私信，并不代表发送者同意让所有人看到。"
        }
      }
    ]
  },
  {
    "id": "quotation-versus-endorsement",
    "topic": "quotation-context",
    "prompt": {
      "en": "A post quotes a short, redacted hateful phrase to explain why it is harmful. What should you consider when reviewing it?",
      "zh": "动态引用一小段已隐去敏感信息的仇恨言论，解释其危害。判断时应考虑什么？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Any quotation automatically means agreement.",
          "zh": "只要引用，就一定是在赞同。"
        },
        "why": {
          "en": "Quoting a claim to criticize it is different from endorsing it. Review the surrounding explanation and purpose.",
          "zh": "引用并批评一种说法，与赞同它不同。应结合前后说明和引用目的判断。"
        }
      },
      {
        "label": {
          "en": "Calling it criticism makes any amount of abuse acceptable.",
          "zh": "说是在批评，就能随意传播辱骂内容。"
        },
        "why": {
          "en": "An educational label is not a free pass. Unnecessary repetition or targeting can still amplify harm.",
          "zh": "“用于教育”并非通行证，不必要的重复或针对他人仍可能扩大伤害。"
        }
      },
      {
        "label": {
          "en": "Context, purpose, and whether harmful material is limited.",
          "zh": "结合语境、目的及有害内容是否被适度限制。"
        },
        "why": {
          "en": "Look for a clear distinction between the quoted claim and the author's position, with only the context needed to explain the harm.",
          "zh": "判断作者是否明确区分被引用言论与自己的立场，并只保留解释问题所需的适量内容。"
        }
      }
    ]
  },
  {
    "id": "moderation-appeal",
    "topic": "moderation-appeal",
    "prompt": {
      "en": "You believe your post was removed by mistake. How can you challenge the decision constructively?",
      "zh": "你认为自己的动态被误删了，怎样更合理地提出异议？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Ask followers to target the moderator.",
          "zh": "号召粉丝去围攻审核人员。"
        },
        "why": {
          "en": "Targeting a moderator creates harassment and does not explain why the original decision should be reconsidered.",
          "zh": "围攻审核人员会制造骚扰，也无法说明原决定为何需要重新考虑。"
        }
      },
      {
        "label": {
          "en": "Use the appeal channel and explain the relevant context.",
          "zh": "通过申诉渠道说明相关事实和上下文。"
        },
        "why": {
          "en": "A clear appeal can identify a possible mistake and provide evidence without attacking the people reviewing it.",
          "zh": "清晰的申诉可以指出可能的误判并提供依据，无需攻击处理问题的人。"
        }
      },
      {
        "label": {
          "en": "Use new accounts to repost it until moderation gives up.",
          "zh": "换新账号反复重发，直到审核放弃。"
        },
        "why": {
          "en": "Repeated evasion bypasses review and can disrupt the community. It does not resolve the disputed decision.",
          "zh": "反复绕过处理会干扰社区，也不能解决对原决定的争议。"
        }
      }
    ]
  },
  {
    "id": "heated-thread-deescalation",
    "topic": "de-escalation",
    "prompt": {
      "en": "A debate is getting heated and you feel ready to lash out. Which next step can help calm it down?",
      "zh": "讨论越来越激烈，你也快要忍不住骂人。下一步需要怎么做才能有助于缓解？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Pause, then address one specific point respectfully.",
          "zh": "先暂停，再平和地回应一个具体观点。"
        },
        "why": {
          "en": "Taking time to cool down and focusing on a specific point reduces personal conflict. You can also leave the discussion.",
          "zh": "先让情绪平复，再聚焦具体观点，有助于减少人身冲突；也可以选择退出讨论。"
        }
      },
      {
        "label": {
          "en": "Post one final insult with a few letters censored.",
          "zh": "最后骂一句，把几个字打上码。"
        },
        "why": {
          "en": "Censoring a few letters does not change a message's insulting intent or prevent escalation.",
          "zh": "遮住几个字并不能改变辱骂意图，也无法避免冲突升级。"
        }
      },
      {
        "label": {
          "en": "Tag a crowd to pressure the other person to concede.",
          "zh": "艾特一群人，逼对方认输。"
        },
        "why": {
          "en": "Bringing a crowd to pressure someone can turn a disagreement into a pile-on instead of resolving the point.",
          "zh": "叫来一群人施压，可能把分歧变成围攻，而不是解决观点上的问题。"
        }
      }
    ]
  },
  {
    "id": "adapted-spliced-disaster-footage",
    "topic": "misleading-disaster-footage",
    "prompt": {
      "en": "A post joins unrelated landslide clips and labels them “today in [our town].” What should you do before reposting?",
      "zh": "动态拼接几段无关的山体滑坡画面，标成“[本地]今天的现场”。转发前应怎么做？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Add an urgent warning and repost immediately.",
          "zh": "加上紧急提醒，立即转发。"
        },
        "why": {
          "en": "An urgent caption does not verify when or where footage was recorded. Unchecked warnings can spread false information.",
          "zh": "紧急标题不能证明拍摄时间和地点。未经核实的提醒可能传播错误信息。"
        }
      },
      {
        "label": {
          "en": "Check the clips’ origins and current local notices.",
          "zh": "核对画面出处和当地最新通告。"
        },
        "why": {
          "en": "Verify the date, place, and context through reliable sources before presenting footage as a current local event.",
          "zh": "把画面当作当地最新事件传播前，应通过可靠来源核对时间、地点和语境。"
        }
      },
      {
        "label": {
          "en": "Trust it because several clips show the same hazard.",
          "zh": "多段画面都是滑坡，就相信它。"
        },
        "why": {
          "en": "Similar-looking clips can come from unrelated events. Putting them together does not prove the claimed time or location.",
          "zh": "相似画面可能来自无关事件。拼接在一起，不能证明所称的时间或地点。"
        }
      }
    ]
  },
  {
    "id": "adapted-ai-clip-without-context",
    "topic": "ai-content-context",
    "prompt": {
      "en": "An AI-edited clip makes [a speaker] appear to fall. A repost calls it real news and removes the AI note. What is wrong?",
      "zh": "AI改编片段让[演讲者]看起来摔倒了。转发者去掉AI说明，称其为真实新闻。问题是什么？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "The repost presents a synthetic event as a real one.",
          "zh": "转发把合成事件当作真实事件传播。"
        },
        "why": {
          "en": "Keep the synthetic nature clear and check the original footage. A realistic edit is not evidence that the depicted event happened.",
          "zh": "应清楚说明内容经过合成，并核对原始画面。剪辑看起来逼真，不代表其中的事件真实发生。"
        }
      },
      {
        "label": {
          "en": "Realistic visuals prove that the event happened.",
          "zh": "画面足够逼真，就证明事件发生过。"
        },
        "why": {
          "en": "Realistic appearance is not verification. Edited footage can depict actions that were absent from the original.",
          "zh": "外观逼真不等于经过核实。经过修改的画面可以呈现原片中没有的行为。"
        }
      },
      {
        "label": {
          "en": "The original AI note makes every repost accurate.",
          "zh": "原动态说明过AI，所有转发就都准确。"
        },
        "why": {
          "en": "A new audience may never see the original note. Removing essential context can make a repost misleading.",
          "zh": "新的受众未必看到原动态说明。删除关键语境，会让转发内容具有误导性。"
        }
      }
    ]
  },
  {
    "id": "adapted-sculpture-discovery-claim",
    "topic": "misrepresented-object-context",
    "prompt": {
      "en": "A photo of an old sculpture is captioned “giant fossil discovered after yesterday’s storm.” What would help verify it?",
      "zh": "一张旧雕塑照片被配文“昨日暴雨后发现巨型化石”。怎样核实更有帮助？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Count how many people have shared the photo.",
          "zh": "统计有多少人转发了照片。"
        },
        "why": {
          "en": "Sharing counts measure attention, not the identity or history of the object. A repeated caption can still be wrong.",
          "zh": "转发量反映关注度，不能证明物体身份或历史。被重复传播的配文也可能是错的。"
        }
      },
      {
        "label": {
          "en": "Assume the dramatic caption describes the photo accurately.",
          "zh": "配文很震撼，就认定它准确描述了照片。"
        },
        "why": {
          "en": "A caption can invent a story around a genuine image. The image and the claim about it need separate checks.",
          "zh": "真实照片也可能被配上编造的故事。应分别核查图像和围绕它的说法。"
        }
      },
      {
        "label": {
          "en": "Find earlier images and reliable records of the object.",
          "zh": "查找更早的图片和可靠的物体记录。"
        },
        "why": {
          "en": "Earlier records can establish what the object is and whether it predates the claimed discovery. Verify the context, not just the photo.",
          "zh": "较早的记录有助于确认物体是什么、是否早于所称发现时间。既要看图片，也要核实语境。"
        }
      }
    ]
  },
  {
    "id": "adapted-building-misidentification",
    "topic": "visual-context-verification",
    "prompt": {
      "en": "A tilted-looking building is labeled “[our town’s library] has collapsed.” What should you check before spreading the claim?",
      "zh": "有人把一栋外形倾斜的建筑称作“[本地]图书馆倒塌了”。传播前应核实什么？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Only whether the photo looks frightening.",
          "zh": "只看照片是不是很吓人。"
        },
        "why": {
          "en": "An alarming appearance does not identify a building or establish structural damage. Design features can be misrepresented.",
          "zh": "外观令人担心，不能证明建筑身份或确实受损。设计特征也可能被歪曲。"
        }
      },
      {
        "label": {
          "en": "The building’s identity, location, design, and current status.",
          "zh": "建筑身份、地点、设计及当前状态。"
        },
        "why": {
          "en": "Check reliable descriptions and current information about the actual building. A wrong label can turn unusual architecture into a false disaster claim.",
          "zh": "应核对建筑的可靠介绍和最新信息。错误配文可能把特别的建筑造型说成虚假灾情。"
        }
      },
      {
        "label": {
          "en": "Whether the caption uses the word “breaking.”",
          "zh": "标题是否写着“突发”。"
        },
        "why": {
          "en": "A breaking-news label is not evidence. It does not replace checking the location and the claim.",
          "zh": "“突发”标签不是证据，不能代替对地点和事件的核查。"
        }
      }
    ]
  },
  {
    "id": "case-false-professional-authority",
    "topic": "false-professional-identity",
    "prompt": {
      "en": "An account invents a [professional qualification] to make its advice seem authoritative. What is the main problem?",
      "zh": "一个账号虚构[专业资质]，让自己的建议显得权威，主要问题是什么？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "It misleads readers about the source’s qualifications.",
          "zh": "它误导了读者对信息来源资质的判断。"
        },
        "why": {
          "en": "A professional-looking name does not prove qualifications. False credentials can make advice appear more trustworthy than its evidence warrants.",
          "zh": "看似专业的名称不能证明资质。虚假身份可能让建议显得比其证据实际支持的更可信。"
        }
      },
      {
        "label": {
          "en": "It is fine if the account uses technical vocabulary.",
          "zh": "只要用了专业术语，就没有问题。"
        },
        "why": {
          "en": "Technical words do not make an invented qualification real. Assess evidence and verify claimed credentials independently.",
          "zh": "专业术语不能让虚构资质变成真实资质。应核对证据，并独立验证对方声称的身份。"
        }
      },
      {
        "label": {
          "en": "Many followers prove the claimed qualification is real.",
          "zh": "粉丝多，就能证明所称资质真实。"
        },
        "why": {
          "en": "Popularity is not evidence of a professional qualification. A misleading identity can still attract a large audience.",
          "zh": "人气不能证明专业资质。误导性的身份同样可能吸引大量关注。"
        }
      }
    ]
  },
  {
    "id": "case-fabricated-hardship-donation",
    "topic": "fabricated-donation-appeals",
    "prompt": {
      "en": "An emotional donation post urges quick payment for [a relative’s illness]. What should you do before sending money?",
      "zh": "一条感人的募捐动态以[亲属患病]为由催促付款。转钱前应该做什么？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Donate immediately because the story feels sincere.",
          "zh": "故事看起来真诚，就马上捐钱。"
        },
        "why": {
          "en": "An emotional story is not verification. Fabricated hardship can exploit sympathy, so do not let urgency replace checking.",
          "zh": "感人的故事不等于经过核实。虚构困境可能利用同情心，不应因情绪或紧迫感而跳过核查。"
        }
      },
      {
        "label": {
          "en": "Verify the appeal through an independent trusted channel.",
          "zh": "通过独立、可信的渠道核实募捐。"
        },
        "why": {
          "en": "Check the organizer and claim independently rather than relying on the account’s own story or links. If it cannot be verified, do not rush to transfer.",
          "zh": "独立核实组织者与求助信息，不只依赖账号自身的叙述或链接。无法核实时，不要急于转账。"
        }
      },
      {
        "label": {
          "en": "Repost it widely so others can donate first.",
          "zh": "先广泛转发，让别人先捐。"
        },
        "why": {
          "en": "Spreading an unverified appeal can expose more people to loss. Other donors’ participation would not establish that the story is true.",
          "zh": "传播未经核实的募捐信息可能让更多人受损；其他人参与捐款也不能证明故事真实。"
        }
      }
    ]
  },
  {
    "id": "case-fake-verification-service",
    "topic": "misleading-verification-services",
    "prompt": {
      "en": "A service offers to get your account verified using fabricated application documents. What is the appropriate response?",
      "zh": "一项服务声称能用伪造材料帮你的账号获得认证，怎样回应更合适？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Try it if the seller shows a verification badge.",
          "zh": "卖家展示了认证标志，就可以试。"
        },
        "why": {
          "en": "A displayed badge does not make fabricated application materials legitimate. The offer still depends on misrepresenting identity.",
          "zh": "展示认证标志不能让伪造申请材料变得合理，这项服务仍建立在歪曲身份的基础上。"
        }
      },
      {
        "label": {
          "en": "Use false documents only for the first application.",
          "zh": "只在第一次申请时使用假材料。"
        },
        "why": {
          "en": "Using false materials once is still misleading. Verification should reflect accurate identity information, not a temporary fiction.",
          "zh": "只用一次假材料仍是在误导。认证应反映准确的身份信息，而不是临时编造的身份。"
        }
      },
      {
        "label": {
          "en": "Decline; use official verification with truthful materials.",
          "zh": "拒绝，按官方流程提交真实材料。"
        },
        "why": {
          "en": "Use the official process and truthful information. Report an offer that promotes fake documents instead of buying a misleading identity.",
          "zh": "通过官方流程提交真实信息。对于宣传假材料的服务，可以举报，而不是购买误导性的身份。"
        }
      }
    ]
  },
  {
    "id": "case-money-pressure-on-minors",
    "topic": "minors-and-payment-pressure",
    "prompt": {
      "en": "A stranger pressures a young user to send money or ask their parents for it. Which response is safer for the young user?",
      "zh": "陌生人催促未成年用户转钱，或向家长要钱。对这名用户而言，哪种回应更安全？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Stop the transfer, tell a trusted adult, and report it.",
          "zh": "停止转账，告知可信赖的成年人并举报。"
        },
        "why": {
          "en": "Pressure to obtain money is a warning sign. A trusted adult can help check the request; do not let the sender rush or isolate you.",
          "zh": "催促筹钱是警示信号。可信赖的成年人可以帮助核实，不要让对方逼你仓促行动或独自承担。"
        }
      },
      {
        "label": {
          "en": "Borrow a parent’s payment account without asking.",
          "zh": "不告知家长，借用其支付账号。"
        },
        "why": {
          "en": "Using someone else’s account does not make the request safe and can create further harm. Pause and seek help instead.",
          "zh": "使用他人的支付账号不会让要求变得安全，还可能造成进一步损失。应暂停操作并寻求帮助。"
        }
      },
      {
        "label": {
          "en": "Send a small amount first to prove you trust them.",
          "zh": "先付一小笔，证明你信任对方。"
        },
        "why": {
          "en": "Even a small transfer can cause loss and invite further demands. Payment is not a way to verify a stranger’s claims.",
          "zh": "小额转账同样可能造成损失，并招来进一步索要。付款不能用来验证陌生人的说法。"
        }
      }
    ]
  },
  {
    "id": "case-shock-in-child-craft-video",
    "topic": "disturbing-material-in-child-content",
    "prompt": {
      "en": "A child-oriented craft cartoon suddenly inserts [disturbing imagery]. What should a responsible creator do?",
      "zh": "面向儿童的手工动画突然插入[惊吓画面]，负责任的创作者应该怎么做？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Keep the surprise because children will watch longer.",
          "zh": "为了让儿童看得更久，保留这个惊吓。"
        },
        "why": {
          "en": "Holding attention does not justify exposing a child audience to disturbing material hidden inside otherwise suitable content.",
          "zh": "吸引注意力不能成为理由，在原本适合儿童的内容中隐藏惊吓画面，可能给儿童带来伤害。"
        }
      },
      {
        "label": {
          "en": "Remove the imagery and keep the content suitable for children.",
          "zh": "移除这些画面，保持内容适合儿童观看。"
        },
        "why": {
          "en": "Consider the audience and context. A craft or cartoon format does not make inserted disturbing imagery appropriate for children.",
          "zh": "应考虑受众和语境。手工或动画的形式，并不能让插入的惊吓画面变得适合儿童。"
        }
      },
      {
        "label": {
          "en": "Change only the title to say the video is harmless.",
          "zh": "只把标题改成“无害”，保留画面。"
        },
        "why": {
          "en": "A reassuring title does not change what appears in the video. The actual content needs to be suitable for its intended audience.",
          "zh": "让人放心的标题不会改变视频中的画面，实际内容必须适合其面向的受众。"
        }
      }
    ]
  },
  {
    "id": "case-vague-live-reward-rules",
    "topic": "manipulative-live-tipping",
    "prompt": {
      "en": "A group stream hints at special rewards for gifts but keeps the rules unclear. Why should viewers be cautious?",
      "zh": "团播暗示刷礼物可获特殊福利，却始终不说明规则。观众为什么应当谨慎？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "A larger gift will make the missing rules clear.",
          "zh": "礼物刷得更多，缺失的规则自然会清楚。"
        },
        "why": {
          "en": "Paying more does not establish what was promised. Unclear terms can continue to pressure viewers into further spending.",
          "zh": "多付款不能证明对方承诺了什么。不清晰的规则可能继续促使观众增加消费。"
        }
      },
      {
        "label": {
          "en": "Popular streams do not need to explain reward rules.",
          "zh": "人气高的直播间不需要说明福利规则。"
        },
        "why": {
          "en": "Popularity does not replace clear terms. Viewers still need accurate information before deciding whether to spend.",
          "zh": "人气不能代替清晰规则。观众在决定是否消费前，仍需要准确的信息。"
        }
      },
      {
        "label": {
          "en": "Vague promises can pressure spending without clear terms.",
          "zh": "模糊承诺可能诱导用户在规则不明时消费。"
        },
        "why": {
          "en": "Do not let suggestive promises substitute for clear rules. You can stop spending and report misleading inducements through the platform.",
          "zh": "不要用暗示性承诺代替明确规则。可以停止消费，并通过平台举报误导性诱导。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-loyalty-test",
    "topic": "manufactured-group-conflict",
    "prompt": {
      "en": "A post says anyone who will not insult a rival community is a traitor. How should you respond?",
      "zh": "一条动态声称，不辱骂另一圈子的成员就是背叛自己人。怎样回应更合适？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Insult the other community to prove your loyalty.",
          "zh": "辱骂另一圈子，以此证明自己的忠诚。"
        },
        "why": {
          "en": "Belonging to a community does not require hostility toward others. This demand replaces discussion with pressure to attack a group.",
          "zh": "属于一个圈子，并不意味着必须敌视其他人。这种要求用攻击群体的压力取代了讨论。"
        }
      },
      {
        "label": {
          "en": "Reject the loyalty test; discuss the actual issue.",
          "zh": "拒绝这种忠诚测试，回到具体问题。"
        },
        "why": {
          "en": "You can disagree or support your community without demeaning another one. Evaluate the issue instead of accepting a forced hostile choice.",
          "zh": "可以表达分歧或支持自己的圈子，而不贬低其他圈子。应评价具体问题，而不是接受被迫敌对的选择。"
        }
      },
      {
        "label": {
          "en": "Say all community members are equally untrustworthy.",
          "zh": "认定所有圈子里的成员都不可信。"
        },
        "why": {
          "en": "Replacing one sweeping accusation with another still judges people by group membership rather than their conduct or evidence.",
          "zh": "用另一个笼统指责替换原来的指责，仍是在根据圈子归属，而不是具体行为和证据判断他人。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-missing-resolution",
    "topic": "inflammatory-editing",
    "prompt": {
      "en": "A dispute ended in an apology. Your draft cuts that ending and says “They refused to apologize.” What should you change?",
      "zh": "一场争执已以道歉结束，但你的动态草稿删掉结尾，配文“对方拒不道歉”。应该怎样修改？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Restore the ending and describe the outcome accurately.",
          "zh": "补回结尾，如实说明事情的结果。"
        },
        "why": {
          "en": "Relevant context changes the meaning of the clip. Keep the resolution visible and make the caption match what happened in this fictional scenario.",
          "zh": "相关语境会改变片段的含义。应保留事情解决的过程，让配文符合这个虚构情境中的实际经过。"
        }
      },
      {
        "label": {
          "en": "Keep the false caption because angry replies boost views.",
          "zh": "愤怒回复能带来流量，所以保留不实配文。"
        },
        "why": {
          "en": "Engagement does not justify changing the meaning of an event. Removing the resolution can provoke anger through a misleading account.",
          "zh": "互动量不能成为歪曲事件含义的理由。删去解决过程，可能用误导性的叙述煽动愤怒。"
        }
      },
      {
        "label": {
          "en": "Add a question mark but keep the misleading edit.",
          "zh": "只加一个问号，保留误导性剪辑。"
        },
        "why": {
          "en": "A question mark does not restore the missing context. The clip and caption still suggest an outcome the full scene contradicts.",
          "zh": "问号不能补回缺失的语境。片段和配文仍在暗示一个与完整经过相反的结果。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-tracking-a-target",
    "topic": "escalation-to-targeted-abuse",
    "prompt": {
      "en": "A short dispute clip asks viewers to identify a stranger and flood their accounts with abuse. What is a safer response?",
      "zh": "一条争执短片动态号召观众找出陌生人的身份，再去其账号刷屏辱骂。怎样回应更安全？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Find their other accounts so more people can confront them.",
          "zh": "找出对方的其他账号，让更多人去围攻。"
        },
        "why": {
          "en": "Identifying more accounts expands the attack. A brief clip is not a reason to expose or organize harassment against the person shown.",
          "zh": "寻找更多账号会扩大攻击。短片不能成为曝光画面中的人，或组织他人骚扰对方的理由。"
        }
      },
      {
        "label": {
          "en": "Join the abuse if most comments blame that person.",
          "zh": "大多数评论都在指责对方，就加入辱骂。"
        },
        "why": {
          "en": "Comment counts neither verify the incident nor justify abuse. A crowd can amplify an incomplete or misleading interpretation.",
          "zh": "评论数量既不能核实事件，也不能为辱骂提供理由。人群可能放大不完整或误导性的解读。"
        }
      },
      {
        "label": {
          "en": "Do not identify the person; report the call for abuse.",
          "zh": "不参与找人，举报号召辱骂的内容。"
        },
        "why": {
          "en": "Do not help turn a dispute into targeted harassment. You can discuss the visible conduct and seek fuller context without tracing or attacking a person.",
          "zh": "不要帮助把争议变成针对个人的骚扰。可以讨论可见行为、了解完整语境，而不追查或攻击当事人。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-conflict-factory",
    "topic": "fabricated-conflict-for-traffic",
    "prompt": {
      "en": "An account network invents group accusations using one template because arguments raise ad clicks. What is the main concern?",
      "zh": "一些关联账号套用同一模板编造群体指控，因为争吵能增加广告点击。主要问题是什么？"
    },
    "correctIndex": 1,
    "options": [
      {
        "label": {
          "en": "Using any template automatically makes a post harmful.",
          "zh": "动态只要用了模板，就一定有害。"
        },
        "why": {
          "en": "Templates can organize useful information. The problem here is invented accusations used to manufacture conflict, not the format alone.",
          "zh": "模板也可以整理有用信息。这里的问题是用编造的指控制造对立，而不是格式本身。"
        }
      },
      {
        "label": {
          "en": "They fabricate group blame to provoke profitable conflict.",
          "zh": "它们编造群体指责，靠激化冲突牟利。"
        },
        "why": {
          "en": "Making up accusations misleads viewers and turns groups into targets. Advertising, repeated formats, or multiple accounts alone do not establish this behavior.",
          "zh": "编造指控会误导观众，并把群体变成攻击目标。仅凭广告、重复格式或多个账号，不能认定存在这种行为。"
        }
      },
      {
        "label": {
          "en": "More accounts repeating the story make it more reliable.",
          "zh": "重复这一说法的账号越多，它就越可信。"
        },
        "why": {
          "en": "Coordinated repetition is not independent confirmation. Check evidence rather than treating multiple copies as proof.",
          "zh": "协同重复并不是独立证实。应核查证据，不能把多份相同说法当作证明。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-outrage-repost",
    "topic": "responsible-correction-of-bait",
    "prompt": {
      "en": "You want to correct a misleading post that urges angry quote-reposts to spread its attack. Which response is more responsible?",
      "zh": "你想纠正一条误导性动态，它正煽动大家带着怒骂转发来扩散攻击。哪种做法更负责？"
    },
    "correctIndex": 0,
    "options": [
      {
        "label": {
          "en": "Share verified context without repeating its attack.",
          "zh": "提供核实过的语境，不照搬其中的攻击。"
        },
        "why": {
          "en": "Explain what checked sources establish, using only necessary redacted context. A correction need not repeat insults or help circulate a list of targets.",
          "zh": "说明核实后的来源支持什么，仅保留必要且已遮盖的语境。纠正错误不必重复辱骂，也不必帮忙扩散攻击对象名单。"
        }
      },
      {
        "label": {
          "en": "Quote its entire attack and add stronger insults.",
          "zh": "完整引用攻击内容，再加上更激烈的辱骂。"
        },
        "why": {
          "en": "More insults can amplify the very attack you oppose. Correct the claim with evidence instead of helping its hostile message travel further.",
          "zh": "更多辱骂可能放大你反对的攻击。应以证据纠正说法，而不是帮助敌对信息传播得更远。"
        }
      },
      {
        "label": {
          "en": "Forward it unchecked so other viewers can sort it out.",
          "zh": "不核实就转发，留给其他观众判断。"
        },
        "why": {
          "en": "Passing the checking burden to others still spreads unverified material. Pause to check the context before helping it reach more people.",
          "zh": "把核查责任交给别人，仍会传播未经核实的内容。帮助内容触达更多人之前，应先停下来核实语境。"
        }
      }
    ]
  },
  {
    "id": "rage-bait-anger-versus-evidence",
    "topic": "criticism-without-manipulation",
    "prompt": {
      "en": "A member angrily criticizes a broken service, shows dated records, and asks for a fix without attacking people. What matters?",
      "zh": "一名成员生气地批评服务故障，提供有日期的记录并要求修复，没有攻击他人。判断时应看什么？"
    },
    "correctIndex": 2,
    "options": [
      {
        "label": {
          "en": "Any anger automatically makes the criticism rage bait.",
          "zh": "只要表达愤怒，批评就一定是愤怒诱饵。"
        },
        "why": {
          "en": "Anger alone does not establish manipulation. People may be upset about real problems and still discuss them accurately and respectfully.",
          "zh": "仅凭愤怒，不能认定是在操纵他人。人们可能因真实问题而生气，同时仍准确、尊重地讨论问题。"
        }
      },
      {
        "label": {
          "en": "Treat dated screenshots as proof of every claim.",
          "zh": "有日期的截图足以证明其中所有说法。"
        },
        "why": {
          "en": "Dates help you examine a record, but do not establish that it is authentic, complete, or supports every claim. Check the original context too.",
          "zh": "日期有助于核查记录，但不能证明记录真实、完整，或支持所有说法。还需要核查原始语境。"
        }
      },
      {
        "label": {
          "en": "Assess the evidence and conduct, not anger alone.",
          "zh": "看证据和表达行为，不能只看是否生气。"
        },
        "why": {
          "en": "Check the records and how the claims are made. Criticism with context is different from fabricated blame or calls to attack; strong emotion alone settles neither truth nor harm.",
          "zh": "应核查记录与表达方式。有语境的批评不同于编造指责或号召攻击；强烈情绪本身不能决定真假，也不能单独证明有害。"
        }
      }
    ]
  }
];
// END GENERATED RAIL QUESTIONS
export function railQuestion(id: string): RailQuestion | null {
  return RAIL_QUESTIONS.find((question) => question.id === id) ?? null;
}
export function currentRailQuestion(s: { rail: RailRide | null }): RailQuestion | null {
  return s.rail ? railQuestion(s.rail.questions[s.rail.index]) : null;
}
export function railQuestionDuration(question: RailQuestion): number {
  // Budget for every visible choice, not the explanation shown after answering.
  // These are gameplay allowances: 15 English or 5 Chinese characters/second,
  // plus four seconds to decide and move, with at least twelve seconds overall.
  const copy = [question.prompt, ...question.options.map((option) => option.label)];
  const characters = (locale: keyof RailCopy) =>
    copy.reduce((count, text) => count + Array.from(text[locale].replace(/\s/gu, "")).length, 0);
  // Use the larger reading budget so either language has enough time and
  // switching languages cannot shorten or restart an active countdown.
  return Math.ceil(Math.max(12, 4 + Math.max(characters("en") / 15, characters("zh") / 5)));
}
export function createRailQuestionDeck(): RailQuestionDeck {
  return { remaining: [], recent: [] };
}
export function createRailRide(
  random: () => number,
  deck = createRailQuestionDeck(),
): RailRide {
  if (deck.remaining.length < 4) {
    const ids = RAIL_QUESTIONS.map(({ id }) => id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // Finish the old cycle before the next one. Put recently shown questions
    // and its remaining tail later in the refill, avoiding boundary repeats
    // without reroll loops or losing any questions from either cycle.
    const reserved = new Set(deck.remaining);
    const recent = new Set(deck.recent);
    deck.remaining.push(
      ...ids.filter((id) => !reserved.has(id) && !recent.has(id)),
      ...ids.filter((id) => !reserved.has(id) && recent.has(id)),
      ...ids.filter((id) => reserved.has(id)),
    );
  }
  const count = random() < 0.5 ? 3 : 4;
  return {
    elapsed: 0,
    phase: "boarding",
    // Reserve the ride's view without consuming unseen questions on a retry.
    questions: deck.remaining.slice(0, count),
    questionDeck: deck,
    index: 0,
    remaining: 2,
    duration: 2,
    optionOrder: [0, 1, 2],
    answerLane: null,
    correct: null,
    correctCount: 0,
    failure: null,
    reward: 0,
  };
}
export function beginRailQuestion(ride: RailRide, random: () => number) {
  const deck = ride.questionDeck;
  const id = ride.questions[ride.index];
  if (deck?.remaining[0] === id) {
    deck.remaining.shift();
    deck.recent.push(id);
    deck.recent = deck.recent.slice(-Math.min(8, RAIL_QUESTIONS.length - 1));
  }
  const order: [number, number, number] = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  ride.phase = "question";
  ride.duration = railQuestionDuration(railQuestion(id)!);
  ride.remaining = ride.duration;
  ride.optionOrder = order;
  ride.answerLane = null;
  ride.correct = null;
}
