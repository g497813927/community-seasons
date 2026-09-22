import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/game/i18n";
import type { SkinId } from "@/lib/game/skins";
import type { Outfit } from "@/lib/game/cosmetics";
import type { SceneKind } from "@/lib/game/scenes";
import { createSeasonWheelMotion } from "./season-wheel-motion";
import { WalkingOutfitPreview } from "./walking-outfit-preview";
import "./render-warmup-screen.css";

const SEASONS = [
  { id: "spring", en: "Spring", zh: "春天" },
  { id: "summer", en: "Summer", zh: "夏天" },
  { id: "autumn", en: "Autumn", zh: "秋天" },
  { id: "winter", en: "Winter", zh: "冬天" },
] as const;

function SeasonLandmarks({ season }: { season: SceneKind }) {
  return (
    <g>
      {season === "spring" && <g data-season-landmarks="spring">
        <g data-season-trees="spring" transform="translate(0 290) scale(1 -1)">
          <path d="M133 166v-19m54 13v-18" stroke="#7a7350" strokeWidth="4" strokeLinecap="round" />
          <path d="M133 135c-20-4-26 22-10 27 11 9 29-2 23-16-2-7-7-10-13-11Zm54-4c-16-3-21 18-8 22 9 7 23-1 19-13-2-6-6-8-11-9Z" fill="#e6a0b0" />
          <g fill="#ffe6d3"><circle cx="126" cy="146" r="3" /><circle cx="139" cy="153" r="3" /><circle cx="183" cy="141" r="3" /></g>
        </g>
        <path d="m137 203 3-4 3 4m37-2 3-4 3 4" stroke="#f9e0bd" strokeWidth="3" strokeLinecap="round" />
      </g>}
      {season === "summer" && <g data-season-landmarks="summer">
        <path d="M115 154q27-27 60-7t31 10l-8 13q-34-21-73 6Z" fill="#e6d29d" />
        <path d="M119 148q30-25 57-4t29 8l-4 11q-38-20-77 5Z" fill="#529f9b" />
        <path d="m124 153 12-4m27 8 14 3" stroke="#bce3d5" strokeWidth="2" strokeLinecap="round" />
        <g data-season-trees="summer" transform="translate(0 290) scale(1 -1)">
          <path d="M186 165q-5-14-3-29" stroke="#a48950" strokeWidth="4" fill="none" />
          <path d="M183 137q-17-20-24 0 12-5 24 0-1-23 13-15-10 6-13 15 18-18 23 1-12-4-23-1Z" fill="#397b59" />
        </g>
        <path d="m151 205 8-4 9 4" stroke="#f4e7bd" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>}
      {season === "autumn" && <g data-season-landmarks="autumn">
        <g data-season-trees="autumn" transform="translate(0 290) scale(1 -1)">
          <path d="M132 166v-21m55 17v-24" stroke="#81573c" strokeWidth="4" />
          <path d="m132 128-17 18 6 15 24-1 7-17Zm55-2-16 16 6 14 24-2 4-15Z" fill="#d78143" />
          <path d="m125 142 11-3 6 9-11 4Zm57-7 10 1-2 10-10-1Z" fill="#efbd67" />
        </g>
        <g fill="#b96e3f"><path d="m151 167 8-5 5 7-8 4Zm-19 34 8-5 4 8-8 3Zm45 3 9-5 3 7-8 3Z" /></g>
      </g>}
      {season === "winter" && <g data-season-landmarks="winter">
        <path d="M122 162q34-14 74 0l3 9q-41-13-70 2Z" fill="#f4f6e9" />
        <g data-season-trees="winter" transform="translate(0 290) scale(1 -1)">
          <path d="m133 127-13 20h7l-12 17h36l-12-17h7Zm55 5-12 17h6l-10 16h32l-11-16h6Z" fill="#6b9589" />
          <path d="m133 127-8 12h16Zm55 5-7 10h14Z" fill="#f5f7ee" />
        </g>
        <g fill="#f7f8ef"><circle cx="157" cy="144" r="2.5" /><circle cx="165" cy="166" r="2" /><circle cx="139" cy="203" r="2.5" /><circle cx="179" cy="205" r="2" /></g>
      </g>}
    </g>
  );
}

function SeasonWheel({ step }: { step: number }) {
  const clipId = useId();
  const half = "M55 110A105 105 0 0 1 265 110Z";
  return (
    <svg className="render-warmup-landscape" viewBox="50 0 220 220" aria-hidden="true" focusable="false">
      <defs><clipPath id={clipId}><path d={half} /></clipPath></defs>
      {[0, 1].map((slot) => {
        const index = slot === step % 2 ? step : step + 1;
        const season = SEASONS[index % 4];
        return (
          <g key={slot} data-season-slot={slot} data-season-sector={season.id} transform={`rotate(${slot * 180} 160 110)`}>
            <g clipPath={`url(#${clipId})`}>
              <path d={half} fill={["#a9c59b", "#88c7bd", "#cba875", "#d4e5e5"][index % 4]} />
              <g transform="rotate(145 160 110) translate(0 38)"><SeasonLandmarks season={season.id} /></g>
              <g transform="rotate(215 160 110) translate(0 38)"><SeasonLandmarks season={season.id} /></g>
            </g>
          </g>
        );
      })}
      <circle cx="160" cy="110" r="60" fill="none" stroke="#d0bd8d" strokeWidth="20" />
      <circle cx="160" cy="110" r="60" fill="none" stroke="#efdfb7" strokeWidth="17" />
      <circle cx="160" cy="110" r="60" fill="none" stroke="#cbb98f" strokeWidth="1.5" strokeDasharray="3 13" />
      <circle cx="160" cy="110" r="105" fill="none" stroke="#55796a" strokeOpacity=".24" strokeWidth="1.5" />
    </svg>
  );
}

export function RenderWarmupScreen({ ready, locale, skin, outfit, scene, onComplete }: {
  ready: boolean; locale: Locale; skin: SkinId; outfit: Outfit; scene: SceneKind; onComplete: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [seasonIndex, setSeasonIndex] = useState(0);
  const wheelRef = useRef<HTMLSpanElement>(null);
  const motionRef = useRef<ReturnType<typeof createSeasonWheelMotion> | null>(null);
  const [wheelView, setWheelView] = useState({ step: 0 });
  const completionRef = useRef(onComplete);
  const completionTimerRef = useRef<number | undefined>(undefined);
  const completionEpochRef = useRef(0);
  completionRef.current = onComplete;
  const zh = locale === "zh-CN";
  const season = SEASONS[seasonIndex];

  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const motion = createSeasonWheelMotion(wheel, {
      onLabel: setSeasonIndex,
      // A fresh snapshot also acknowledges an instantaneous same-step snap.
      onStep: (step) => setWheelView({ step }),
      onArrive: () => {
        setLeaving(true);
        const epoch = ++completionEpochRef.current;
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = window.setTimeout(() => {
          if (completionEpochRef.current !== epoch) return;
          motionRef.current?.dispose();
          motionRef.current = null;
          setDismissed(true);
          completionRef.current();
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
      },
    });
    motionRef.current = motion;
    return () => {
      ++completionEpochRef.current;
      window.clearTimeout(completionTimerRef.current);
      motion.dispose();
      motionRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    ++completionEpochRef.current;
    window.clearTimeout(completionTimerRef.current);
    setLeaving(false);
    motionRef.current?.setDestination(ready ? SEASONS.findIndex((season) => season.id === scene) : null);
  }, [ready, scene]);

  useLayoutEffect(() => {
    // Hidden artwork has committed before the next half-turn can expose it.
    motionRef.current?.committed(wheelView.step);
  }, [wheelView]);

  if (dismissed) return null;

  return (
    <div className="render-warmup-screen" data-ready={leaving} lang={locale}>
      <div className="render-warmup-content">
        <div className="render-warmup-title" role="status" aria-live="polite" aria-atomic="true">
          {leaving
            ? zh ? "旅程准备就绪" : "Your journey is ready"
            : zh ? "正在准备旅程…" : "Preparing your journey…"}
        </div>
        <button
          type="button"
          className="render-warmup-scene"
          disabled={ready}
          data-season={season.id}
          aria-label={`${zh ? season.zh : season.en}. ${zh ? "切换季节" : "Change season"}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!ready) motionRef.current?.advance();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="render-warmup-picture">
            <span className="render-warmup-wheel-window" aria-hidden="true">
              <span className="render-warmup-wheel" ref={wheelRef}>
                <SeasonWheel step={wheelView.step} />
              </span>
            </span>
            <WalkingOutfitPreview skin={skin} hat={outfit.hat} shoes={outfit.shoes} effect={outfit.effect} />
          </span>
        </button>
        <p className="render-warmup-hint">{zh ? "轻点切换季节" : "Tap to change season"}</p>
      </div>
    </div>
  );
}
