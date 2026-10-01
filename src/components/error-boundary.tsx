import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { LOCALE_STORAGE_KEY, readInitialLocale, type Locale } from "@/lib/game/i18n";

type CopyState = "idle" | "copied" | "selected";
interface State {
  error: unknown;
  componentStack: string;
  copy: CopyState;
  locale: Locale;
}

const COPY = {
  en: {
    title: "Something went wrong",
    body: "The game couldn’t continue on this device. Your save is untouched.",
    reload: "Reload",
    hint: "Still stuck? Close other tabs or apps to free up memory, then reload.",
    details: "Error details",
    detailsNote: "Share this with the developer to help fix the problem.",
    reportLabel: "Error report",
    copyDetails: "Copy details",
    copied: "Copied",
    selected: "Text selected — use your device’s Copy to copy it.",
    switchTo: "中文",
    switchLabel: "切换到中文",
  },
  "zh-CN": {
    title: "出了点问题",
    body: "游戏没能在此设备上继续运行。你的存档没有受到影响。",
    reload: "重新加载",
    hint: "仍无法打开？请关闭其他标签页或应用以释放内存，然后重新加载。",
    details: "错误详情",
    detailsNote: "可将以下信息发送给开发者以帮助排查问题。",
    reportLabel: "错误报告",
    copyDetails: "复制详情",
    copied: "已复制",
    selected: "已选中文本，请使用系统的“拷贝”进行复制。",
    switchTo: "English",
    switchLabel: "Switch to English",
  },
} as const satisfies Record<Locale, Record<string, string>>;

/** Plain-text report a player can paste to us. No saves, storage or query strings. */
function describeFailure(error: unknown, componentStack: string): string {
  const failure = error instanceof Error ? error : new Error(String(error));
  return [
    `${failure.name}: ${failure.message}`,
    `Time: ${new Date().toISOString()}`,
    `Page: ${location.origin}${location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    `Viewport: ${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    "",
    "Stack:",
    (failure.stack ?? "(unavailable)").trim(),
    "",
    "Component stack:",
    componentStack.trim() || "(unavailable)",
  ].join("\n");
}

/** Last-resort screen: a render or effect error must never leave a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, componentStack: "", copy: "idle", locale: "en" };
  private details = createRef<HTMLPreElement>();
  static getDerivedStateFromError(error: unknown): Partial<State> {
    // Same choice the game would have made: saved setting, then browser languages.
    return { error: error ?? new Error("Unknown error"), locale: readInitialLocale() };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("Community Seasons stopped unexpectedly.", error, info.componentStack);
  }
  private toggleLocale = () => {
    const next: Locale = this.state.locale === "en" ? "zh-CN" : "en";
    document.documentElement.lang = next;
    // Persist like the in-game switcher so the reloaded game uses it too.
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {}
    this.setState({ locale: next, copy: "idle" });
  };
  private copyDetails = async (report: string) => {
    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copy: "copied" });
    } catch {
      // Clipboard access is often blocked inside embedding iframes. Select the
      // report instead so it can be copied with the platform's own gesture.
      const node = this.details.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      this.setState({ copy: "selected" });
    }
  };
  render() {
    if (this.state.error === null) return this.props.children;
    const { locale, copy } = this.state;
    const t = COPY[locale];
    const other: Locale = locale === "en" ? "zh-CN" : "en";
    const report = describeFailure(this.state.error, this.state.componentStack);
    return (
      <main className="crash-screen" lang={locale}>
        <section className="crash-card" role="alert" aria-labelledby="crash-title">
          <button type="button" className="crash-locale" lang={other} aria-label={t.switchLabel} onClick={this.toggleLocale}>
            {t.switchTo}
          </button>
          <svg className="crash-mascot" viewBox="0 0 96 88" aria-hidden="true">
            <path d="M34 18 24 4M62 18l10-14" />
            <rect x="12" y="18" width="72" height="56" rx="12" />
            <rect className="crash-mascot-screen" x="22" y="28" width="52" height="36" rx="6" />
            <path className="crash-mascot-face" d="M37 42h.01M59 42h.01M38 55c6-5 14-5 20 0" />
            <path d="M34 74v8M62 74v8" />
          </svg>
          <h1 id="crash-title">{t.title}</h1>
          <p>{t.body}</p>
          <button type="button" className="crash-reload" onClick={() => location.reload()}>
            {t.reload}
          </button>
          <p className="crash-hint">{t.hint}</p>
          <details className="crash-details" onToggle={() => this.setState({ copy: "idle" })}>
            <summary>{t.details}</summary>
            <p className="crash-details-note">{t.detailsNote}</p>
            {/* The report stays in English: it is meant for the developer. */}
            <pre ref={this.details} lang="en" tabIndex={0} aria-label={t.reportLabel}>{report}</pre>
            <button type="button" className="crash-copy" onClick={() => void this.copyDetails(report)}>
              {copy === "copied" ? t.copied : t.copyDetails}
            </button>
            <p className="crash-copy-status" aria-live="polite">
              {copy === "selected" ? t.selected : null}
            </p>
          </details>
        </section>
      </main>
    );
  }
}
