export type Locale = "en" | "zh-CN";

export function resolveLocale(saved: string | null, preferred: readonly string[]): Locale {
  if (saved === "en" || saved === "zh-CN") return saved;
  for (const language of preferred) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "zh") return "zh-CN";
    if (primary === "en") return "en";
  }
  return "en";
}

// Display text only. Game IDs, saved data, key bindings, and English messages
// remain unchanged; translate at the point where a message is displayed.
const ZH: Readonly<Record<string, string>> = {
  "The center route is closed. Choose the left or right branch at a fork.":
    "中间路线已封闭。请在岔口前选择左侧或右侧分支。",
  "Blossom groves, garden arbors and quiet park ponds.": "花树成林，花架与安静的池塘点缀公园。",
  "A wooden riverside boardwalk, little docks and passing sailboats.":
    "沿木质栈道漫步河畔，经过小码头与帆船。",
  "A brick avenue lined with market stalls and warm townhouses.":
    "砖石长街两旁，是集市摊位和温暖的联排小屋。",
  "Snow-roofed cabins, evergreen trees and frozen village ponds.":
    "覆雪木屋、常青树与结冰池塘环绕冬日村落。",
  "Explore real moderation cases": "查看真实违规案例",
  Momentum: "共建动力",
  "Change lanes to avoid full-height post stacks.": "换道避开挡住整条跑道的动态堆。",
  "Slide under overhead post banners.": "滑行穿过悬挂的动态横幅。",
  "Jump over low comment cards.": "跳过低矮的评论卡片。",
  "The disruptors caught up. A hit during a chase ends the run.":
    "捣乱者追上了你。追逐时再次碰撞会结束本局。",
  "Snowy gardens, warm streetlights and a clear winter path.":
    "覆雪花园、温暖路灯和清爽的冬日小路。",
  "Amber trees and brick walkways through the community.": "琥珀色树叶和贯穿街区的砖石步道。",
  "Sunny riverside paths, leafy trees and shaded benches.": "阳光河畔、繁茂绿树和树荫下的长椅。",
  "Blossom-lined paths and a welcoming neighborhood park.": "花树掩映的小路，友善开放的社区公园。",
  "Winter Square": "冬日街区",
  "Autumn Avenue": "秋日长街",
  "Summer Riverside": "夏日河畔",
  "Spring Commons": "春日广场",
  "A seasonal community path with three lanes. Swipe or use arrow keys: left and right to dodge, up to jump, down to slide.":
    "四季社区有三条跑道。滑动或按方向键：左右换道、向上跳跃、向下滑行。",
  "Community Seasons keyboard and swipe game": "四季共建：键盘与滑动操作学习游戏",
  "Coins to collect. Boundaries to discover.": "收集金币，认识交流的边界。",
  "Start the journey": "开始共建",
  "Spot harmful posts. Make room for respect.": "辨认不当内容，为尊重留出空间。",
  "Every season, a better conversation.": "四季流转，让交流更友善。",
  "A LITTLE CARE, EVERY SEASON": "每一季，都多一份善意",
  SEASONS: "共建",
  COMMUNITY: "四季",
  "COMMUNITY IN MOTION": "社区同行",
  "COMMUNITY SEASONS": "四季共建",
  "Community Seasons": "四季共建",
  "Season Pass": "四季通行",
  "ONE LEVEL · HOLD ONE": "固定等级 · 限持一个",
  "Buy Season Pass to another world": "购买前往其他场景的传送道具",
  "Use within the first 5 seconds to travel. Hold only one Season Pass at a time.":
    "开局前 5 秒内使用即可传送。同时只能持有一个传送道具。",
  "Use your Season Pass before buying another.": "先使用已持有的传送道具，才能再次购买。",
  "Choose a Season Pass destination.": "请选择传送目的地。",
  "You are already in this world.": "你已经在这个场景中。",
  "Only Season Pass changes your world.": "只有四季通行道具可以切换场景。",
  "Wait until you leave the tunnel.": "请等待离开传送隧道。",
  "Season Pass is only available during the first 5 seconds. Your booster is saved.":
    "四季通行只能在开局前 5 秒使用。道具已保留。",
  "Boost in your current world during the first 5 seconds with a protected 2× speed burst.":
    "开局前 5 秒内使用，在当前场景获得免疫碰撞的双倍速度冲刺。",
  "Travel through a seasonal tunnel to another world, then enjoy a protected 2× burst. One fixed level; hold one at a time.":
    "穿过四季隧道前往其他场景，随后获得免疫碰撞的双倍速度冲刺。固定等级，限持一个。",
  "Use 1 for Fresh Start or 4 for Season Pass in the first 5 seconds. 2 for Shield and 3 for Shared Rewards work anytime. Jump to collect path boosters; they activate immediately.":
    "开局前 5 秒按 1 友善启程或按 4 四季通行。随时按 2 使用护盾、按 3 使用共建双倍。跳跃拾取跑道道具，立即生效。",
  "OPTIONAL PORTAL": "可选传送门",
  "Left lane: travel": "左侧跑道：传送",
  "Center or right: stay": "中间或右侧：留在当前场景",
  "1–4 boosters · E skill · B store": "1–4 道具 · E 技能 · B 商店",
  Active: "生效中",
  "Center lane: travel": "中间跑道：传送",
  "Right lane: travel": "右侧跑道：传送",
  "Other lanes: stay": "其他跑道：留在当前场景",
  "DISTANCE MILESTONE": "距离里程碑",
  "The disruptors caught up. A hit while it is chasing ends the run.":
    "守护兽追上了你。被追逐时再次碰撞就会结束本局。",
  "Your skill is active. Charging resumes when the effect ends.":
    "技能正在生效，效果结束后恢复充能。",
  "Charging resumes after the effect": "效果结束后恢复充能",
  Charging: "充能中",
  To: "前往",
  "Starting world": "起始场景",
  "Keep collecting coins to charge your skill.": "继续收集金币，为技能充能。",
  "Travel to your purchased destination in the first 5 seconds with a protected 2× speed burst.":
    "开局前 5 秒内使用，传送到购买的目的地，并获得免疫碰撞的双倍速度冲刺。",
  "Buy a destination Fresh Start": "购买目的地友善启程",
  "Choose a Fresh Start destination.": "请选择友善启程的目的地。",
  "Use within the first 5 seconds to travel. Used in purchase order.":
    "开局前 5 秒使用即可传送。按购买顺序使用。",
  "Portals ahead · Your last world is remembered": "前方有传送门 · 自动记住上次场景",
  "Your run starts in your last world. Equip one skill; collect 100 coins, then double-tap the path or press E.":
    "从上次抵达的场景开始。装备一个技能，收集 100 枚金币后双击跑道画面或按 E 释放。",
  Ready: "就绪",
  "Emerald Wilds": "翡翠荒野",
  "Sunken Sands": "沉金沙海",
  Frostfall: "霜落冰原",
  "Jungle canopy and ancient stone.": "穿过丛林树冠与古老石道。",
  "Golden dunes and sandstone gateways.": "金色沙丘与砂岩门廊。",
  "Moonlit ice and crystal spires.": "月光冰面与水晶尖塔。",
  "Choose your expedition.": "选择你的探险。",
  "Choose a world and one skill. Collect coins to charge it, then double-tap the path or press E.":
    "选择场景与一个技能。收集金币充能，充满后双击跑道画面或按 E 释放。",
  "CHOOSE A WORLD": "选择场景",
  "Scene for this run": "本局场景",
  "3 worlds · Choose before you run": "三种场景 · 出发前自由选择",
  "Double-tap or press E": "双击画面或按 E",
  "Double-tap the path to use your charged skill": "技能充满后，双击跑道画面释放",
  "Shield expired. Stay alert!": "护盾已到期，小心障碍！",
  "Shield remaining": "护盾剩余效果",
  "Absorb one collision within 12 seconds.": "12 秒内可抵挡一次碰撞。",
  "EDGE HIT": "撞到边界",
  "DISRUPTORS CLOSE": "捣乱者逼近",
  "CHASE ON": "追逐开始",
  "Avoid spam strips and road edges until the disruptors fall behind.":
    "避开垃圾留言和道路边界，直到甩开捣乱者。",
  "The disruptors are chasing you. Keep running.": "捣乱者正在追你，继续奔跑。",
  "The guardian caught you after two mistakes. Avoid roots and the road edges for six seconds to escape.":
    "连续两次失误，守护兽追上了你。连续 6 秒避开树根和道路边界即可脱险。",
  "Relic Rush keyboard and swipe game": "遗迹疾奔：键盘与滑动操作跑酷游戏",
  "A jungle causeway with three lanes. Swipe or use arrow keys: left and right to dodge, up to jump, down to slide.":
    "丛林古道分为三条跑道。滑动屏幕或使用方向键：左右躲避，向上跳跃，向下滑行。",
  "Swipe on the path to play.": "在跑道画面上滑动即可操作。",
  "Swipe controls": "滑动操作",
  "SWIPE TO MOVE": "滑动操作",
  Home: "主页",
  "Back to home": "返回主页",
  "Back to home. Ends this run and keeps collected coins.":
    "返回主页。结束本局并保留已收集的金币。",
  "AUTOPLAY PREVIEW": "自动演示",
  "Fresh Start": "友善启程",
  "Shared Rewards": "共建双倍",
  "Activate in the first 5 seconds for a protected 2× speed burst.":
    "开局前 5 秒内使用，获得双倍速度并免疫碰撞。",
  "Collected coins are worth twice as much, including skill charge.":
    "收集金币获得双倍收益，技能充能也翻倍。",
  "Fresh Start is only available during the first 5 seconds. Your booster is saved.":
    "友善启程只能在开局前 5 秒使用。道具已保留。",
  "Press 1 for Fresh Start in the first 5 seconds, 2 for Shield, or 3 for Shared Rewards. Shield and Shared Rewards work anytime. Path pickups activate immediately.":
    "开局前 5 秒可按 1 使用友善启程；随时按 2 使用护盾，按 3 使用共建双倍。路上的道具拾取后立即生效。",
  "Upgrade booster effects to level 3. Shield upgrades improve both versions. Magnet and Momentum can also be found along the path and activate immediately when collected.":
    "道具效果最高可升至 3 级。护盾升级同时增强两种来源。路上也能找到善意磁铁和共建动力，拾取后立即生效。",
  "PERMANENT SKILL EFFECT": "永久技能效果",
  "CONSUMABLE BOOSTER": "消耗型道具",

  "RELIC RUSH": "遗迹疾奔",
  "Relic Rush": "遗迹疾奔",
  RELIC: "遗迹",
  RUSH: "疾奔",
  "THE LOST CAUSEWAY": "失落古道",
  "ENDLESS RUNNER": "无尽跑酷",
  "LOCAL ARCADE": "本地街机",
  "Relic Rush keyboard game": "遗迹疾奔：键盘跑酷游戏",
  "A jungle causeway with three lanes. Use left and right to dodge, up to jump, down to slide.":
    "丛林古道分为三条跑道。按左右方向键躲避，上方向键跳跃，下方向键滑行。",
  SCORE: "得分",
  BEST: "最佳纪录",
  "FINAL SCORE": "最终得分",
  DISTANCE: "距离",
  COINS: "金币",
  m: "米",
  "Turn sound on": "开启声音",
  "Mute sound": "关闭声音",
  "Resume game": "继续游戏",
  "Pause game": "暂停游戏",
  "EXPEDITION No. 001": "第 001 次探险",
  "The path is ancient.": "古道沉寂已久。",
  "Your next move is everything.": "下一步，由你决定。",
  "Run the ruins": "奔向遗迹",
  "or press": "或按",
  "to begin": "开始",
  "or press ENTER to begin": "或按回车键开始",
  ENTER: "回车",
  SPACE: "空格",
  "Browse boosters": "浏览道具",
  "1 / 2 / 3 to use": "按 1 / 2 / 3 使用",
  "Collect gold. Dodge danger. Keep running.": "收集金币，躲避危险，一路向前。",
  "TAKE A BREATHER": "稍作休息",
  "JOURNEY COMPLETE": "本次旅程结束",
  "A moment of stillness.": "歇一歇，再出发。",
  "The disruptors caught up.": "捣乱者追上来了。",
  "A chance to learn.": "停下来，认识一条边界。",
  "A new personal best": "刷新个人最佳纪录",
  "Run again": "再跑一次",
  "Your community journey will be here when you’re ready.": "准备好后，随时继续社区旅程。",
  "Your expedition will be here when you're ready.": "准备好后，随时继续探险。",
  "Keep running": "继续奔跑",
  "Keep running!": "继续奔跑！",
  "Start a new run": "重新开始",
  "Press P or Enter to resume": "按 P 或回车键继续",
  "Press Enter to run again": "按回车键再跑一次",
  "Visit the store": "前往商店",
  "Shopping keeps your run paused.": "逛商店时，游戏会保持暂停。",
  "FOLLOW THE GOLD · FIND YOUR RHYTHM": "跟随金币 · 找到节奏",
  "DEEP IN THE RUINS": "深入遗迹",
  "THE GUARDIAN IS CLOSE": "守护兽就在身后",
  "THE CHASE IS ON": "追逐开始了",
  "Keep running to leave the guardian behind.": "继续奔跑，甩开身后的守护兽。",
  "You stumbled! Avoid another root hit for 6 seconds.": "你被绊到了！接下来 6 秒内别再撞上树根。",
  "You shook off the guardian. Keep running!": "你甩开了守护兽。继续奔跑！",
  "The guardian caught you after two stumbles. Jump over roots or dodge them; six clean seconds will shake it off.":
    "连续两次被绊倒，守护兽追上了你。跳过树根或换道躲开，连续 6 秒不再被绊倒就能甩开它。",
  "Jump over the low stone barriers.": "跳过低矮的石障。",
  "Slide under the hanging arches.": "滑行穿过低垂的拱门。",
  "Change lanes to dodge the tall pillars.": "换道躲开高大的石柱。",
  "Shield absorbed the crash. Keep running!": "护盾挡住了碰撞。继续奔跑！",
  "01 — THE EMERALD WILDS": "01 — 翡翠荒野",
  "MAKE ROOM FOR RESPECT.": "为尊重留出空间。",
  "MAKE YOUR MOVE": "开始行动",
  "Change lanes": "切换跑道",
  "Move left": "向左移动",
  "Move right": "向右移动",
  Jump: "跳跃",
  Slide: "滑行",
  Pause: "暂停",
  "WASD works too": "也可使用 WASD",
  "1–3 boosters · E skill · B store": "1–3 道具 · E 技能 · B 商店",
  "1 / 2 / 3 boosters · B store": "1 / 2 / 3 道具 · B 商店",
  STORE: "商店",
  Store: "商店",
  "Open store": "打开商店",
  Close: "关闭",
  "Back to game": "返回游戏",
  "THE COMMUNITY STORE": "社区补给站",
  "Tools for a kinder community.": "让善意，一路同行。",
  "Spend collected coins on helpful tools and lasting skills. Build momentum for the next journey.":
    "用收集的金币购买道具和永久技能，为下一段社区旅程积蓄力量。",
  "YOUR COIN BANK": "金币余额",
  Boosters: "道具",
  "Permanent skills": "永久技能",
  Levels: "等级升级",
  "Purchased boosters stay in your inventory: press 1 / 2 / 3 anytime to use them. Shortcuts appear for the first five seconds. Glowing path relics activate immediately and refill an existing effect.":
    "购买的道具会保存在背包中，随时按 1 / 2 / 3 使用。快捷提示会在开局前 5 秒显示。路上发光的遗物拾取后立即生效，并补满同类效果。",
  owned: "个",
  LEVEL: "等级",
  Level: "等级",
  Lv: "等级",
  L: "等级",
  "Activate with": "按键使用",
  "Buy booster": "购买道具",
  "Ready for your next journey": "为下一段旅程做好准备",
  "Unlock skills, then equip just one for each run. Collected coins charge your equipped skill and still go into your bank. Press E when full.":
    "解锁技能后，每局可装备一个。收集的金币会为已装备技能充能，同时照常存入金币账户。充满后按 E 释放。",
  "Selection changes apply to your next run.": "更换的技能将在下一局生效。",
  Selected: "已选择",
  Unlocked: "已解锁",
  Locked: "未解锁",
  Collect: "收集",
  "coins per charge during a run.": "枚金币，即可在本局充能一次。",
  "Trigger when full": "充满后按键释放",
  "Equipped for next run": "下局已装备",
  "Equip next run": "下局装备",
  "Equip skill": "装备技能",
  "Unlock forever": "永久解锁",
  "Charge starts at zero every run": "每局充能都从零开始",
  "One purchase. Recharge again and again.": "一次解锁，反复充能使用。",
  "Upgrade each booster to level 3. Levels improve purchased and collected boosters as well as matching permanent skills. Active effects keep their current level until the next activation.":
    "每种道具最高可升至 3 级。升级会增强购买的道具、拾取的遗物及对应的永久技能。已经生效的效果保持原等级，下次激活时应用升级。",
  "PERMANENT UPGRADE": "永久升级",
  "Now:": "当前：",
  "Next:": "下一级：",
  "Maximum power unlocked": "已解锁最强效果",
  "Maximum level": "已达最高等级",
  "One upgrade improves every copy": "升级一次，所有同类道具都增强",
  "Your coins, inventory, permanent unlocks, and levels are saved automatically. Skill charge resets every run.":
    "金币、背包、永久解锁和等级会自动保存。技能充能每局重置。",
  "Saved in this browser · Shop with game coins only": "保存在此浏览器中 · 仅使用游戏金币购买",
  "Browser saving is unavailable. Progress will last for this session only.":
    "此浏览器无法保存进度，当前进度仅在本次会话中有效。",
  "Consumable boosters": "消耗型道具",
  "BOOSTERS · USE ONCE": "道具 · 使用后消耗",
  "PERMANENT SKILL": "永久技能",
  "No skill equipped": "未装备技能",
  "Choose one before your next run.": "在下一局开始前选择一个技能。",
  "Choose one permanent skill before your next run.": "在下一局开始前选择一个永久技能。",
  "Equip one permanent skill in the store before your next run.":
    "在下一局开始前，前往商店装备一个永久技能。",
  "Equipped permanent skill": "已装备的永久技能",
  "EQUIPPED PERMANENT SKILL": "已装备的永久技能",
  "Press E to activate": "按 E 释放",
  "Collect coins to charge": "收集金币充能",
  "FULLY CHARGED": "充能完毕",
  CHARGE: "充能",
  "BEFORE YOU RUN": "出发之前",
  "Choose your permanent skill.": "选择你的永久技能。",
  "Equip one skill for this expedition. Collect coins to fill its bar, then press E to trigger it.":
    "为本次探险装备一个技能。收集金币填满充能条，再按 E 释放。",
  "Permanent skill for this run": "本局装备的永久技能",
  "Run without a skill": "不装备技能开始",
  "Consumable boosters still work with 1 / 2 / 3.": "仍可按 1 / 2 / 3 使用消耗型道具。",
  "Begin run": "开始奔跑",
  "Boundary Shield": "界限护盾",
  Shield: "护盾",
  "Kindness Magnet": "善意磁铁",
  Magnet: "磁铁",
  Rush: "冲刺",
  "Personal Boundaries": "边界意识",
  "Active Listening": "积极倾听",
  "Community Momentum": "共建动力",
  "Shield skill": "护盾技能",
  "Magnet skill": "磁铁技能",
  "Rush skill": "冲刺技能",
  "One crash": "抵挡 1 次碰撞",
  "Absorb one collision and keep your expedition alive.": "抵挡一次碰撞，让探险继续。",
  "Pull nearby coins from every lane, even while jumping.":
    "吸取所有跑道附近的金币，跳跃时也有效。",
  "Run 65% faster and pass safely through every obstacle.": "速度提升 65%，并安全穿过所有障碍。",
  Protected: "保护中",
  "Choose a permanent skill.": "请选择一个永久技能。",
  "This skill is already permanently unlocked.": "这个技能已永久解锁。",
  "Start or resume your run to use a skill.": "开始或继续游戏后才能使用技能。",
  "Only the permanent skill equipped for this run can be triggered.":
    "只能释放本局装备的永久技能。",
  "Unlock this permanent skill before equipping it.": "请先解锁这个永久技能，再装备它。",
  "Choose a booster from the store.": "请在商店中选择一个道具。",
  "Your inventory is full.": "背包已满。",
  "Choose a booster from your inventory.": "请从背包中选择一个道具。",
  "Start or resume your run to use a booster.": "开始或继续游戏后才能使用道具。",
  "Choose a booster to upgrade.": "请选择要升级的道具。",
  "This booster is already at maximum level.": "这个道具已达到最高等级。",
  Language: "语言",
  "Game language": "游戏语言",
  "Change language": "切换语言",
  "Select language": "选择语言",
  English: "English",
  "Simplified Chinese": "简体中文",
  "Chinese (Simplified)": "简体中文",
  "Switch to Simplified Chinese": "切换为简体中文",
  "Switch to English": "切换为英语",
};

type Rule = readonly [RegExp, (match: RegExpMatchArray) => string];
const N = "[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?";
const B =
  "(Boundary Shield|Kindness Magnet|Momentum|Shield|Magnet|Rush|Fresh Start|Shared Rewards|Season Pass)";
const S = "(Personal Boundaries|Active Listening|Community Momentum)";
const ITEM =
  "(Boundary Shield|Kindness Magnet|Community Momentum|Fresh Start|Shared Rewards|Season Pass)";
const name = (value: string): string => ZH[value] ?? value;

// Every expression is anchored and restricted to the game's known wording.
// This is intentionally not a general word-replacement translator.
const RULES: readonly Rule[] = [
  [/^([0-9]+(?:,[0-9]{3})*)m reached!$/, (m) => `已跑过 ${m[1]} 米！`],
  [
    /^(Personal Boundaries|Active Listening|Community Momentum) activated! Charging resumes when the effect ends\.$/,
    (m) => `${name(m[1])}已释放！效果结束后恢复充能。`,
  ],
  [
    /^Buy Season Pass to (Spring Commons|Summer Riverside|Autumn Avenue|Winter Square) for ([0-9]+) coins$/,
    (m) => `花费 ${m[2]} 枚金币购买前往${name(m[1])}的传送道具`,
  ],
  [
    /^Buy Fresh Start to (Spring Commons|Summer Riverside|Autumn Avenue|Winter Square) for ([0-9]+) coins$/,
    (m) => `花费 ${m[2]} 枚金币购买前往${name(m[1])}的友善启程`,
  ],
  [
    /^(Personal Boundaries|Active Listening|Community Momentum)\. (Fully charged\.|Charging\.|Active\.) Double-tap or press E when ready\.$/,
    (m) =>
      `${name(m[1])}。${m[2] === "Active." ? "生效中" : m[2] === "Fully charged." ? "充能完毕" : "充能中"}，就绪后双击画面或按 E 释放。`,
  ],
  [/^Stay clear · ([0-9]+)s$/, (m) => `别再失误 · ${m[1]} 秒`],
  [
    /^([123]) hits? · ([0-9]+)s( max)?$/,
    (m) => `抵挡 ${m[1]} 次 · ${m[3] ? "最长 " : ""}${m[2]} 秒`,
  ],
  [
    /^Absorb ([123]) collisions? within (12|16|20) seconds\.$/,
    (m) => `${m[2]} 秒内可抵挡 ${m[1]} 次碰撞。`,
  ],
  [
    /^(Absorb [123] collisions? within (?:12|16|20) seconds\.) Collect ([0-9]+) coins per charge during a run\.$/,
    (m) => `${translateKnown(m[1])}本局每收集 ${m[2]} 枚金币，即可充能一次。`,
  ],
  [
    /^Shield: ([123] hits? · [0-9]+s)\. Press 2 to activate\.$/,
    (m) => `护盾：${translateKnown(m[1])}。按 2 使用。`,
  ],
  [
    /^LEVEL ([123]) · ([123] hits? · (?:12|16|20)s max)$/,
    (m) => `${m[1]} 级 · ${translateKnown(m[2])}`,
  ],
  [
    new RegExp(`^Open store\\. (${N}) coins in your bank\\. Press B\\.$`),
    (m) => `打开商店。金币余额 ${m[1]} 枚。按 B 打开。`,
  ],
  [
    new RegExp(`^(${N}) coins from this run are in your bank\\.$`),
    (m) => `本局获得的 ${m[1]} 枚金币已存入金币账户。`,
  ],
  [
    new RegExp(`^One more root hit ends the run · (${N})s to escape$`),
    (m) => `再撞一次树根就会失败 · 再坚持 ${m[1]} 秒甩开追击`,
  ],
  [
    new RegExp(`^Shield absorbed the crash\\. (${N}) protections? left\\.$`),
    (m) => `护盾挡住了碰撞。还可抵挡 ${m[1]} 次。`,
  ],
  [
    new RegExp(`^${B} booster activated! Level ([123]) power\\.$`),
    (m) => `${name(m[1])}道具已激活！获得 ${m[2]} 级效果。`,
  ],
  [
    new RegExp(`^${B} relic collected! Press ([123]) to use it\\.$`),
    (m) => `拾取了${name(m[1])}遗物！按 ${m[2]} 使用。`,
  ],
  [
    new RegExp(`^Collect (${N}) more coins to unlock ${S}\\.$`),
    (m) => `再收集 ${m[1]} 枚金币即可解锁${name(m[2])}。`,
  ],
  [
    new RegExp(`^${S} unlocked forever\\. Equip it for your next run to start charging\\.$`),
    (m) => `${name(m[1])}已永久解锁。下一局装备后即可开始充能。`,
  ],
  [new RegExp(`^Unlock ${S} in the store first\\.$`), (m) => `请先在商店中解锁${name(m[1])}。`],
  [
    new RegExp(`^(${N}) more collected coins will charge ${S}\\.$`),
    (m) => `再收集 ${m[1]} 枚金币，${name(m[2])}即可充能完毕。`,
  ],
  [
    new RegExp(`^${B} is already active\\. Your charge is saved\\.$`),
    (m) => `${name(m[1])}效果仍在生效。充能已保留。`,
  ],
  [
    new RegExp(`^${S} activated! Collect coins to recharge\\.$`),
    (m) => `${name(m[1])}已释放！收集金币可再次充能。`,
  ],
  [
    new RegExp(`^${S} selected for your next run\\.$`),
    (m) => `已选择${name(m[1])}，将在下一局装备。`,
  ],
  [
    new RegExp(`^Collect (${N}) more coins for ${B}\\.$`),
    (m) => `再收集 ${m[1]} 枚金币即可购买${name(m[2])}。`,
  ],
  [new RegExp(`^${B} added to your inventory\\.$`), (m) => `${name(m[1])}已加入背包。`],
  [
    new RegExp(`^No ${B} left\\. Open the store with B\\.$`),
    (m) => `背包中没有${name(m[1])}了。按 B 打开商店。`,
  ],
  [new RegExp(`^${B} is already active\\.$`), (m) => `${name(m[1])}效果仍在生效。`],
  [new RegExp(`^${B} activated!$`), (m) => `${name(m[1])}已激活！`],
  [
    new RegExp(`^Collect (${N}) more coins for this upgrade\\.$`),
    (m) => `再收集 ${m[1]} 枚金币即可升级。`,
  ],
  [
    new RegExp(
      `^${B} upgraded to level ([123])\\. (?:Consumables and permanent skills are improved|Future uses of this effect are improved)\\.$`,
    ),
    (m) => `${name(m[1])}已升至 ${m[2]} 级。下次使用时将获得更强的效果。`,
  ],
  [new RegExp(`^Buy ${ITEM} for (${N}) coins$`), (m) => `花费 ${m[2]} 枚金币购买${name(m[1])}`],
  [
    new RegExp(`^Permanently unlock ${S} for (${N}) coins$`),
    (m) => `花费 ${m[2]} 枚金币永久解锁${name(m[1])}`,
  ],
  [
    new RegExp(`^${S}, level ([123])\\. (${N}) of (${N}) charge\\. Press E when ready\\.$`),
    (m) => `${name(m[1])}，${m[2]} 级。充能 ${m[3]} / ${m[4]}。充满后按 E 释放。`,
  ],
  [new RegExp(`^${S} charge$`), (m) => `${name(m[1])}充能`],
  [
    new RegExp(
      `^${B}: (${N} owned|${N} hits? left|${N}s left|Protected)\\. Press ([1234]) to activate\\.$`,
    ),
    (m) => `${name(m[1])}：${translateKnown(m[2])}。按 ${m[3]} 使用。`,
  ],
  [
    new RegExp(`^Starts empty · Collect (${N}) coins to charge$`),
    (m) => `开局充能为零 · 收集 ${m[1]} 枚金币充满`,
  ],
  [new RegExp(`^Unlock in the store for (${N}) coins$`), (m) => `在商店花费 ${m[1]} 枚金币解锁`],
  [
    new RegExp(`^Collect (${N}) coins per charge during a run\\.$`),
    (m) => `本局每收集 ${m[1]} 枚金币，即可充能一次。`,
  ],
  [
    /^(Absorb [123] collisions? and keep your expedition alive\.|Pull nearby coins from every lane, even while jumping\.|Run 65% faster and pass safely through every obstacle\.) Collect ([0-9]+) coins per charge during a run\.$/,
    (m) => `${translateKnown(m[1])}本局每收集 ${m[2]} 枚金币，即可充能一次。`,
  ],
  [new RegExp(`^(${N}) more coins needed$`), (m) => `还需 ${m[1]} 枚金币`],
  [new RegExp(`^(${N}) owned$`), (m) => `持有 ${m[1]} 个`],
  [new RegExp(`^(${N}) hits? left$`), (m) => `剩余 ${m[1]} 次抵挡`],
  [new RegExp(`^(${N}) hits? protected$`), (m) => `可抵挡 ${m[1]} 次碰撞`],
  [new RegExp(`^(${N})s left$`), (m) => `剩余 ${m[1]} 秒`],
  [new RegExp(`^(${N})s active$`), (m) => `生效中，剩余 ${m[1]} 秒`],
  [new RegExp(`^(${N}) seconds?$`), (m) => `${m[1]} 秒`],
  [/^([123]) crash(?:es)?$/, (m) => `抵挡 ${m[1]} 次碰撞`],
  [
    /^Absorb ([123]) collisions? and keep your expedition alive\.$/,
    (m) => `抵挡 ${m[1]} 次碰撞，让探险继续。`,
  ],
  [new RegExp(`^(${N})m range$`), (m) => `${m[1]} 米范围`],
  [new RegExp(`^· (${N})m range$`), (m) => `· ${m[1]} 米范围`],
  [
    new RegExp(`^LEVEL ([123]) · (${N} seconds?|[123] crash(?:es)?)$`),
    (m) => `${m[1]} 级 · ${translateKnown(m[2])}`,
  ],
  [/^Level ([123]) \/ 3$/, (m) => `等级 ${m[1]} / 3`],
  [/^Level ([123]) out of 3$/, (m) => `等级 ${m[1]}，最高 3 级`],
  [/^Upgrade to level ([123])$/, (m) => `升至 ${m[1]} 级`],
  [/^(?:Level|LEVEL|Lv|L) ?([123])$/, (m) => `${m[1]} 级`],
  [
    /^Level ([123]) · (Press E to activate|Collect coins to charge|[0-9]+ hits? protected|[0-9]+s active)$/,
    (m) => `${m[1]} 级 · ${translateKnown(m[2])}`,
  ],
  [/^Activate with ([1234])$/, (m) => `按 ${m[1]} 使用`],
  [/^Trigger when full E$/, () => "充满后按 E 释放"],
  [/^EXPEDITION No\. ([0-9]+)$/, (m) => `第 ${m[1]} 次探险`],
];

function translateKnown(text: string): string {
  if (Object.prototype.hasOwnProperty.call(ZH, text)) return ZH[text];
  for (const [pattern, render] of RULES) {
    const match = text.match(pattern);
    if (match) return render(match);
  }
  return text;
}

export function translate(locale: Locale, text: string): string {
  if (locale !== "zh-CN") return text;
  const direct = translateKnown(text);
  if (direct !== text) return direct;
  // JSX line wrapping and boundary spaces should not defeat known messages.
  // Unknown input is returned byte-for-byte, including its whitespace.
  const normalized = text.trim().replace(/\s+/g, " ");
  const translated = translateKnown(normalized);
  if (translated === normalized) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return leading + translated + trailing;
}
