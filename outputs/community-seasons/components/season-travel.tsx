import { memo, type CSSProperties } from "react";
import { SCENE_TRANSITION_DURATION } from "@/lib/game/engine";
import { translate, type Locale } from "@/lib/game/i18n";
import { sceneDefinition, type SceneKind } from "@/lib/game/scenes";
import { travelPalette } from "@/lib/game/travel-colors";

const SeasonTravelArt = memo(function SeasonTravelArt({ destination }: { destination: SceneKind }) {
  return (
    <svg className="season-travel-art" viewBox="0 0 280 154" aria-hidden="true" focusable="false">
      <path d="M30 146 174 89h42l45 57" fill="currentColor" opacity=".07" />
      <path d="m78 146 107-53m-31 53 44-53" fill="none" stroke="currentColor" opacity=".2" />
      <g className="season-travel-gate">
        <path
          d="M146 126V61a47 47 0 0 1 94 0v65"
          fill="var(--travel-panel)"
          stroke="currentColor"
          strokeWidth="7"
        />
        <path d="M154 123V62a39 39 0 0 1 78 0v61Z" fill="currentColor" opacity=".16" />
        <path d="m155 100 19-16 23 13 18-19 17 16v28h-77Z" fill="currentColor" opacity=".22" />
        <path d="m177 123 16-26 17 26" fill="currentColor" opacity=".4" />
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {destination === "spring" && (
            <>
              <path d="M193 46c-17-16-23 6-10 9-13 12 5 23 10 9 5 14 23 3 10-9 13-3 7-25-10-9Z" />
              <circle cx="193" cy="55" r="4" />
            </>
          )}
          {destination === "summer" && (
            <>
              <circle cx="193" cy="55" r="10" />
              <path d="M193 35v4m0 32v4m-20-20h4m32 0h4m-34-14 3 3m22 22 3 3m0-28-3 3m-22 22-3 3" />
            </>
          )}
          {destination === "autumn" && (
            <>
              <path d="M208 39c-24-1-32 9-25 23 15 8 26-1 25-23Z" />
              <path d="m178 70 22-23m-12 13v-9m0 9h10" />
            </>
          )}
          {destination === "winter" && (
            <path d="M193 36v38m-16-28 32 18m-32 0 32-18m-21-7 5 5 5-5m-10 32 5-5 5 5m-21-20 7-2-2-7m22 26-2-7 7-2m-27 9 2-7-7-2m32-8-7-2 2-7" />
          )}
        </g>
      </g>
      <g
        className="season-travel-streaks"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".5"
      >
        <path d="M30 88h24m-35 14h29m-12 15h17" />
      </g>
      <g className="season-travel-tv">
        <path d="m85 76-10-12m24 12 9-12" stroke="#77d6e9" strokeWidth="4" strokeLinecap="round" />
        <rect x="67" y="77" width="51" height="40" rx="9" fill="#72d0e7" />
        <rect
          x="73"
          y="82"
          width="39"
          height="29"
          rx="5"
          fill="#60bfd8"
          stroke="#b7edf6"
          strokeWidth="2"
        />
        <path
          d="M83 90h19m-19 6h19m-19 6h19"
          stroke="#284c60"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="m69 97-8 6m56-6 8 5m-46 16-4 7m28-7 5 5"
          stroke="#72d0e7"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
});

export const SeasonTravel = memo(function SeasonTravel({
  destination,
  source = destination,
  progress = 0,
  locale,
  paused,
  journey = "season",
  onResume,
}: {
  destination: SceneKind;
  source?: SceneKind;
  progress?: number;
  locale: Locale;
  paused: boolean;
  journey?: "season" | "rail-return";
  onResume?: () => void;
}) {
  const zh = locale === "zh-CN";
  const returning = journey === "rail-return";
  const colors = travelPalette(source, destination, progress, returning ? "rail" : "run", "run");
  return (
    <div
      className="season-travel"
      data-paused={paused}
      data-destination={destination}
      data-journey={journey}
      style={
        {
          "--travel-accent": colors.accent,
          "--travel-panel": colors.panel,
          "--travel-ink": colors.ink,
          "--travel-muted": colors.muted,
        } as CSSProperties
      }
    >
      <div
        className="season-travel-card"
        style={{ "--travel-duration": `${SCENE_TRANSITION_DURATION}s` } as CSSProperties}
      >
        <SeasonTravelArt destination={destination} />
        <output className="season-travel-copy" role="status" aria-live="polite" aria-atomic="true">
          <span>
            {returning ? (zh ? "正在返回" : "RETURNING TO") : zh ? "正在前往" : "TRAVELLING TO"}
          </span>
          <strong>{translate(locale, sceneDefinition(destination).name)}</strong>
          <small>
            {returning
              ? zh
                ? "穿过传送门，回到跑道继续前进"
                : "Through the gate, back to the running path"
              : zh
                ? "穿过传送门，开启新的季节"
                : "Through the gate, into a new season"}
          </small>
        </output>
        {returning && paused && onResume && (
          <button className="rail-travel-resume" type="button" onClick={onResume}>
            {zh ? "继续旅程" : "Resume journey"}
          </button>
        )}
      </div>
    </div>
  );
});
