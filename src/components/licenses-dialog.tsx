"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ScrollText, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/lib/game/i18n";
import "./licenses-dialog.css";

interface LicensePackage {
  name: string;
  version: string;
  license: string;
  scope: "production" | "development";
  notices: { file: string; text: string }[];
  status: "complete" | "missing-license-text";
}
interface LicenseInventory {
  schemaVersion: number;
  packages: LicensePackage[];
}

export function LicensesDialog({ open, onOpenChange, locale, returnFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  returnFocus: () => HTMLElement | false;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [inventory, setInventory] = useState<LicenseInventory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const l = (en: string, zh: string) => locale === "zh-CN" ? zh : en;

  useEffect(() => {
    if (!open || inventory) return;
    const controller = new AbortController();
    setFailed(false);
    // Full notices are a separate static asset, loaded only when requested.
    void fetch(`${import.meta.env.BASE_URL}open-source-licenses.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("License inventory unavailable");
        const data: LicenseInventory = await response.json();
        if (data.schemaVersion !== 1 || !Array.isArray(data.packages))
          throw new Error("Invalid license inventory");
        if (!controller.signal.aborted) setInventory(data);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open, inventory, attempt]);

  const search = query.trim().toLowerCase();
  const packages = inventory?.packages.filter((item) =>
    `${item.name} ${item.version} ${item.license}`.toLowerCase().includes(search),
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="licenses-panel" className="licenses-dialog" lang={locale}
        initialFocus={titleRef} finalFocus={returnFocus} showCloseButton={false}>
        <DialogHeader className="licenses-header">
          <span className="licenses-eyebrow"><ScrollText size={18} aria-hidden="true" />
            {l("WITH THANKS TO THE COMMUNITY", "感谢开源社区")}
          </span>
          <DialogTitle ref={titleRef} tabIndex={-1} className="licenses-title">
            {l("Open-source licenses", "开源许可")}
          </DialogTitle>
          <DialogDescription className="licenses-description">
            {l(
              "This game is made with open-source projects. Explore their licenses and original copyright notices below, including the tools used to build it.",
              "本游戏的开发离不开开源项目。下方保留了项目依赖及构建工具的许可与原始版权声明，感谢这些贡献者。",
            )}
          </DialogDescription>
          <button type="button" className="licenses-close" onClick={() => onOpenChange(false)}
            aria-label={l("Close licenses", "关闭开源许可")}><X aria-hidden="true" /></button>
        </DialogHeader>
        <div className="licenses-tools">
          <label className="licenses-search">
            <span>{l("Find a project or license", "查找项目或许可")}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder={l("e.g. React, Lucide, MIT", "例如 React、Lucide、MIT")} />
          </label>
        </div>
        {!inventory && !failed && <p role="status">{l("Loading licenses…", "正在加载许可…")}</p>}
        {failed && <div className="licenses-error" role="alert">
          <p>{l("Could not load the licenses. Please try again.", "暂时无法加载许可，请重试。")}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{l("Try again", "重试")}</button>
        </div>}
        {inventory && <>
          <p className="licenses-count" role="status">
            {l(`${packages.length} of ${inventory.packages.length} packages`, `共 ${inventory.packages.length} 个依赖，显示 ${packages.length} 个`)}
          </p>
          <div className="licenses-list">
            {packages.map((item) => <details className="license-entry" key={`${item.name}@${item.version}`}>
              <summary>
                <span className="license-package-name"><strong>{item.name}</strong><small>{item.version}</small></span>
                <span className="license-type">{item.license}</span>
                <ChevronDown className="license-chevron" size={16} aria-hidden="true" />
              </summary>
              <div className="license-entry-content">
                <div className="license-package-meta">
                  <span>{item.scope === "development" ? l("Build dependency", "构建依赖") : l("Project dependency", "项目依赖")}</span>
                </div>
                {item.notices.map((notice, index) => <section key={`${notice.file}-${index}`}>
                  <h3>{notice.file}</h3><pre>{notice.text}</pre>
                </section>)}
                {item.status !== "complete" && <p>{l("The package did not include its full license text.", "该依赖未附带完整许可文本。")}</p>}
              </div>
            </details>)}
            {!packages.length && <p>{l("No matching projects or licenses.", "没有匹配的项目或许可。")}</p>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
