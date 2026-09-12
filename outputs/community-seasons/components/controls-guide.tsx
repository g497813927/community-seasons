"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Locale } from "@/lib/game/i18n";
import { PathGuideArt } from "./path-guide-art";

export function ControlsGuide({
  open,
  onOpenChange,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState<"controls" | "path">("controls");
  useLayoutEffect(() => {
    if (open) {
      dialogRef.current?.scrollTo({ top: 0 });
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [open, page]);
  function changeOpen(next: boolean) {
    if (!next) setPage("controls");
    onOpenChange(next);
  }
  const zh = locale === "zh-CN";
  const l = (en: string, cn: string) => (zh ? cn : en);
  const rows = [
    {
      id: "lanes",
      title: l("Change lanes", "切换跑道"),
      detail: l("Swipe left or right", "向左或向右划"),
      keyboard: l("Left / right arrows or A / D", "左右方向键或 A / D"),
    },
    {
      id: "jump",
      title: l("Jump", "跳跃"),
      detail: l("Swipe up", "向上划"),
      keyboard: l("Up arrow, W or Space", "上方向键、W 或空格"),
    },
    {
      id: "slide",
      title: l("Slide", "滑行"),
      detail: l("Swipe down", "向下划"),
      keyboard: l("Down arrow or S", "下方向键或 S"),
    },
    {
      id: "skill",
      title: l("Use your skill", "使用技能"),
      detail: l("Double-tap when charged", "充能后双击跑道"),
      keyboard: l("Press E when charged", "充能后按 E"),
    },
  ];
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        ref={dialogRef}
        initialFocus={titleRef}
        className="controls-guide-dialog"
        showCloseButton={false}
        lang={locale}
      >
        <DialogHeader>
          <span className="controls-guide-eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            {l("FIND YOUR RHYTHM", "找到你的节奏")}
          </span>
          <DialogTitle ref={titleRef} tabIndex={-1} className="controls-guide-title">
            {l("How to play", "操作指南")}
          </DialogTitle>
          <DialogDescription className="controls-guide-description">
            {l(
              "Swipe or use the keyboard. Both work at any time.",
              "随时都可使用滑动手势或键盘，无需切换。",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="guide-pages" role="group" aria-label={l("Guide pages", "指南页面")}>
          <button
            type="button"
            aria-pressed={page === "controls"}
            onClick={() => setPage("controls")}
          >
            <span>1</span> {l("Controls", "操作方式")}
          </button>
          <button type="button" aria-pressed={page === "path"} onClick={() => setPage("path")}>
            <span>2</span> {l("On the path", "认识跑道")}
          </button>
        </div>
        {page === "controls" ? (
          <>
            <ul className="controls-guide-rows">
              {rows.map((row) => (
                <li key={row.id}>
                  <span className="controls-guide-label">
                    <strong>{row.title}</strong>
                    <small>{row.detail}</small>
                    <span className="sr-only">{row.keyboard}</span>
                  </span>
                  <span className="controls-guide-input" aria-hidden="true">
                    {row.id === "lanes" && (
                      <>
                        <span className="controls-guide-key-pair">
                          <kbd>←</kbd>
                          <kbd>A</kbd>
                        </span>
                        <span className="controls-guide-key-pair">
                          <kbd>→</kbd>
                          <kbd>D</kbd>
                        </span>
                      </>
                    )}
                    {row.id === "jump" && (
                      <>
                        <kbd>↑</kbd>
                        <kbd>W</kbd>
                        <kbd>{l("Space", "空格")}</kbd>
                      </>
                    )}
                    {row.id === "slide" && (
                      <>
                        <kbd>↓</kbd>
                        <kbd>S</kbd>
                      </>
                    )}
                    {row.id === "skill" && <kbd>E</kbd>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="controls-guide-note">
              <Sparkles size={16} aria-hidden="true" />
              <span>
                {l(
                  "Tap booster cards at the start, or press 1–4. Jump to collect boosters on the path.",
                  "开局点击道具卡片，或按 1–4 使用道具。跳跃拾取跑道上的道具。",
                )}
              </span>
            </p>
          </>
        ) : (
          <div className="path-guide-cards">
            <article>
              <PathGuideArt kind="fork" />
              <h3>{l("Road forks", "岔路转弯")}</h3>
              <p>
                {l(
                  "When the center closes, choose the left or right lane before the fork. The road turns with you.",
                  "中路封闭时，在到达岔口前选择左侧或右侧跑道，道路会随你的选择转弯。",
                )}
              </p>
            </article>
            <article>
              <PathGuideArt kind="rail" />
              <h3>{l("Community Express", "社区小列车")}</h3>
              <p>
                {l(
                  "Board a cart for 3–4 questions. Choose the correct answer lane before each gate. A wrong answer ends the ride and explains why.",
                  "上车回答 3–4 道题；通过答题门前，选择正确答案所在轨道。答错会结束本局，并显示原因。",
                )}
              </p>
            </article>
            <article>
              <PathGuideArt kind="obstacle" />
              <h3>{l("Obstacles", "障碍物")}</h3>
              <p>
                {l(
                  "Jump over low posts or spam strips, slide under raised signs, and dodge tall posts.",
                  "低矮动态和刷屏条跳过；悬空标牌滑过；高大动态换道避开。",
                )}
              </p>
            </article>
            <article>
              <PathGuideArt kind="gate" />
              <h3>{l("Transport gates", "传送门")}</h3>
              <p>
                {l(
                  "Safe to enter. Travel to the named season, or use another lane to stay here.",
                  "可以安全穿过，前往标出的季节；走其他跑道则留在当前场景。",
                )}
              </p>
            </article>
            <article>
              <PathGuideArt kind="booster" />
              <h3>{l("Boosters", "道具")}</h3>
              <p>
                {l(
                  "Floating colored badges. Jump to collect; their power activates immediately.",
                  "悬浮的彩色徽章：跳跃拾取，效果立即生效。",
                )}
              </p>
            </article>
            <article>
              <PathGuideArt kind="coin" />
              <h3>{l("Coins", "金币")}</h3>
              <p>
                {l(
                  "Follow the gold trails. Collect coins to buy tools and charge your equipped skill.",
                  "沿着金币路线收集，可购买道具，并为装备的技能充能。",
                )}
              </p>
            </article>
          </div>
        )}
        <Button
          type="button"
          className="controls-guide-done"
          onClick={() => (page === "controls" ? setPage("path") : changeOpen(false))}
        >
          {page === "controls" ? l("Next: On the path", "下一步：认识跑道") : l("Got it", "知道了")}{" "}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
