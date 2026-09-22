import { memo, type CSSProperties } from "react";
import { getWalkingSkinPreview } from "@/lib/game/render/skin-preview";
import type { SkinId } from "@/lib/game/skins";
import type { Outfit } from "@/lib/game/cosmetics";

export const WalkingOutfitPreview = memo(function WalkingOutfitPreview({ skin, hat, shoes, effect }: {
  skin: SkinId; hat: Outfit["hat"]; shoes: Outfit["shoes"]; effect: Outfit["effect"];
}) {
  const frames = getWalkingSkinPreview(skin, { hat, shoes, effect });
  return (
    <span className="render-warmup-runner" aria-hidden="true">
      <span className="render-warmup-walk" style={{
        width: `${frames.length * 100}%`,
        "--warmup-walk-start": `${-100 / frames.length}%`,
        "--warmup-walk-steps": frames.length - 1,
      } as CSSProperties}>
        <svg viewBox={`0 0 ${160 * frames.length} 160`} focusable="false">
          {frames.map(({ faces, shadows }, frame) => (
            <g key={frame} transform={`translate(${frame * 160} 0)`}>
              {shadows.map((shadow, index) => <polygon className="render-warmup-foot-shadow" key={`shadow-${index}`} points={shadow.points} fill={shadow.fill} />)}
              {faces.map((face, index) => <polygon key={index} points={face.points} fill={face.fill} />)}
            </g>
          ))}
        </svg>
      </span>
    </span>
  );
});
