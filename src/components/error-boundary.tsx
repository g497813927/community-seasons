import { Component, type ErrorInfo, type ReactNode } from "react";

/** Last-resort screen: a render or effect error must never leave a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Community Seasons stopped unexpectedly.", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    // The saved locale lives behind the app that just failed, so show both
    // supported languages unconditionally rather than guessing one. Each line
    // carries its own lang for correct screen-reader pronunciation.
    return (
      <div role="alert" style={{ padding: 24, color: "#eaf6f4", background: "#142d31", minHeight: "100dvh", font: "16px/1.5 system-ui, sans-serif" }}>
        <p lang="en">The game ran into a problem and could not continue. Your save is untouched.</p>
        <p lang="zh-CN">游戏遇到问题，没能继续运行。你的存档没有受到影响。</p>
        <button type="button" onClick={() => location.reload()} style={{ font: "inherit", padding: "8px 16px", minHeight: 44 }}>
          <span lang="en">Reload</span> / <span lang="zh-CN">重新加载</span>
        </button>
      </div>
    );
  }
}
