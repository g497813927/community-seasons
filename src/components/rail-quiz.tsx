"use client";

import { ArrowLeft, ArrowRight, Check, Share2, TrainFront, X } from "lucide-react";
import { currentRailQuestion, type RailQuestion, type RailRide } from "@/lib/game/railway";
import type { Locale } from "@/lib/game/i18n";
import "./rail-quiz.css";

const LANES = [-1, 0, 1] as const;
const LETTERS = ["A", "B", "C"];
type ShareLesson = (question: RailQuestion, trigger: HTMLButtonElement) => void;

function LessonActions({
  question,
  locale,
  onShareLesson,
}: {
  question: RailQuestion;
  locale: Locale;
  onShareLesson?: ShareLesson;
}) {
  if (!onShareLesson) return null;
  return (
    <div className="rail-lesson-actions">
      <button type="button" onClick={(event) => onShareLesson(question, event.currentTarget)}>
        <Share2 size={14} aria-hidden="true" />
        {locale === "zh-CN" ? "分享这道题" : "Share lesson"}
      </button>
    </div>
  );
}

export function RailQuiz({
  ride,
  lane,
  locale,
  onChoose,
  onSubmit,
  paused = false,
  onResume,
  onShareLesson,
}: {
  ride: RailRide;
  lane: number;
  locale: Locale;
  onChoose: (lane: -1 | 0 | 1) => void;
  onSubmit: () => void;
  paused?: boolean;
  onResume: () => void;
  onShareLesson?: ShareLesson;
}) {
  const l = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const text = (copy: { en: string; zh: string }) => l(copy.en, copy.zh);
  const question = currentRailQuestion({ rail: ride });
  if (!question) return null;
  const answering = ride.phase === "question";
  const failed = ride.phase === "falling";
  const feedback = ride.phase === "feedback" || failed;
  const selectedOption = ride.answerLane === null ? null : ride.optionOrder[ride.answerLane + 1];
  return (
    <div className={`rail-quiz rail-phase-${ride.phase}${paused ? " is-paused" : ""}`}>
      <section className="rail-question" aria-label={l("Community railway quiz", "社区铁路问答")}>
        <div className="rail-eyebrow">
          <TrainFront size={17} aria-hidden="true" />
          <span>{l("COMMUNITY EXPRESS", "社区小列车")}</span>
          <b>
            {ride.index + 1} / {ride.questions.length}
          </b>
        </div>
        {paused && (
          <div className="rail-pause-note">
            <span>{l("Paused · Take your time to read", "已暂停 · 可以慢慢阅读")}</span>
            <button type="button" onClick={onResume}>
              {l("Resume", "继续")}
            </button>
          </div>
        )}
        {ride.phase === "boarding" ? (
          <div aria-live="polite">
            <h2>{l("All aboard. Choose the thoughtful route.", "上车啦，选择友善的路线。")}</h2>
            <p>
              {l(
                `${ride.questions.length} questions ahead. Move to the lane with the correct answer before the gate.`,
                `前方共有 ${ride.questions.length} 道题。在通过答题门前，移动到正确答案所在的轨道。`,
              )}
            </p>
            <small>
              {l(
                "Swipe, use ← / → or A / D, or tap an answer. P pauses.",
                "左右滑动、按 ← / → 或 A / D，也可点击答案。按 P 可暂停。",
              )}
            </small>
          </div>
        ) : ride.phase === "complete" ? (
          <div className="rail-success" role="status">
            <h2>
              <Check size={23} /> {l("Every answer on track!", "全部回答正确！")}
            </h2>
            <p>
              {l(
                `+${ride.reward} coins · Returning to the path.`,
                `获得 ${ride.reward} 枚金币 · 即将回到跑道。`,
              )}
            </p>
          </div>
        ) : (
          <>
            <h2 aria-live="polite" aria-atomic="true">
              {text(question.prompt)}
            </h2>
            {answering && (
              <>
                <div
                  className="rail-countdown"
                  role="progressbar"
                  aria-label={l("Time to choose a lane", "选择轨道的剩余时间")}
                  aria-valuemin={0}
                  aria-valuemax={Math.ceil(ride.duration)}
                  aria-valuenow={Math.ceil(ride.remaining)}
                >
                  <span
                    style={{
                      transform: `scaleX(${Math.max(0, Math.min(1, ride.remaining / ride.duration))})`,
                    }}
                  />
                </div>
                <small>
                  {l(
                    "Your lane submits at the gate. Ready? Go or press ↑ / W twice.",
                    "到站时提交所在轨道的答案。选好后可点“出发”，或连按两次 ↑ / W 提前提交。",
                  )}
                </small>
              </>
            )}
            {feedback && (
              <div
                className={`rail-answer-feedback ${failed ? "incorrect" : "correct"}`}
                role="status"
              >
                <strong>
                  {failed ? <X size={18} /> : <Check size={18} />}
                  {failed
                    ? l("That route ends here.", "这条路线到此结束。")
                    : l("Correct route!", "路线正确！")}
                </strong>
                <p>{selectedOption === null ? "" : text(question.options[selectedOption].why)}</p>
                <LessonActions question={question} locale={locale} onShareLesson={onShareLesson} />
              </div>
            )}
          </>
        )}
      </section>
      {answering && (
        <div className="rail-answer-area">
          <div className="rail-answer-hint">
            <ArrowLeft size={14} /> {l("Choose your answer lane", "选择答案所在轨道")}{" "}
            <ArrowRight size={14} />
          </div>
          <div className="rail-answers" role="group" aria-label={l("Answer lanes", "答案轨道")}>
            {LANES.map((answerLane, index) => (
              <div className="rail-answer-column" key={answerLane} data-selected={lane === answerLane}>
                <button
                  type="button"
                  className="rail-answer-choice"
                  disabled={paused}
                  aria-pressed={lane === answerLane}
                  onClick={() => onChoose(answerLane)}
                >
                  <span className="rail-answer-letter">{LETTERS[index]}</span>
                  <span className="rail-answer-label">
                    {text(question.options[ride.optionOrder[index]].label)}
                  </span>
                  <small>
                    {index === 0
                      ? l("LEFT", "左侧")
                      : index === 1
                        ? l("CENTER", "中间")
                        : l("RIGHT", "右侧")}
                  </small>
                </button>
                {lane === answerLane && (
                  <div className="rail-submit-slot">
                    <button
                      type="button"
                      className="rail-submit"
                      disabled={paused}
                      aria-label={l(`Go: submit answer ${LETTERS[index]}`, `出发：提交答案 ${LETTERS[index]}`)}
                      onClick={onSubmit}
                    >
                      {l("Go", "出发")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RailFailure({
  ride,
  locale,
  onShareLesson,
}: {
  ride: RailRide;
  locale: Locale;
  onShareLesson?: ShareLesson;
}) {
  const question = currentRailQuestion({ rail: ride });
  const failure = ride.failure;
  if (!question || !failure) return null;
  const text = (copy: { en: string; zh: string }) => (locale === "zh-CN" ? copy.zh : copy.en);
  return (
    <section
      className="rail-failure-explanation"
      aria-label={locale === "zh-CN" ? "答案解析" : "Answer explanation"}
    >
      <strong>{text(question.prompt)}</strong>
      <p>
        <b>{locale === "zh-CN" ? "你的选择：" : "Your choice: "}</b>
        {text(question.options[failure.optionIndex].label)}
      </p>
      <p>{text(question.options[failure.optionIndex].why)}</p>
      <p className="rail-correct-answer">
        <Check size={16} />
        <span>
          <b>{locale === "zh-CN" ? "正确答案：" : "Correct answer: "}</b>
          {text(question.options[question.correctIndex].label)}
        </span>
      </p>
      <LessonActions question={question} locale={locale} onShareLesson={onShareLesson} />
    </section>
  );
}
