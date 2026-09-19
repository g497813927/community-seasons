import { getSkinPreview } from "@/lib/game/render/skin-preview";
import type { SkinId } from "@/lib/game/skins";
import type { Outfit } from "@/lib/game/cosmetics";

export function OutfitPreview({ skin, outfit, label, className }: {
  skin: SkinId; outfit: Outfit; label?: string; className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 160 160" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <ellipse cx="80" cy="147" rx="37" ry="4" fill="#001a22" opacity=".2" />
      {getSkinPreview(skin, outfit).map((face, index) => (
        <polygon key={index} points={face.points} fill={face.fill} />
      ))}
    </svg>
  );
}
