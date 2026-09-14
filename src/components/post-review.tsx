import {
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getLesson,
  getLessonReference,
  localized,
  GUIDELINES_URL,
  CASES_URL,
  type CommunityLesson,
} from "@/lib/game/community";
import type { PostReview } from "@/lib/game/engine";
import type { Locale } from "@/lib/game/i18n";

export function PostReviewDialog({
  review,
  ended,
  locale,
  onContinue,
  onShareLesson,
}: {
  review: PostReview | null;
  ended: boolean;
  locale: Locale;
  onContinue: () => void;
  onShareLesson?: (lesson: CommunityLesson, trigger: HTMLButtonElement) => void;
}) {
  const l = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const lesson = review && getLesson(review);
  const reference = lesson && getLessonReference(lesson.id);
  const text = (value: { en: string; zh: string }) => localized(value, locale);
  return (
    <Dialog
      open={!!review}
      onOpenChange={(open) => {
        if (!open) onContinue();
      }}
    >
      <DialogContent className="lesson-dialog" showCloseButton={false} lang={locale}>
        {lesson && (
          <>
            <DialogHeader>
              <div className="lesson-eyebrow">
                <MessageSquareWarning size={19} />
                {l("COMMUNITY CHECKPOINT", "社区观察站")}
              </div>
              <DialogTitle className="lesson-title">{text(lesson.title)}</DialogTitle>
              <DialogDescription className="lesson-description">
                {l(
                  "A moment to notice the boundary. The run waits while you read.",
                  "停下来，辨认这条边界。阅读时游戏会暂停。",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="example-post">
              <div className="post-byline">
                <span className="anonymous-avatar">!</span>
                <span>{l("Fictional community post", "虚构社区动态")}</span>
                <b>{l("REDACTED", "已脱敏")}</b>
              </div>
              <blockquote>
                {text(lesson.example)
                  .split(/(\[[^\]]+\])/g)
                  .map((part, i) =>
                    part.startsWith("[") ? (
                      <span className="redacted-text" key={i}>
                        {part}
                      </span>
                    ) : (
                      part
                    ),
                  )}
              </blockquote>
            </div>
            <section className="lesson-reason">
              <h3>{l("Why this crosses a line", "为什么不合适")}</h3>
              <p>{text(lesson.why)}</p>
            </section>
            <section className="lesson-action">
              <ShieldCheck size={20} />
              <div>
                <h3>{l("A constructive response", "可以这样应对")}</h3>
                <p>{text(lesson.response)}</p>
              </div>
            </section>
            <section className="lesson-rewrite">
              <Sparkles size={19} />
              <div>
                <h3>{l("A better way to communicate", "换一种表达")}</h3>
                <p>“{text(lesson.rewrite)}”</p>
              </div>
            </section>
            <p className="lesson-context">
              {l(
                "Disagreement is welcome. Critique ideas and actions—not someone’s identity or dignity. A collision does not mean you endorsed the post.",
                "可以有不同意见。讨论观点和行为，尊重身份与人格。撞到动态不代表你认同它。",
              )}
            </p>
            {reference && (
              <div className="lesson-real-case">
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={
                    (reference.kind === "case"
                      ? l("Open real case in a new tab: ", "在新标签页打开真实案例：")
                      : l("Open the case archive in a new tab: ", "在新标签页打开案例公示：")) +
                    text(reference.title)
                  }
                >
                  <span>{text(reference.title)}</span>
                  <ExternalLink size={16} />
                </a>
                <small>{text(reference.note)}</small>
                <small>
                  {reference.kind === "case"
                    ? l(
                        "Opens the original case in a new tab. It may contain unredacted material. Your run stays paused here.",
                        "新标签页打开原始案例，可能包含未脱敏内容。此处游戏保持暂停。",
                      )
                    : l(
                        "Opens the public case list in a new tab. Your run stays paused here.",
                        "新标签页打开案例公示列表。此处游戏保持暂停。",
                      )}
                </small>
              </div>
            )}
            {onShareLesson && (
              <Button
                variant="outline"
                className="lesson-share-button"
                onClick={(event) => onShareLesson(lesson, event.currentTarget)}
              >
                <Share2 size={17} /> {l("Share this lesson", "分享这份提醒")}
              </Button>
            )}
            <div className="lesson-footer">
              <span>
                {review?.shielded
                  ? l("Your Boundary Shield protected this run.", "界限护盾已保护本局。")
                  : ended
                    ? l("This run has ended. Your coins are saved.", "本局已结束，金币已保存。")
                    : l("Continue when you are ready.", "准备好后再继续。")}
              </span>
              <Button className="lesson-continue" onClick={onContinue}>
                {ended ? l("See my run", "查看本局") : l("Understood · Continue", "明白了 · 继续")}
                <ArrowRight size={17} />
              </Button>
            </div>
            <div className="lesson-sources">
              <span>
                {l(
                  "Original learning examples, inspired by community guidelines.",
                  "基于社区规范编写的原创学习示例。",
                )}
              </span>
              <a href={GUIDELINES_URL} target="_blank" rel="noreferrer">
                {l("Guidelines", "社区规范")}
                <ExternalLink size={11} />
              </a>
              <a href={CASES_URL} target="_blank" rel="noreferrer">
                {l("Case archive", "案例公示")}
                <ExternalLink size={11} />
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
