import { useRef } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Locale } from "@/lib/game/i18n";

export function RotateDevice({
  open,
  locale,
  height,
  paused,
}: {
  open: boolean;
  locale: Locale;
  height: number;
  paused: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const zh = locale === "zh-CN";
  return (
    <Dialog open={open} disablePointerDismissal onOpenChange={() => {}}>
      <DialogPortal>
        <DialogOverlay className="rotate-device-backdrop" />
        <DialogPrimitive.Popup
          className="rotate-device-dialog"
          initialFocus={titleRef}
          style={{ top: height / 2, maxHeight: height - 24 }}
          lang={locale}
        >
          <svg className="rotate-device-icon" viewBox="0 0 96 80" fill="none" aria-hidden="true">
            <rect
              x="33"
              y="12"
              width="30"
              height="54"
              rx="6"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M44 19h8M44 59h8M21 53A31 31 0 0 1 19 23l-2 13m2-13 11 6M75 27a31 31 0 0 1 2 30l2-13m-2 13-11-6"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <DialogTitle ref={titleRef} tabIndex={-1} className="rotate-device-title">
            {zh ? "请将手机转为竖屏" : "Turn your phone upright"}
          </DialogTitle>
          <DialogDescription className="rotate-device-description">
            {zh
              ? "竖屏能留出更多空间，看清跑道与提示。"
              : "Portrait gives the path and its hints more room."}
          </DialogDescription>
          {paused && (
            <p className="rotate-device-paused">
              {zh
                ? "游戏已暂停。转为竖屏后，准备好再点击继续。"
                : "Your run is paused. Rotate, then resume when you’re ready."}
            </p>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
