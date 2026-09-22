"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Trophy, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/lib/game/i18n";
import { normalizeLeaderboardAvatar } from "@/lib/game/leaderboard";
import "./leaderboard-dialog.css";

export type LeaderboardPeriod = "day" | "week";
export type LeaderboardEligibility = "ready" | "pending" | "unavailable" | "invalid" | "submitted" | "uncertain" | "declined" | "failed";
export type LeaderboardPreference = "checking" | "ask" | "enabled" | "disabled" | "unavailable";
export interface LeaderboardEntry {
  rank: number;
  score: number;
  name: string | null;
  avatar: string | null;
  isSelf: boolean;
}
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  self: LeaderboardEntry | null;
}
export interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  returnFocus: () => HTMLElement | false;
  load: (period: LeaderboardPeriod) => Promise<LeaderboardResult>;
  consented: boolean;
  preference: LeaderboardPreference;
  join: () => Promise<void>;
  decline: () => Promise<void>;
  score: number | null;
  eligibility: LeaderboardEligibility;
  available: boolean;
}

function PlayerAvatar({ source }: { source: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="leaderboard-avatar" aria-hidden="true">
    {source && !failed
      ? <img src={source} alt="" width={32} height={32} referrerPolicy="no-referrer"
          loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <UserRound size={19} />}
  </span>;
}

export function LeaderboardDialog({
  open, onOpenChange, locale, returnFocus, load, consented, preference, join, decline, score, eligibility, available,
}: LeaderboardDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousEligibility = useRef(eligibility);
  const joiningRef = useRef(false);
  const decliningRef = useRef(false);
  const choiceSequenceRef = useRef(0);
  const joinViewRef = useRef(0);
  const [choiceAction, setChoiceAction] = useState<"join" | "decline" | null>(null);
  const [choiceFailed, setChoiceFailed] = useState<"preference" | "join" | "decline" | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [result, setResult] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const l = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const number = (value: number) => value.toLocaleString(locale);

  useEffect(() => {
    joinViewRef.current += 1;
    setChoiceFailed(null);
  }, [open, score]);

  useEffect(() => {
    if (eligibility === "submitted" && previousEligibility.current !== "submitted")
      setAttempt((value) => value + 1);
    previousEligibility.current = eligibility;
  }, [eligibility]);

  useEffect(() => {
    if (!open || !available) return;
    let current = true;
    setLoading(true);
    setFailed(false);
    setResult(null);
    void load(period).then((next) => {
      if (current) setResult(next);
    }).catch(() => {
      if (current) setFailed(true);
    }).finally(() => {
      if (current) setLoading(false);
    });
    // A slower previous period (or a closed dialog) must not replace this view.
    return () => { current = false; };
  }, [open, available, period, load, attempt]);

  const canJoin = available && !consented && preference !== "checking" && score !== null && ["ready", "declined", "failed", "submitted"].includes(eligibility);
  const canDecline = available && (preference !== "disabled" || canJoin);
  const stopping = consented || preference === "checking" || preference === "unavailable" || eligibility === "pending" || eligibility === "uncertain";
  async function chooseParticipation(action: "join" | "decline") {
    if (action === "join" ? !canJoin || joiningRef.current || decliningRef.current : !canDecline || decliningRef.current) return;
    if (action === "join") joiningRef.current = true;
    else decliningRef.current = true;
    const view = joinViewRef.current;
    const sequence = ++choiceSequenceRef.current;
    setChoiceAction(action);
    setChoiceFailed(null);
    try {
      if (action === "join") await join();
      else {
        await decline();
        if (view === joinViewRef.current) onOpenChange(false);
      }
    } catch (error) {
      const cloudFailure = typeof error === "object" && error !== null && "code" in error && error.code === "preference-unavailable";
      if (view === joinViewRef.current && sequence === choiceSequenceRef.current) setChoiceFailed(cloudFailure ? "preference" : action);
    } finally {
      if (action === "join") joiningRef.current = false;
      else decliningRef.current = false;
      if (sequence === choiceSequenceRef.current) setChoiceAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="leaderboard-panel" className="leaderboard-dialog" lang={locale}
        initialFocus={titleRef} finalFocus={returnFocus} showCloseButton={false}>
        <DialogHeader className="leaderboard-header">
          <span className="leaderboard-eyebrow"><Trophy size={18} aria-hidden="true" />
            {l("COMMUNITY IN MOTION", "社区同行")}
          </span>
          <DialogTitle ref={titleRef} tabIndex={-1} className="leaderboard-title">
            {l("Leaderboard", "排行榜")}
          </DialogTitle>
          <DialogDescription className="leaderboard-description">
            {l(
              "A fresh challenge, every day and week. After you join, eligible new runs are submitted automatically. Older saved personal bests are not entered.",
              "每日、每周，迎接新的挑战。选择参与后，按当前规则完成且通过检查的新成绩会自动提交，过去存档中的最高分不会上榜。",
            )}
          </DialogDescription>
          <button type="button" className="leaderboard-close" onClick={() => onOpenChange(false)}
            aria-label={l("Close leaderboard", "关闭排行榜")}><X aria-hidden="true" /></button>
        </DialogHeader>

        {!available ? <p className="leaderboard-notice" role="status">
          {l("Open the game on Toy to view the leaderboard. Sign in to Bilibili and finish a new run there to choose whether to join. You can keep playing here and saving your personal best on this device.",
            "在 Toy 中打开游戏即可查看排行榜，登录哔哩哔哩并完成新的一局后，可选择是否参与。你仍可在这里游玩，并在本机保存个人最高分。")}
        </p> : <>
          <fieldset className="leaderboard-periods">
            <legend className="sr-only">{l("Leaderboard period", "排行榜周期")}</legend>
            {(["week", "day"] as const).map((value) => <label key={value}>
              <input type="radio" name="leaderboard-period" value={value} checked={period === value}
                onChange={() => setPeriod(value)} />
              <span>{value === "week" ? l("This week", "本周") : l("Today", "今日")}</span>
            </label>)}
          </fieldset>

          <section className="leaderboard-results" aria-label={period === "week" ? l("This week’s leaderboard", "本周排行榜") : l("Today’s leaderboard", "今日排行榜")}
            aria-busy={loading}>
            {loading && <p className="leaderboard-status" role="status">
              <LoaderCircle className="leaderboard-spinner" size={17} aria-hidden="true" />
              {l("Loading scores…", "正在加载成绩…")}
            </p>}
            {failed && <div className="leaderboard-error" role="alert">
              <p>{l("Could not load the leaderboard. Check your connection and Bilibili sign-in, then try again.", "暂时无法加载排行榜。请检查网络及哔哩哔哩登录状态后重试。")}</p>
              <button type="button" className="leaderboard-retry" onClick={() => setAttempt((value) => value + 1)}>
                {l("Try again", "重试")}
              </button>
            </div>}
            {result && <>
              {result.entries.length > 0 ? <table className="leaderboard-table">
                <caption className="sr-only">{period === "week" ? l("This week’s scores", "本周成绩") : l("Today’s scores", "今日成绩")}</caption>
                <thead><tr>
                  <th scope="col">{l("Rank", "排名")}</th>
                  <th scope="col">{l("Player", "玩家")}</th>
                  <th scope="col">{l("Score", "分数")}</th>
                </tr></thead>
                <tbody>{result.entries.map((entry, index) => {
                  const avatar = normalizeLeaderboardAvatar(entry.avatar);
                  return <tr key={`${entry.rank}-${index}`} className={entry.isSelf ? "leaderboard-self-row" : undefined}>
                    <td>{number(entry.rank)}</td>
                    <th scope="row"><span className="leaderboard-player">
                      {/* A new URL key remounts this avatar and clears its image-error state. */}
                      <PlayerAvatar key={avatar ?? "fallback"} source={avatar} />
                      <span className="leaderboard-player-name">{entry.name?.trim() || l("Player", "玩家")}
                        {entry.isSelf && <span className="leaderboard-you">{l("You", "你")}</span>}
                      </span>
                    </span></th>
                    <td>{number(entry.score)}</td>
                  </tr>;
                })}</tbody>
              </table> : <p className="leaderboard-empty" role="status">
                {l("No scores yet for this period. A fresh challenge awaits!", "本期还没有成绩，新的挑战等着你！")}
              </p>}
              <div className="leaderboard-own-position">
                <span>{l("Your position", "你的排名")}</span>
                {result.self ? <strong>{l(`No. ${number(result.self.rank)} · ${number(result.self.score)} points`, `第 ${number(result.self.rank)} 名 · ${number(result.self.score)} 分`)}</strong>
                  : <span>{l("No rank available — sign in and finish a new run", "暂无排名，请登录并完成新的一局")}</span>}
              </div>
            </>}
          </section>

          <button type="button" className="leaderboard-retry leaderboard-refresh" disabled={loading}
            onClick={() => setAttempt((value) => value + 1)}>
            {l("Refresh scores", "刷新成绩")}
          </button>

          <section className="leaderboard-post" aria-labelledby="leaderboard-post-title">
            <div className="leaderboard-post-heading">
              <h3 id="leaderboard-post-title">{l("Your latest completed run", "最近完成的一局")}</h3>
              {score !== null && <strong>{l(`${number(score)} points`, `${number(score)} 分`)}</strong>}
            </div>
            <p className="leaderboard-privacy" id="leaderboard-privacy-note">
              {l("Joining makes your Toy nickname, avatar and score public on this leaderboard. Toy uses your Bilibili account and may request permission.", "参与后，你的 Toy 昵称、头像和成绩会在本排行榜公开显示。Toy 会使用你的哔哩哔哩账号，并可能请求授权。")}
            </p>
            <p className="leaderboard-privacy" id="leaderboard-consent-note">
              {consented ? l("Your leaderboard choice is saved to your Bilibili account and synced across devices. Eligible new runs are submitted automatically after they finish.", "参与选择已保存至你的哔哩哔哩账号，并在设备间同步。通过检查的新成绩会在每局结束后自动提交。")
                : eligibility === "submitted" ? l("Your score is already posted. Save your leaderboard choice to enable automatic submission for eligible future runs. The choice syncs through your Bilibili account across devices.", "本局成绩已经提交。保存排行参与选择后，以后各局有效新成绩会自动提交。选择会通过你的哔哩哔哩账号在设备间同步。")
                : l("Joining posts this score and turns on automatic submission for eligible future runs. Your choice is saved to your Bilibili account and synced across devices. Choose Not now to keep automatic submissions off.", "选择参与会提交本局成绩，并开启以后各局有效新成绩的自动提交。选择会保存至你的哔哩哔哩账号，并在设备间同步。选择“暂不参与”可保持自动提交关闭。")}
            </p>
            <p className="leaderboard-privacy" id="leaderboard-optout-note">
              {l("You can stop future submissions at any time. This does not remove scores already posted or cancel a submission already in progress.", "你可以随时停止提交后续成绩。这不会删除已发布的成绩，也无法取消正在进行的提交。")}
            </p>
            {preference === "disabled" && <p className="leaderboard-notice" role="status">
              {l("Future submissions are off.", "后续成绩提交已关闭。")}
            </p>}
            {preference === "checking" && <p className="leaderboard-notice" role="status">
              {l("Checking your Bilibili leaderboard choice…", "正在读取哔哩哔哩账号的排行参与选择…")}
            </p>}
            {preference === "unavailable" && <p className="leaderboard-error" role="status">
              {eligibility === "submitted"
                ? l("Score posted, but your choice could not sync. Automatic posting stays off until your choice is saved.", "成绩已提交，但参与选择未能同步。成功保存选择前，自动提交会保持关闭。")
                : l("Your leaderboard choice could not sync with Bilibili. Automatic submissions stay off here. Retry saving your choice to sync it across devices.", "暂时无法同步哔哩哔哩账号的排行参与选择，本次游玩不会自动提交。请重试保存选择，以同步至其他设备。")}
            </p>}
            {eligibility === "submitted" ? <p className="leaderboard-status leaderboard-success" role="status">
              <Check size={18} aria-hidden="true" />{l("Score submitted. Thanks for playing!", "成绩已提交，感谢参与！")}
            </p> : eligibility === "pending" || choiceAction === "join" ? <p className="leaderboard-status" role="status">
              <LoaderCircle className="leaderboard-spinner" size={17} aria-hidden="true" />
              {l("Submitting your completed run…", "正在提交本局成绩…")}
            </p> : eligibility === "uncertain" ? <p className="leaderboard-notice" role="status">
              {l("Submission could not be confirmed. Refresh the scores to check your rank. This run will not be submitted again.", "暂时无法确认提交结果。请刷新成绩查看排名，本局不会重复提交。")}
            </p> : eligibility === "declined" ? <p className="leaderboard-notice" role="status">
              {l("Permission was declined, so this score was not submitted. Your progress is saved locally. You can choose to join later.", "你未同意授权，因此本局成绩没有提交。进度已保存在本机，你可以稍后再选择参与。")}
            </p> : eligibility === "failed" ? <p className="leaderboard-notice" role="status">
              {consented ? l("This score could not be submitted. Your progress is saved locally. Check your connection and Bilibili sign-in; a new run can try again.", "本局成绩暂时无法提交，进度已保存在本机。请检查网络及哔哩哔哩登录状态，新的一局结束后可再次尝试。")
                : l("This score could not be submitted. Your progress is saved locally. Check your connection and Bilibili sign-in, then choose to join again when you are ready.", "本局成绩暂时无法提交，进度已保存在本机。请检查网络及哔哩哔哩登录状态，你可以稍后再选择参与。")}
            </p> : eligibility === "invalid" ? <p className="leaderboard-notice">
              {l("This run could not pass the score checks. Start a new run to try again.", "本局未通过成绩检查。重新开始一局后再试吧。")}
            </p> : !canJoin && preference !== "checking" ? <p className="leaderboard-notice">
              {l("Only new, completed runs are eligible. Finish a fresh run to take part.", "仅限本次游玩中完成的新成绩。完成新的一局后即可参与。")}
            </p> : null}
            {(choiceAction === "decline" || choiceAction === "join" && eligibility === "submitted") && <p className="leaderboard-status" role="status">
              <LoaderCircle className="leaderboard-spinner" size={17} aria-hidden="true" />
              {l("Saving your leaderboard choice…", "正在保存排行参与选择…")}
            </p>}
            {(canJoin || canDecline) && <div className="leaderboard-join-actions">
              {canJoin && <button type="button" className="leaderboard-join" disabled={choiceAction !== null}
                aria-describedby="leaderboard-privacy-note leaderboard-consent-note leaderboard-optout-note" onClick={() => void chooseParticipation("join")}>
                {eligibility === "submitted" ? l("Save leaderboard choice", "保存排行参与选择") : l("Join leaderboard & post this score", "参与排行并提交本局成绩")}
              </button>}
              {canDecline && <button type="button" className="leaderboard-defer" disabled={choiceAction === "decline"}
                aria-describedby="leaderboard-optout-note" onClick={() => void chooseParticipation("decline")}>
                {stopping ? l("Stop future submissions", "停止提交后续成绩") : l("Not now", "暂不参与")}
              </button>}
              {choiceFailed && (choiceFailed !== "join" || eligibility === "ready") && !(choiceFailed === "preference" && preference === "unavailable") && <p className="leaderboard-error" role="alert">
                {choiceFailed === "preference"
                  ? eligibility === "submitted"
                    ? l("Score posted, but your choice could not sync. Automatic posting stays off until your choice is saved.", "成绩已提交，但参与选择未能同步。成功保存选择前，自动提交会保持关闭。")
                    : l("Your leaderboard choice could not be saved to Bilibili. Automatic submissions stay off. Please try again.", "排行参与选择未能保存至哔哩哔哩账号，自动提交会保持关闭。请重试。")
                  : choiceFailed === "decline"
                    ? l("Your choice could not be saved. Future submissions are off here; retry to sync this choice across devices.", "未能保存你的选择。本次游玩不会再自动提交，请重试以将选择同步至其他设备。")
                    : eligibility === "ready"
                      ? l("Could not join. Your progress is saved locally. Please try again when you are ready.", "暂时无法参与排行，进度已保存在本机。你可以稍后重试。")
                      : null}
              </p>}
            </div>}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  );
}
