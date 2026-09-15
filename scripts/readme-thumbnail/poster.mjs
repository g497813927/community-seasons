import { Renderer } from './compiled/render.mjs';
import { createRun } from './compiled/engine.mjs';
import { RAIL_QUESTIONS } from './compiled/railway.mjs';
await document.fonts.ready;
const canvas = document.getElementById('poster'), c = canvas.getContext('2d');
const locale = document.documentElement.lang;
const chinese = locale === 'zh-CN';
const copy = (zh, en) => chinese ? zh : en;
const textBounds = [];
const font = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const ink = '#eef5e8', gold = '#f3d494';
function round(x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) {
    c.fillStyle = fill;
    c.fill();
} if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.5;
    c.stroke();
} }
function text(value, x, y, size = 20, color = ink, weight = 500, align = 'left') { c.font = `${weight} ${size}px ${font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(value, x, y); const width = c.measureText(value).width; textBounds.push({ value, left: align === 'center' ? x - width / 2 : align === 'right' ? x - width : x, right: align === 'center' ? x + width / 2 : align === 'right' ? x : x + width, bottom: y }); }
function wrap(value, x, y, width, size, color, weight = 500, lineHeight = size * 1.4) {
    c.font = `${weight} ${size}px ${font}`;
    let line = '';
    for (const char of chinese ? value : value.split(/(?<=\s)/)) {
        if (char === '\n') {
            text(line, x, y, size, color, weight);
            line = '';
            y += lineHeight;
            continue;
        }
        if (line && c.measureText(line + char).width > width) {
            text(line, x, y, size, color, weight);
            line = '';
            y += lineHeight;
        }
        line += char;
    }
    if (line)
        text(line, x, y, size, color, weight);
    return y;
}
function state(scene, extra = {}) {
    return Object.assign(createRun(4182, scene), { mode: 'running', time: 120, distance: 350, speed: 19, nextRow: 1e9, nextPortalAt: Infinity, nextRailAt: Infinity, nextForkAt: Infinity, obstacles: [], pickups: [], relics: [] }, extra);
}
function sceneArt(scene, w, h, extra = {}) {
    const art = document.createElement('canvas');
    art.width = w * 2;
    art.height = h * 2;
    const renderer = new Renderer(art);
    renderer.w = w;
    renderer.h = h;
    renderer.ctx.setTransform(2, 0, 0, 2, 0, 0);
    renderer.render(state(scene, extra), 0, false, locale);
    return art;
}
function artFrame(art, x, y, w, h, r = 20) {
    c.save();
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.clip();
    c.drawImage(art, x, y, w, h);
    c.restore();
    round(x, y, w, h, r, null, '#d3ead42c');
}
function label(value, x, y, w, fill = '#123b3be8', color = gold, size = 16) { round(x, y, w, 32, 10, fill); text(value, x + w / 2, y + 22, size, color, 650, 'center'); }
const bg = c.createLinearGradient(0, 0, 1200, 900);
bg.addColorStop(0, '#123d40');
bg.addColorStop(.6, '#0b2d30');
bg.addColorStop(1, '#071f24');
c.fillStyle = bg;
c.fillRect(0, 0, 1200, 900);
// A quiet seasonal arc behind the title, without competing with gameplay.
c.strokeStyle = '#acd3b016';
c.lineWidth = 1.5;
for (const radius of [170, 205, 240]) {
    c.beginPath();
    c.arc(1150, 30, radius, 0, Math.PI * 2);
    c.stroke();
}
// The same flower motif as the game, drawn as a small supporting brand mark.
c.save();
c.translate(83, 91);
c.strokeStyle = gold;
c.lineWidth = 3.5;
c.lineCap = 'round';
for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate(i * Math.PI * 2 / 5);
    c.beginPath();
    c.ellipse(0, -17, 9, 13, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
}
c.beginPath();
c.arc(0, 0, 6, 0, Math.PI * 2);
c.stroke();
c.beginPath();
c.moveTo(0, 29);
c.lineTo(0, 60);
c.moveTo(0, 48);
c.bezierCurveTo(-23, 47, -24, 30, 0, 40);
c.moveTo(0, 55);
c.bezierCurveTo(23, 54, 24, 37, 0, 47);
c.stroke();
c.restore();
if (chinese) {
    text('四季共建', 137, 132, 78, ink, 780);
    c.save();
    c.letterSpacing = '3px';
    text('COMMUNITY SEASONS', 140, 169, 18, '#9fbdba', 650);
    c.restore();
}
else {
    text('COMMUNITY', 137, 108, 52, ink, 780);
    text('SEASONS', 137, 163, 52, ink, 780);
}
label(copy('社区素养 × 四季跑酷', 'Community learning × Runner'), 48, 205, chinese ? 250 : 330, '#264a465c', '#d6e7cf', 18);
text(copy('识别不当内容', 'Spot harmful content'), 678, 101, chinese ? 34 : 32, ink, 680);
text(copy('选出友善回应', 'Choose a kinder reply'), 678, 150, chinese ? 34 : 32, gold, 680);
text(copy('一段跑酷，也是一场社区学习。', 'A runner with lessons in community.'), 680, 190, 18, '#a8c6c1', 500);
const coins = [];
for (let i = 0; i < 8; i++)
    coins.push({ id: 100 + i, lane: 0, at: 354 + i * 3.5, height: 1, taken: false });
for (let i = 0; i < 5; i++)
    coins.push({ id: 120 + i, lane: 1, at: 397 + i * 3, height: 1, taken: false });
const hero = sceneArt('spring', 610, 546, {
    obstacles: [{ id: 0, lane: -1, at: 360, kind: 'block', resolved: false }, { id: 4, lane: 1, at: 373, kind: 'pillar', resolved: false }, { id: 6, lane: 0, at: 399, kind: 'arch', resolved: false }],
    pickups: coins, relics: [{ id: 200, lane: 0, at: 383, height: 3.1, kind: 'magnet', taken: false }],
});
artFrame(hero, 48, 260, 610, 546, 24);
label(copy('春日广场 · 跑酷', 'Spring Commons · Runner'), 68, 280, chinese ? 174 : 250);
const heroFade = c.createLinearGradient(0, 710, 0, 806);
heroFade.addColorStop(0, '#092d3000');
heroFade.addColorStop(1, '#092d30e8');
c.fillStyle = heroFade;
c.fillRect(49, 710, 608, 95);
text(copy('躲开不当言论，继续向前。', 'Dodge harmful posts. Keep moving.'), 74, 780, 23, '#f0ead4', 650);
const scenes = [['summer', copy('夏日河畔', 'Summer Riverside')], ['autumn', copy('秋日长街', 'Autumn Avenue')], ['winter', copy('冬日街区', 'Winter Square')]];
for (const [i, [scene, name]] of scenes.entries()) {
    const x = 678 + i * 162;
    artFrame(sceneArt(scene, 150, 214, { distance: 390 }), x, 260, 150, 214, 18);
    label(name, x + 8, 432, 134, '#123b3bed', ink, chinese ? 14 : 12);
}
const question = RAIL_QUESTIONS.find(q => q.id === 'respectful-disagreement');
if (!question)
    throw Error('Thumbnail question "respectful-disagreement" is missing from the question bank. Update the thumbnail fixture to use an existing question.');
const rail = { phase: 'question', questions: [question.id, 'private-address', 'login-code'], index: 0, remaining: 3, duration: 10, elapsed: 7, optionOrder: [0, 1, 2], answerLane: null, correct: null, correctCount: 0, failure: null, reward: 0 };
artFrame(sceneArt('summer', 474, 314, { rail, distance: 1075, railEntryDistance: 1075, lane: 0, x: 0 }), 678, 492, 474, 314, 20);
round(690, 504, 450, 93, 14, '#10383bf5', '#cfe6cd26');
text(copy('社区小列车  /  铁路答题', 'Community Express / Railway quiz'), 707, 529, 15, gold, 650);
wrap(question.prompt[chinese ? 'zh' : 'en'], 707, 557, 416, chinese ? 20 : 18, ink, 650, 24);
const optionWidth = 142;
for (const [i, option] of question.options.entries()) {
    const x = 690 + i * 154;
    const correct = i === question.correctIndex;
    round(x, 734, optionWidth, 60, 10, correct ? '#ead49b' : '#123a3beb', correct ? '#ffedb9' : '#b9d4c738');
    text(['A', 'B', 'C'][i], x + 11, 756, 15, correct ? '#164243' : gold, 750);
    const optionLabel = chinese ? option.label.zh.replace('你的不同', '你的\n不同').replace('是[', '是\n[').replace('刷爆对方', '刷爆\n对方') : option.label.en;
    const bottom = wrap(optionLabel, x + 31, chinese ? 755 : 750, 101, chinese ? 13 : 12, correct ? '#164243' : '#e0e8d9', 600, chinese ? 18 : 15);
    if (bottom > 788)
        throw Error('Answer text exceeds its card');
}
text(copy('跑过四季，把友善留在社区。', 'Run through the seasons. Make room for respect.'), 48, 857, chinese ? 25 : 23, gold, 650);
text(copy('跑酷 · 收集 · 判断', 'Run · Collect · Reflect'), 1152, 855, 19, '#b1cec5', 550, 'right');
if (textBounds.some(box => box.left < 0 || box.right > 1200 || box.bottom > 900))
    throw Error('Thumbnail text exceeds the canvas');
window.thumbnailReady = { locale, textBounds };
