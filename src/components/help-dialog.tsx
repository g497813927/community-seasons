"use client";

import { useRef } from "react";
import { CircleHelp, ScrollText, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/lib/game/i18n";
import "./help-dialog.css";

export function HelpDialog({ open, onOpenChange, locale, onGuide, onLicenses, returnFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  onGuide: () => void;
  onLicenses: () => void;
  returnFocus: () => HTMLElement | false;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const l = (en: string, zh: string) => locale === "zh-CN" ? zh : en;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="help-panel" className="help-dialog" lang={locale}
        initialFocus={titleRef} finalFocus={returnFocus} showCloseButton={false}>
        <DialogHeader className="help-header">
          <DialogTitle ref={titleRef} tabIndex={-1} className="help-title">
            {l("Help", "帮助")}
          </DialogTitle>
          <DialogDescription>
            {l("Controls, tips, and open-source credits.", "操作指南、游玩提示与开源致谢。")}
          </DialogDescription>
          <button type="button" className="help-close" onClick={() => onOpenChange(false)}
            aria-label={l("Close help", "关闭帮助")}><X aria-hidden="true" /></button>
        </DialogHeader>
        <div className="help-actions">
          <button type="button" className="help-guide" onClick={onGuide} aria-haspopup="dialog">
            <CircleHelp aria-hidden="true" />
            <span><strong>{l("How to play", "操作指南")}</strong>
              <small>{l("Swipes, keyboard controls, and the path", "滑动手势、键盘操作与跑道介绍")}</small></span>
          </button>
          <button type="button" className="licenses-launcher" onClick={onLicenses}
            aria-haspopup="dialog" aria-controls="licenses-panel">
            <ScrollText aria-hidden="true" />
            <span><strong>{l("Open-source licenses", "开源许可")}</strong>
              <small>{l("Credits and original license notices", "开源致谢与原始许可声明")}</small></span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
