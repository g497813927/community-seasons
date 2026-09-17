"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { Cloud, CloudCheck, CloudOff, LoaderCircle, RefreshCw, X } from "lucide-react";
import type { CloudSaveState } from "@/lib/game/cloud-save";
import type { Locale } from "@/lib/game/i18n";
import "./cloud-save-status.css";

const APP_HINT_DISMISSED_KEY = "community-seasons-bilibili-hint-dismissed";
let appHintDismissedForSession = false;

export interface CloudSaveStatusProps {
  locale: Locale;
  status: CloudSaveState["status"];
  label: string;
  error?: string;
  busy: boolean;
  compact: boolean;
  suggestBilibili?: boolean;
  onRetry: () => void | Promise<void>;
}

export function CloudSaveStatus(props: CloudSaveStatusProps) {
  return (
    <Toast.Provider timeout={10000} limit={1}>
      <CloudSaveStatusContent {...props} />
    </Toast.Provider>
  );
}

function CloudSaveStatusContent({
  locale,
  status,
  label,
  error,
  busy,
  compact,
  suggestBilibili = false,
  onRetry,
}: CloudSaveStatusProps) {
  const { toasts, add, close } = Toast.useToastManager();
  const toastId = useId();
  const previousError = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toastElementRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const retryInFlight = useRef(false);
  const [retryPending, setRetryPending] = useState(false);
  const [appHintDismissed, setAppHintDismissed] = useState(() => {
    if (appHintDismissedForSession) return true;
    try {
      const dismissed = localStorage.getItem(APP_HINT_DISMISSED_KEY) === "1";
      if (dismissed) appHintDismissedForSession = true;
      return dismissed;
    } catch {
      return false;
    }
  });
  const pending = busy || retryPending;
  const hasError = Boolean(error) || status === "error" || status === "unsupported";
  const failureDescription = error || (status === "unsupported"
    ? (locale === "zh-CN" ? "当前环境不支持云存档。" : "Cloud saving is not supported here.")
    : (locale === "zh-CN"
      ? "暂时无法同步云存档，请稍后重试。"
      : "Cloud saving is temporarily unavailable. Please try again."));
  const recommendation = locale === "zh-CN"
    ? "想获得更好的体验，请点击上方右侧的「B站内打开」。"
    : "For a better experience, tap “B站内打开” (Open in Bilibili) at the top right.";
  const toastTitle = suggestBilibili
    ? (locale === "zh-CN" ? "在哔哩哔哩内游玩" : "Open in Bilibili")
    : label;
  const description = suggestBilibili ? recommendation : failureDescription;
  const errorKey = suggestBilibili || hasError ? `${suggestBilibili}:${status}:${error ?? ""}` : null;
  const toastOpen = toasts.some(toast => toast.id === toastId && toast.transitionStatus !== "ending");
  const openToast = useCallback(() => {
    if (suggestBilibili && appHintDismissed) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !toastElementRef.current?.contains(active)) {
      returnFocusRef.current = active;
    }
    // The recommendation has no reopen trigger, so give the player unlimited
    // reading time. Ordinary cloud errors keep the provider's timed dismissal.
    add({ id: toastId, type: "error", priority: "low", timeout: suggestBilibili ? 0 : undefined, onClose: () => {
      if (!toastElementRef.current?.contains(document.activeElement)) return;
      const target = triggerRef.current ?? returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    } });
  }, [add, toastId, suggestBilibili, appHintDismissed]);

  useEffect(() => {
    if ((!compact && !suggestBilibili) || pending || errorKey === null || (suggestBilibili && appHintDismissed)) {
      close(toastId);
      previousError.current = null;
      return;
    }
    // Dismissal remains respected through ordinary home-screen updates. A new
    // failure, including the same failure after a retry, can notify again.
    if (previousError.current !== errorKey) {
      previousError.current = errorKey;
      openToast();
    }
  }, [compact, suggestBilibili, appHintDismissed, pending, errorKey, toastId, openToast, close]);

  function dismissAppHintPermanently() {
    // The in-memory preference still applies when browser storage is blocked.
    appHintDismissedForSession = true;
    setAppHintDismissed(true);
    close(toastId);
    try {
      localStorage.setItem(APP_HINT_DISMISSED_KEY, "1");
    } catch {
      // Keep the notice dismissed through subsequent runs in this page session.
    }
  }

  async function retry() {
    if (pending || retryInFlight.current) return;
    retryInFlight.current = true;
    setRetryPending(true);
    close(toastId);
    try {
      await onRetry();
    } catch {
      // The existing cloud controller owns the translated error/status props.
      // Keep a rejected retry from becoming an unhandled browser exception.
    } finally {
      retryInFlight.current = false;
      setRetryPending(false);
    }
  }

  const icon = pending
    ? <span className="cloud-status-spinner"><LoaderCircle size={18} aria-hidden="true" /></span>
    : hasError
      ? <CloudOff size={18} aria-hidden="true" />
      : status === "synced"
        ? <CloudCheck size={18} aria-hidden="true" />
        : <Cloud size={18} aria-hidden="true" />;
  const showDetails = locale === "zh-CN" ? "查看云存档详情" : "Show cloud save details";
  const triggerLabel = compact && hasError ? `${label}. ${description} ${showDetails}` : label;

  return (
    <>
      {!suggestBilibili && <div className={`cloud-save-status${compact ? " compact" : ""}`} data-status={status}
        aria-live={compact ? undefined : "polite"}>
        <button ref={triggerRef} type="button" className="cloud-status-trigger" disabled={pending}
          aria-label={triggerLabel} aria-busy={pending}
          aria-haspopup={compact && hasError ? "dialog" : undefined}
          aria-expanded={compact && hasError ? toastOpen : undefined}
          aria-controls={compact && hasError ? toastId : undefined}
          title={compact ? label : undefined}
          onClick={() => {
            if (compact && hasError) openToast();
            else void retry();
          }}>
          {icon}
          {!compact && <span>{label}</span>}
        </button>
        {!compact && error && <small>{error}</small>}
      </div>}
      <Toast.Portal>
        <Toast.Viewport className={`cloud-status-toast-viewport${suggestBilibili ? " cloud-status-coachmark" : ""}`} lang={locale}
          aria-label={suggestBilibili
            ? (locale === "zh-CN" ? "游戏提示" : "Game notices")
            : (locale === "zh-CN" ? "云存档通知" : "Cloud save notifications")}>
          {suggestBilibili && toastOpen && (
            <svg className="cloud-status-app-arrow" viewBox="0 0 44 50" aria-hidden="true" focusable="false">
              <path d="M6 48C25 48 33 23 33 2M25 10L33 2L41 10" />
            </svg>
          )}
          {toasts.map(toast => (
            <Toast.Root key={toast.id} ref={toastElementRef} toast={toast} id={toast.id} className="cloud-status-toast"
              swipeDirection={[]} onKeyDown={event => event.stopPropagation()}>
              <Toast.Content>
                <Toast.Title className="cloud-status-title">{toastTitle}</Toast.Title>
                <Toast.Description className="cloud-status-description">{description}</Toast.Description>
                <div className="cloud-status-toast-actions">
                  {!suggestBilibili && <Toast.Action className="cloud-status-retry" disabled={pending} onClick={() => void retry()}>
                    <RefreshCw size={17} aria-hidden="true" />
                    {locale === "zh-CN" ? "重试" : "Retry"}
                  </Toast.Action>}
                  <Toast.Close className="cloud-status-dismiss" aria-hidden={false}>
                    <X size={17} aria-hidden="true" />
                    {locale === "zh-CN" ? "关闭" : "Dismiss"}
                  </Toast.Close>
                  {suggestBilibili && (
                    <Toast.Action className="cloud-status-opt-out" onClick={dismissAppHintPermanently}>
                      {locale === "zh-CN" ? "不再提示" : "Don’t show again"}
                    </Toast.Action>
                  )}
                </div>
              </Toast.Content>
            </Toast.Root>
          ))}
        </Toast.Viewport>
      </Toast.Portal>
    </>
  );
}
