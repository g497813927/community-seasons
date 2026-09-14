import { useEffect, useRef, type CSSProperties } from "react";
import type { Locale } from "@/lib/game/i18n";
import type { RailTravelFrame } from "@/lib/game/rail-transition";
import type { Renderer } from "@/lib/game/render";
import type { SceneKind } from "@/lib/game/scenes";
import { travelPalette } from "@/lib/game/travel-colors";
import { SeasonTravel } from "./season-travel";
import "./rail-travel.css";

function DestinationPreview({
  renderer,
  scene,
  mode,
  label,
}: {
  renderer: Renderer | null;
  scene: SceneKind;
  mode: "rail" | "run";
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const source = renderer?.journeyPreview?.(scene, mode);
    const context = canvas.current?.getContext("2d");
    if (source && context) context.drawImage(source, 0, 0, 256, 512);
  }, [renderer, scene, mode]);
  return (
    <div className="rail-travel-preview">
      <canvas ref={canvas} width={256} height={512} role="img" aria-label={label} />
      <span>{label}</span>
    </div>
  );
}

export function RailTravel({
  frame,
  locale,
  scene,
  renderer,
  paused,
  onResume,
}: {
  frame: RailTravelFrame | null;
  locale: Locale;
  scene: SceneKind;
  renderer: Renderer | null;
  paused: boolean;
  onResume: () => void;
}) {
  if (!frame) return null;
  const returning = frame.direction === "return";
  const zh = locale === "zh-CN";
  const colors = travelPalette(
    scene,
    scene,
    frame.progress ?? 0,
    returning ? "rail" : "run",
    returning ? "run" : "rail",
  );
  const style = {
    opacity: paused ? 1 : frame.opacity,
    "--travel-background": colors.background,
    "--travel-edge": colors.edge,
    "--travel-accent": colors.accent,
    "--travel-panel": colors.panel,
    "--travel-ink": colors.ink,
    "--travel-muted": colors.muted,
  } as CSSProperties;
  if (returning)
    return (
      <div className="rail-travel rail-travel-return" data-paused={paused} style={style}>
        <SeasonTravel
          destination={scene}
          source={scene}
          progress={frame.progress ?? 0}
          locale={locale}
          paused={paused}
          journey="rail-return"
          onResume={onResume}
        />
      </div>
    );
  return (
    <div className="rail-travel" data-paused={paused} style={style}>
      <div className="rail-travel-inner">
        <DestinationPreview
          renderer={renderer}
          scene={scene}
          mode="rail"
          label={zh ? "即将进入 · 社区铁路" : "NEXT · COMMUNITY RAILWAY"}
        />
        <svg className="rail-travel-art" viewBox="0 0 280 160" fill="none" aria-hidden="true">
          <path d="M15 132H265M15 143H265" stroke="#80aaa0" strokeWidth="3" />
          <g className="rail-travel-sleepers" stroke="#80aaa0" strokeWidth="4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <path key={i} d={`M${18 + i * 28} 128v19`} />
            ))}
          </g>
          <path
            d="M57 74H24M47 89H14M55 103H31"
            stroke="#edcf8e"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g className="rail-travel-cart">
            <path
              d="M89 70l-6-15m54 15 6-15"
              stroke="#74bed0"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <rect x="83" y="67" width="62" height="43" rx="9" fill="#75cada" />
            <rect x="91" y="75" width="46" height="27" rx="5" fill="#1a4545" />
            <path
              d="m100 85 4 3-4 3m26-6-4 3 4 3"
              stroke="#e8e8c8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M77 107h78l-8 19H85z" fill="#cfa657" stroke="#f3d58c" strokeWidth="3" />
            <circle cx="92" cy="128" r="8" fill="#163e3b" stroke="#f3d58c" strokeWidth="3" />
            <circle cx="142" cy="128" r="8" fill="#163e3b" stroke="#f3d58c" strokeWidth="3" />
          </g>
          <path
            d="M181 86h42m-15-15 15 15-15 15"
            stroke="#edcf8e"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{zh ? "到站啦" : "ALL ABOARD"}</span>
        <strong>{zh ? "社区小列车" : "Community Express"}</strong>
        <p>
          {zh
            ? "乘上小车回答 3–4 道题 · 选择正确答案的轨道"
            : "Board the cart for 3–4 questions. Choose the correct answer lane."}
        </p>
        {paused && (
          <button type="button" onClick={onResume}>
            {zh ? "继续旅程" : "Resume journey"}
          </button>
        )}
      </div>
    </div>
  );
}
