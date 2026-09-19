"use client";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Coins,
  Trophy,
  Pause,
  Play,
  Volume2,
  VolumeX,
  RotateCcw,
  Footprints,
  ShoppingBag,
  Languages,
  Home as HomeIcon,
  Shield,
  Flower2,
  MessageSquareHeart,
  PartyPopper,
  CircleHelp,
  Share2,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyRef } from "@/lib/use-lazy-ref";
import { resolveLocale, translate, type Locale } from "@/lib/game/i18n";
import {
  act,
  createRun,
  update,
  togglePause,
  finishReview,
  selectRailLane,
  submitRailAnswer,
  type PostReview,
  MONSTER_INTRO_DURATION,
  SCENE_TRANSITION_DURATION,
  PORTAL_INTERVAL,
  type Action,
  type RunState,
} from "@/lib/game/engine";
import { Renderer } from "@/lib/game/render";
import { listenToMediaQuery } from "@/lib/game/media-query";
import { BackgroundMusic } from "@/lib/game/music";
import { createRecordProgress, updateRecordProgress } from "@/lib/game/records";
import { PostReviewDialog } from "@/components/post-review";
import { SeasonTravel } from "@/components/season-travel";
import { RotateDevice } from "@/components/rotate-device";
import {
  needsPortrait,
  portraitPromptHeight,
  readGameViewport,
  sameGameViewport,
} from "@/lib/game/viewport";
import { ControlsGuide } from "@/components/controls-guide";
import { RailQuiz, RailFailure } from "@/components/rail-quiz";
import { RailTravel } from "@/components/rail-travel";
import { railTravelFrame } from "@/lib/game/rail-transition";
import { createRailQuestionDeck, type RailRide, type RailQuestion } from "@/lib/game/railway";
import { CloudSaveDialog } from "@/components/cloud-save-dialog";
import { CloudSaveStatus } from "@/components/cloud-save-status";
import { ShareDialog } from "@/components/share-dialog";
import { HelpDialog } from "@/components/help-dialog";
import { LicensesDialog } from "@/components/licenses-dialog";
import type { SharePosterSnapshot } from "@/lib/game/share-poster";
import type { LessonShareSnapshot } from "@/lib/game/lesson-share-poster";
import {
  createCloudSaveController,
  type CloudSaveState,
  type CloudSaveChoice,
  type SaveSnapshot,
} from "@/lib/game/cloud-save";
import { isToyPage, loadToyCloudStorage } from "@/lib/game/toy-sdk";
import { shouldSuggestBilibili } from "@/lib/game/cloud-browser";
import { CASES_URL, type CommunityLesson } from "@/lib/game/community";
import { isSceneKind, nextScene, sceneDefinition, type SceneKind } from "@/lib/game/scenes";
import { registerGameTools } from "@/lib/game/tools";
import {
  BOOSTERS,
  PICKUP_BOOSTERS,
  createBoostState,
  createBoostCounts,
  createBoostLevels,
  type BoostKind,
  type SkillKind,
} from "@/lib/game/boosts";
import {
  PROGRESS_KEY,
  bankRunRewards,
  buyBooster,
  buySkin,
  equipSkin,
  buyAccessory,
  equipAccessory,
  createProgress,
  readProgress,
  activateOwnedBooster,
  unlockSkill,
  activatePermanentSkill,
  upgradeBooster,
  equipPermanentSkill,
  type Progress,
} from "@/lib/game/store";
import type { SkinId } from "@/lib/game/skins";
import type { AccessoryId, CosmeticSlot } from "@/lib/game/cosmetics";
import { BoostStore, BoostTray, PermanentSkillHud, RunSetup } from "@/components/boost-store";

const keyMap: Record<string, Action> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "jump",
  w: "jump",
  W: "jump",
  " ": "jump",
  ArrowDown: "slide",
  s: "slide",
  S: "slide",
  KeyA: "left",
  KeyD: "right",
  KeyW: "jump",
  KeyS: "slide",
};
function readInitialLocale(): Locale {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("community-seasons-locale");
  } catch {}
  const preferred =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return resolveLocale(saved, preferred);
}

export default function Home() {
  const onToy = isToyPage(window.location);
  const [cloudState, setCloudState] = useState<CloudSaveState>({
    status: onToy ? "checking" : "unsupported",
    conflict: null,
    error: null,
  });
  const cloudStateRef = useRef(cloudState);
  const cloudRef = useRef<ReturnType<typeof createCloudSaveController> | null>(null);
  const [cloudActionPending, setCloudActionPending] = useState(false);
  const startAfterCloudRef = useRef(false);
  const [locale, setLocale] = useState<Locale>(readInitialLocale);
  const localeRef = useRef<Locale>(locale);
  const t = (text: string) => translate(locale, text);
  const l = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  function changeLocale() {
    lastRailUpRef.current = null;
    const next = localeRef.current === "en" ? "zh-CN" : "en";
    localeRef.current = next;
    setLocale(next);
    document.documentElement.lang = next;
    document.title = `${translate(next, "Community Seasons")} — ${translate(next, "COMMUNITY IN MOTION")}`;
    try {
      localStorage.setItem("community-seasons-locale", next);
    } catch {}
    if (game.current.mode === "running") canvasRef.current?.focus({ preventScroll: true });
  }
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [scene, setScene] = useState<SceneKind>("spring");
  const sceneRef = useRef<SceneKind>("spring");
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastRailUpRef = useRef<{
    at: number; key: string; ride: RailRide; questionIndex: number;
  } | null>(null);
  const swipeRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    fired: boolean;
    at: number;
    drift: number;
  } | null>(null);
  // Keep question history through retries/home/cloud refreshes in this session.
  // Attract-mode preview runs use their own deck and cannot consume this one.
  const railQuestionDeckRef = useLazyRef(createRailQuestionDeck);
  const game = useLazyRef<RunState>(() => createRun(4182, "spring", railQuestionDeckRef.current));
  const [viewport, setViewport] = useState(readGameViewport);
  const viewportRef = useRef(viewport);
  const rotateRequired = needsPortrait(viewport);
  const rotateRequiredRef = useRef(rotateRequired);
  const recordRef = useLazyRef(() => createRecordProgress(0));
  const recordClockRef = useRef(0);
  const [hud, setHud] = useState({
    recordTarget: 0,
    celebratingRecord: false,
    review: null as PostReview | null,
    reviewedPosts: 0,
    mode: "ready",
    travelDestination: null as SceneKind | null,
    milestone: 0,
    milestoneRemaining: 0,
    score: 0,
    distance: 0,
    coins: 0,
    speed: 12,
    reason: "",
    rail: null as RailRide | null,
    railReturnRemaining: 0,
    lane: 0,
    edgeStumble: 0,
    boosts: createBoostState(),
    time: 0,
    permanentSkill: null as SkillKind | null,
    skillCharge: 0,
    chase: 0,
    lastStumble: null as "roots" | "edge" | null,
  });
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState<Progress>(createProgress);
  const progressRef = useRef<Progress>(createProgress());
  const progressHydrated = useRef(false);
  const savingRef = useRef(true);
  const [storeOpen, setStoreOpen] = useState(false);
  const storeOpenRef = useRef(false);
  const [shareSnapshot, setShareSnapshot] = useState<SharePosterSnapshot | null>(null);
  const [lessonShareSnapshot, setLessonShareSnapshot] = useState<LessonShareSnapshot | null>(null);
  const shareOpenRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpOpenRef = useRef(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const helpDetailRef = useRef<"guide" | "licenses" | null>(null);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const licensesOpenRef = useRef(false);
  const licensesButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const lessonShareButtonRef = useRef<HTMLButtonElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDismissedForRun, setSetupDismissedForRun] = useState(false);
  const setupOpenRef = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideOpenRef = useRef(guideOpen);
  const guideSeenRef = useRef(false);
  const startAfterGuideRef = useRef(false);
  const returnToSetup = useRef(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillKind | null>(null);
  const [storeMessage, setStoreMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingAvailable, setSavingAvailable] = useState(true);
  const mutedRef = useRef(false),
    bestRef = useRef(0),
    audioRef = useRef<AudioContext | null>(null),
    musicRef = useRef<BackgroundMusic | null>(null);
  const latestCoins = useRef(0);
  function updateCloudState(next: CloudSaveState) {
    cloudStateRef.current = next;
    setCloudState(next);
  }
  function readSaveSnapshot(): SaveSnapshot {
    return {
      version: 1,
      progress: progressRef.current,
      best: bestRef.current,
      scene: sceneRef.current,
    };
  }
  function applyCloudSnapshot(snapshot: SaveSnapshot) {
    progressRef.current = snapshot.progress;
    bestRef.current = snapshot.best;
    sceneRef.current = snapshot.scene;
    game.current = createRun(4182, snapshot.scene, railQuestionDeckRef.current);
    game.current.skin = snapshot.progress.equippedSkin;
    game.current.outfit = { ...snapshot.progress.outfit };
    recordRef.current = createRecordProgress(snapshot.best);
    latestCoins.current = 0;
    setProgress(snapshot.progress);
    setBest(snapshot.best);
    setScene(snapshot.scene);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(snapshot.progress));
      localStorage.setItem("community-seasons-best", String(snapshot.best));
      localStorage.setItem("community-seasons-scene", snapshot.scene);
    } catch {
      savingRef.current = false;
      setSavingAvailable(false);
    }
    sync();
  }
  function cloudBlocksEntry() {
    return onToy && ["checking", "conflict", "pending"].includes(cloudStateRef.current.status);
  }
  async function chooseCloudSave(choice: CloudSaveChoice) {
    const controller = cloudRef.current;
    if (!controller || cloudActionPending) return;
    setCloudActionPending(true);
    try {
      await controller.resolve(choice);
      const state = controller.getState();
      if (
        startAfterCloudRef.current &&
        !state.conflict &&
        !["checking", "pending"].includes(state.status)
      ) {
        startAfterCloudRef.current = false;
        openRunSetup();
      }
    } finally {
      setCloudActionPending(false);
    }
  }
  async function retryCloudSave() {
    if (cloudActionPending) return;
    setCloudActionPending(true);
    try {
      await cloudRef.current?.retry();
      const state = cloudRef.current?.getState();
      if (
        state &&
        startAfterCloudRef.current &&
        !state.conflict &&
        !["checking", "pending"].includes(state.status)
      ) {
        startAfterCloudRef.current = false;
        openRunSetup();
      }
    } finally {
      setCloudActionPending(false);
    }
  }
  function ensureAudio(resume = false) {
    try {
      const Audio =
        typeof AudioContext !== "undefined"
          ? AudioContext
          : (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return null;
      const ac = audioRef.current ?? (audioRef.current = new Audio());
      if (resume && ac.state !== "running" && ac.state !== "closed")
        void ac.resume().catch(() => {});
      return ac;
    } catch {
      return null;
    }
  }
  function syncMusic() {
    try {
      const shouldPlay = game.current.mode === "running" && !mutedRef.current && !document.hidden;
      if (!shouldPlay) {
        musicRef.current?.pause();
        return;
      }
      const ac = audioRef.current;
      if (!ac || ac.state === "closed") return;
      const music = musicRef.current ?? (musicRef.current = new BackgroundMusic(ac));
      music.setScene(game.current.scene);
      music.play();
    } catch {
      /* The game remains playable if audio is unavailable. */
    }
  }
  function toggleSound() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (!mutedRef.current && game.current.mode === "running") ensureAudio(true);
    syncMusic();
  }
  function sound(kind: "coin" | "jump" | "slide" | "crash" | "start" | "boost" | "chase") {
    if (mutedRef.current) return;
    try {
      const ac = ensureAudio(true);
      if (!ac) return;
      const osc = ac.createOscillator(),
        gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      const now = ac.currentTime,
        freq = {
          coin: 880,
          jump: 240,
          slide: 140,
          crash: 90,
          start: 420,
          boost: 620,
          chase: 70,
        }[kind];
      osc.type = kind === "crash" || kind === "chase" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(kind === "crash" ? 30 : freq * 1.7, now + 0.13);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      /* Sound is optional when the browser has no audio output. */
    }
  }
  function sync() {
    syncMusic();
    const s = game.current;
    setHud({
      recordTarget: recordRef.current.target,
      celebratingRecord:
        recordRef.current.beaten && recordClockRef.current < recordRef.current.celebrateUntil,
      review: s.review,
      reviewedPosts: s.reviewedPosts,
      mode: s.mode,
      travelDestination: s.sceneTransition > 0 ? (s.pendingScene ?? s.scene) : null,
      milestone: s.milestone,
      milestoneRemaining: s.milestoneRemaining,
      score: s.score,
      distance: s.distance,
      coins: s.coins,
      speed: s.speed,
      reason: s.reason,
      rail: s.rail ? { ...s.rail } : null,
      railReturnRemaining: s.railReturnRemaining,
      lane: s.lane,
      edgeStumble: s.edgeStumble,
      boosts: { ...s.boosts },
      time: s.time,
      permanentSkill: s.permanentSkill,
      skillCharge: s.skillCharge,
      chase: s.chase,
      lastStumble: s.lastStumble,
    });
  }
  function saveProgress(next: Progress) {
    progressRef.current = next;
    game.current.skin = next.equippedSkin;
    game.current.outfit = { ...next.outfit };
    setProgress(next);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      savingRef.current = false;
      setSavingAvailable(false);
    }
    cloudRef.current?.markDirty();
  }
  function bankRewards() {
    const next = bankRunRewards(game.current, progressRef.current);
    if (next !== progressRef.current) saveProgress(next);
  }
  function changeStore(open: boolean) {
    if (open && (shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current)) return;
    if (open && startAfterCloudRef.current) return;
    if (open && game.current.mode === "ready" && cloudBlocksEntry()) return;
    if (open && game.current.review) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    if (open) {
      bankRewards();
      if (game.current.mode === "running") game.current.mode = "paused";
      setStoreMessage("");
      sync();
    }
    storeOpenRef.current = open;
    setStoreOpen(open);
    if (!open && returnToSetup.current) {
      returnToSetup.current = false;
      changeSetup(true);
    }
  }
  function changeHelp(open: boolean) {
    if (open && (shareOpenRef.current || licensesOpenRef.current || storeOpenRef.current ||
      setupOpenRef.current || guideOpenRef.current || startAfterCloudRef.current ||
      game.current.review || rotateRequiredRef.current)) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    helpOpenRef.current = open;
    setHelpOpen(open);
    if (open) {
      helpDetailRef.current = null;
      if (game.current.mode === "running") {
        game.current.mode = "paused";
        bankRewards();
        recordBest();
      }
    }
    sync();
  }
  function openHelpDetail(detail: "guide" | "licenses") {
    helpDetailRef.current = detail;
    changeHelp(false);
    if (detail === "guide") changeGuide(true);
    else changeLicenses(true);
  }
  function helpReturnFocus() {
    // The header can disappear after resizing to desktop while a dialog is open.
    return helpButtonRef.current?.getClientRects().length
      ? helpButtonRef.current
      : licensesButtonRef.current ?? false;
  }
  function changeLicenses(open: boolean) {
    if (open && (helpOpenRef.current || shareOpenRef.current || storeOpenRef.current || setupOpenRef.current ||
      guideOpenRef.current || startAfterCloudRef.current || game.current.review || rotateRequiredRef.current)) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    licensesOpenRef.current = open;
    setLicensesOpen(open);
    if (open && game.current.mode === "running") {
      game.current.mode = "paused";
      bankRewards();
      recordBest();
    }
    sync();
  }
  function changeSetup(open: boolean) {
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    setupOpenRef.current = open;
    if (open) setSetupDismissedForRun(false);
    setSetupOpen(open);
  }
  function changeGuide(open: boolean) {
    if (open && (shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current)) return;
    if (open && startAfterCloudRef.current) return;
    if (open && startAfterGuideRef.current) helpDetailRef.current = null;
    guideOpenRef.current = open;
    setGuideOpen(open);
    if (!open) {
      guideSeenRef.current = true;
      try {
        localStorage.setItem("community-seasons-controls-seen", "1");
      } catch {}
      if (startAfterGuideRef.current) {
        startAfterGuideRef.current = false;
        changeSetup(true);
      }
    }
  }
  function visitStoreFromSetup() {
    returnToSetup.current = true;
    changeSetup(false);
    changeStore(true);
  }
  function buy(kind: BoostKind, destination?: SceneKind) {
    const result = buyBooster(progressRef.current, kind, destination, game.current.scene);
    if (result.ok) {
      saveProgress(result.progress);
      sound("coin");
    }
    setStoreMessage(result.message);
    return result;
  }
  function notifyBoost(message: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 3000);
  }
  function buySkill(kind: BoostKind) {
    const result = unlockSkill(progressRef.current, kind);
    if (result.ok) {
      saveProgress(result.progress);
      sound("boost");
    }
    setStoreMessage(result.message);
    return result;
  }
  function purchaseSkin(skin: SkinId) {
    const result = buySkin(progressRef.current, skin);
    if (result.ok) {
      saveProgress(result.progress);
      sound("coin");
    }
    setStoreMessage(result.message);
  }
  function changeSkin(skin: SkinId) {
    const result = equipSkin(progressRef.current, skin);
    if (result.ok) saveProgress(result.progress);
    setStoreMessage(result.message);
  }
  function purchaseAccessory(id: AccessoryId) {
    const result = buyAccessory(progressRef.current, id);
    if (result.ok) {
      saveProgress(result.progress);
      sound("coin");
    }
    setStoreMessage(result.message);
  }
  function changeAccessory(slot: CosmeticSlot, id: AccessoryId | null) {
    const result = equipAccessory(progressRef.current, slot, id);
    if (result.ok) saveProgress(result.progress);
    setStoreMessage(result.message);
  }
  function triggerSkill(kind: BoostKind) {
    if (rotateRequiredRef.current) return;
    if (storeOpenRef.current || setupOpenRef.current || startAfterCloudRef.current) return;
    if (game.current.rail) return;
    const result = activatePermanentSkill(game.current, progressRef.current, kind);
    if (result.ok) {
      saveProgress(result.progress);
      sound("boost");
      sync();
    }
    notifyBoost(result.message);
    return result;
  }
  function equipSkill(kind: BoostKind) {
    const result = equipPermanentSkill(progressRef.current, kind);
    if (result.ok) {
      saveProgress(result.progress);
      if (returnToSetup.current) setSelectedSkill(result.progress.equippedSkill);
    }
    setStoreMessage(result.message);
    return result;
  }
  function upgrade(kind: BoostKind) {
    const result = upgradeBooster(progressRef.current, kind);
    if (result.ok) {
      saveProgress(result.progress);
      sound("boost");
    }
    setStoreMessage(result.message);
    return result;
  }
  function triggerBooster(kind: BoostKind) {
    if (rotateRequiredRef.current) return;
    if (storeOpenRef.current || setupOpenRef.current) return;
    if (game.current.rail) return;
    const result = activateOwnedBooster(game.current, progressRef.current, kind);
    if (result.ok) {
      saveProgress(result.progress);
      rememberScene();
      sound("boost");
      sync();
    }
    notifyBoost(result.message);
    return result;
  }
  function recordBest() {
    if (game.current.score <= bestRef.current) return;
    bestRef.current = game.current.score;
    setBest(bestRef.current);
    try {
      localStorage.setItem("community-seasons-best", String(bestRef.current));
    } catch {}
    cloudRef.current?.markDirty();
  }
  function openShareResult() {
    const run = game.current;
    if (
      run.mode !== "over" ||
      run.review ||
      shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current ||
      storeOpenRef.current ||
      setupOpenRef.current ||
      guideOpenRef.current ||
      startAfterCloudRef.current ||
      rotateRequiredRef.current
    )
      return;
    bankRewards();
    recordBest();
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    shareOpenRef.current = true;
    setShareSnapshot({
      score: run.score,
      distance: run.distance,
      coins: run.coins,
      best: bestRef.current,
      scene: run.scene,
      locale: localeRef.current,
      mode: run.rail ? "rail" : "run",
    });
  }
  function closeShareResult() {
    shareOpenRef.current = false;
    setShareSnapshot(null);
    setLessonShareSnapshot(null);
  }
  function openLessonShare(
    copy: Pick<LessonShareSnapshot, "kind" | "title" | "example" | "guidance" | "explanation">,
    trigger: HTMLButtonElement,
  ) {
    if (shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current || storeOpenRef.current || setupOpenRef.current || guideOpenRef.current || rotateRequiredRef.current) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    // Freeze feedback/falling timers while the card is open. Closing leaves
    // a live railway paused so the player explicitly resumes when ready.
    if (game.current.mode === "running") togglePause(game.current);
    lessonShareButtonRef.current = trigger;
    shareOpenRef.current = true;
    setLessonShareSnapshot({
      ...copy,
      locale: localeRef.current,
      scene: game.current.scene,
      sourceLabel: { en: "Fictional teaching example", zh: "虚构教学示例" },
    });
    sync();
  }
  function shareQuizLesson(question: RailQuestion, trigger: HTMLButtonElement) {
    const ride = game.current.rail;
    if (!ride || !["feedback", "falling"].includes(ride.phase)) return;
    const answer = question.options[question.correctIndex];
    openLessonShare({
      kind: "quiz",
      title: { en: "A thoughtful choice", zh: "选择更友善的做法" },
      example: question.prompt,
      guidance: answer.label,
      explanation: answer.why,
    }, trigger);
  }
  function sharePostLesson(lesson: CommunityLesson, trigger: HTMLButtonElement) {
    if (!game.current.review) return;
    openLessonShare({ title: lesson.title, example: lesson.example, guidance: lesson.response, explanation: lesson.why }, trigger);
  }
  function goHome() {
    if (shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    startAfterCloudRef.current = false;
    bankRewards();
    recordBest();
    returnToSetup.current = false;
    changeSetup(false);
    changeStore(false);
    game.current = createRun(4182, sceneRef.current, railQuestionDeckRef.current);
    game.current.skin = progressRef.current.equippedSkin;
    game.current.outfit = { ...progressRef.current.outfit };
    recordRef.current = createRecordProgress(bestRef.current);
    latestCoins.current = 0;
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback("");
    sync();
    void cloudRef.current?.refresh();
  }
  async function start() {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (
      storeOpenRef.current ||
      guideOpenRef.current ||
      game.current.review ||
      startAfterCloudRef.current ||
      cloudStateRef.current.status === "checking"
    )
      return;
    bankRewards();
    recordBest();
    if (!cloudRef.current) {
      openRunSetup();
      return;
    }
    if (game.current.mode === "running") game.current.mode = "paused";
    startAfterCloudRef.current = true;
    setCloudActionPending(true);
    sync();
    try {
      await cloudRef.current.refresh();
      if (!startAfterCloudRef.current) return;
      const state = cloudRef.current.getState();
      if (state.conflict || ["checking", "pending"].includes(state.status)) return;
      startAfterCloudRef.current = false;
      openRunSetup();
    } finally {
      setCloudActionPending(false);
    }
  }
  function openRunSetup() {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (storeOpenRef.current || guideOpenRef.current || game.current.review) return;
    bankRewards();
    if (game.current.mode === "running") game.current.mode = "paused";
    setSelectedSkill(progressRef.current.equippedSkill);
    try {
      guideSeenRef.current ||= localStorage.getItem("community-seasons-controls-seen") === "1";
    } catch {}
    if (guideSeenRef.current) changeSetup(true);
    else {
      startAfterGuideRef.current = true;
      changeGuide(true);
    }
    sync();
  }
  function beginRun(kind: SkillKind | null) {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (
      storeOpenRef.current ||
      guideOpenRef.current ||
      startAfterCloudRef.current ||
      cloudBlocksEntry()
    )
      return;
    if (kind && !progressRef.current.skills[kind].unlocked) return;
    bankRewards();
    recordBest();
    saveProgress({ ...progressRef.current, equippedSkill: kind });
    // A successful start removes the modal immediately, so its exit animation
    // cannot intercept the first movement or pause input. Cancel still animates.
    setSetupDismissedForRun(true);
    changeSetup(false);
    game.current = createRun(Math.floor(Math.random() * 1e7), sceneRef.current, railQuestionDeckRef.current);
    game.current.skin = progressRef.current.equippedSkin;
    game.current.outfit = { ...progressRef.current.outfit };
    recordRef.current = createRecordProgress(bestRef.current);
    musicRef.current?.dispose();
    musicRef.current = null;
    game.current.permanentSkill = kind;
    game.current.mode = "running";
    latestCoins.current = 0;
    setFeedback("");
    sound("start");
    sync();
  }
  useLayoutEffect(() => {
    if (setupDismissedForRun && game.current.mode === "running")
      canvasRef.current?.focus({ preventScroll: true });
  }, [setupDismissedForRun]);
  function rememberScene() {
    const value = game.current.scene;
    if (!isSceneKind(value) || value === sceneRef.current) return;
    sceneRef.current = value;
    setScene(value);
    try {
      localStorage.setItem("community-seasons-scene", value);
    } catch {}
    cloudRef.current?.markDirty();
  }
  function control(action: Action) {
    if (rotateRequiredRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (storeOpenRef.current || setupOpenRef.current) return;
    lastRailUpRef.current = null;
    const oldStumbles = game.current.stumbles;
    const oldShieldAbsorbed = game.current.shieldAbsorbed;
    const oldMode = game.current.mode;
    const accepted = act(game.current, action);
    if (accepted && game.current.rail) sync();
    if (accepted && (action === "jump" || action === "slide")) sound(action);
    if (game.current.stumbles > oldStumbles || game.current.shieldAbsorbed > oldShieldAbsorbed) {
      sound(game.current.mode === "over" ? "crash" : "chase");
      if (oldMode === "running" && game.current.mode === "over") {
        bankRewards();
        recordBest();
      }
      sync();
    }
  }
  function chooseRailAnswer(lane: -1 | 0 | 1) {
    if (rotateRequiredRef.current) return;
    if (storeOpenRef.current || setupOpenRef.current || startAfterCloudRef.current) return;
    lastRailUpRef.current = null;
    if (selectRailLane(game.current, lane)) {
      canvasRef.current?.focus({ preventScroll: true });
      sync();
    }
  }
  function submitRailChoice() {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (storeOpenRef.current || setupOpenRef.current || guideOpenRef.current || startAfterCloudRef.current) return;
    if (!submitRailAnswer(game.current)) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    sound(game.current.rail?.correct ? "boost" : "crash");
    canvasRef.current?.focus({ preventScroll: true });
    sync();
  }
  function beginSwipe(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    // A second finger cancels the stroke so a pinch cannot become a move.
    swipeRef.current = null;
    if (
      rotateRequiredRef.current ||
      !e.isPrimary ||
      game.current.mode !== "running" ||
      storeOpenRef.current ||
      setupOpenRef.current ||
      (e.target as HTMLElement).closest(
        'button,a,input,textarea,select,[role="button"],[data-game-controls],[data-slot="dialog-content"]',
      )
    ) {
      lastTapRef.current = null;
      lastRailUpRef.current = null;
      return;
    }
    swipeRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      fired: false,
      at: e.timeStamp,
      drift: 0,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already have ended; normal arena events still work.
    }
  }
  function moveSwipe(e: PointerEvent<HTMLElement>) {
    if (
      rotateRequiredRef.current ||
      game.current.mode !== "running" ||
      storeOpenRef.current ||
      setupOpenRef.current
    ) {
      swipeRef.current = null;
      lastTapRef.current = null;
      lastRailUpRef.current = null;
      return;
    }
    const stroke = swipeRef.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    const dx = e.clientX - stroke.x,
      dy = e.clientY - stroke.y,
      x = Math.abs(dx),
      y = Math.abs(dy);
    stroke.drift = Math.max(stroke.drift, Math.hypot(dx, dy));
    if (stroke.drift >= 12) lastTapRef.current = null;
    if (stroke.fired) return;
    // Ignore taps and ambiguous diagonals. Fire before release, once per stroke.
    let action: Action;
    if (x >= 24 && x >= y * 1.2) action = dx < 0 ? "left" : "right";
    else if (y >= 24 && y >= x * 1.2) action = dy < 0 ? "jump" : "slide";
    else return;
    stroke.fired = true;
    control(action);
  }
  function cancelSwipe(e: PointerEvent<HTMLElement>) {
    if (swipeRef.current?.pointerId === e.pointerId) {
      swipeRef.current = null;
      lastTapRef.current = null;
      lastRailUpRef.current = null;
    }
  }
  function endSwipe(e: PointerEvent<HTMLElement>) {
    moveSwipe(e);
    const stroke = swipeRef.current;
    if (stroke?.pointerId === e.pointerId) {
      const duration = e.timeStamp - stroke.at;
      if (!stroke.fired && stroke.drift < 12 && duration >= 0 && duration <= 220) {
        const last = lastTapRef.current;
        const interval = last ? e.timeStamp - last.at : Infinity;
        if (
          last &&
          interval >= 0 &&
          interval <= 300 &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 40
        ) {
          lastTapRef.current = null;
          lastRailUpRef.current = null;
          if (game.current.permanentSkill) triggerSkill(game.current.permanentSkill);
          else notifyBoost("Choose one permanent skill before your next run.");
        } else lastTapRef.current = { x: e.clientX, y: e.clientY, at: e.timeStamp };
      } else lastTapRef.current = null;
      swipeRef.current = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }
  function pause() {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    if (storeOpenRef.current || setupOpenRef.current || startAfterCloudRef.current) return;
    togglePause(game.current);
    if (game.current.mode === "running" && !mutedRef.current) ensureAudio(true);
    sync();
    if (game.current.mode === "paused") {
      bankRewards();
      recordBest();
      void cloudRef.current?.flush();
    }
  }
  function continueAfterReview() {
    if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
    if (!finishReview(game.current)) return;
    swipeRef.current = null;
    lastTapRef.current = null;
    lastRailUpRef.current = null;
    if (game.current.mode === "running" && !mutedRef.current) ensureAudio(true);
    sync();
  }
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const hover = window.matchMedia("(hover: none)");
    function updateViewport() {
      const next = readGameViewport();
      const blocked = needsPortrait(next);
      rotateRequiredRef.current = blocked;
      if (!sameGameViewport(viewportRef.current, next)) {
        viewportRef.current = next;
        setViewport(next);
      }
      if (blocked) {
        swipeRef.current = null;
        lastTapRef.current = null;
        lastRailUpRef.current = null;
        if (game.current.mode === "running") {
          game.current.mode = "paused";
          bankRewards();
          recordBest();
          sync();
        }
      }
      // Returning to a usable viewport deliberately leaves the run paused.
    }
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.screen.orientation?.addEventListener("change", updateViewport);
    const stopCoarseChanges = listenToMediaQuery(coarse, updateViewport);
    const stopHoverChanges = listenToMediaQuery(hover, updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.screen.orientation?.removeEventListener("change", updateViewport);
      stopCoarseChanges();
      stopHoverChanges();
    };
  }, []);
  useEffect(() => {
    // Preserve an existing run across a hot reload when the store is added.
    game.current.boosts = { ...createBoostState(), ...game.current.boosts };
    game.current.bankedCoins ??= 0;
    game.current.effectLevels = {
      ...createBoostLevels(),
      ...game.current.effectLevels,
    };
    game.current.relics ??= [];
    game.current.collectedRelics = {
      ...createBoostCounts(),
      ...game.current.collectedRelics,
    };
    game.current.nextRelicAt ??= game.current.distance + 65;
    game.current.permanentSkill ??= null;
    game.current.skillCharge ??= 0;
    game.current.chase ??= 0;
    game.current.stumbles ??= 0;
    game.current.lastStumble ??= null;
    game.current.shieldAbsorbed ??= 0;
    game.current.scene ??= "spring";
    game.current.nextPortalAt ??=
      (Math.floor(game.current.distance / PORTAL_INTERVAL) + 1) * PORTAL_INTERVAL;
    game.current.sceneTransition ??= 0;
    game.current.pendingScene ??= null;
    game.current.sceneTransitionFrom ??= null;
    game.current.portalLane ??= ((game.current.seed >>> 0) % 3) - 1;
    const journeyDefaults =
      game.current.nextForkAt === undefined || game.current.nextRailAt === undefined
        ? createRun(game.current.seed, game.current.scene)
        : game.current;
    game.current.fork ??= null;
    game.current.nextForkAt ??= journeyDefaults.nextForkAt;
    game.current.lastForkAt ??= null;
    game.current.lastForkBlockedDirection ??= 0;
    game.current.turnDirection ??= 0;
    game.current.turnRemaining ??= 0;
    game.current.turnEntryX ??= 0;
    game.current.rail ??= null;
    game.current.railReturnRemaining ??= 0;
    game.current.nextRailAt ??= journeyDefaults.nextRailAt;
    game.current.railPreparedAt ??= null;
    game.current.railPreparedFrom ??= null;
    game.current.edgeStumble ??= 0;
    game.current.edgeStumbleDirection ??= 0;
    game.current.milestone ??= Math.floor(game.current.distance / 500) * 500;
    game.current.milestoneRemaining ??= 0;
    game.current.lastTrailLane ??= 0;
    game.current.lastTrailEnd ??= -Infinity;
    game.current.skillRechargeLocked ??= false;
    game.current.skillBlockedCoins ??= 0;
    game.current.review ??= null;
    game.current.reviewedPosts ??= 0;
    if (!progressHydrated.current) {
      try {
        const savedScene = localStorage.getItem("community-seasons-scene");
        if (isSceneKind(savedScene)) sceneRef.current = savedScene;
        if (game.current.mode === "ready") game.current.scene = sceneRef.current;
      } catch {}
      document.documentElement.lang = localeRef.current;
      document.title = `${translate(localeRef.current, "Community Seasons")} — ${translate(localeRef.current, "COMMUNITY IN MOTION")}`;
      try {
        progressRef.current = readProgress(localStorage.getItem(PROGRESS_KEY));
      } catch {
        savingRef.current = false;
      }
      progressHydrated.current = true;
    } else progressRef.current = readProgress(JSON.stringify(progressRef.current));
    game.current.skin = progressRef.current.equippedSkin;
    game.current.outfit = { ...progressRef.current.outfit };
    try {
      const stored = Number(localStorage.getItem("community-seasons-best"));
      if (Number.isSafeInteger(stored) && stored > 0) {
        bestRef.current = stored;
      }
    } catch {}
    if (onToy) {
      const controller = createCloudSaveController({
        getSdk: loadToyCloudStorage,
        storage: {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
        },
        readLocal: readSaveSnapshot,
        writeLocal: applyCloudSnapshot,
        hasLocalData: () => {
          try {
            return [PROGRESS_KEY, "community-seasons-best", "community-seasons-scene"].some(
              (key) => localStorage.getItem(key) !== null,
            );
          } catch {
            return (
              bestRef.current > 0 ||
              sceneRef.current !== "spring" ||
              JSON.stringify(progressRef.current) !== JSON.stringify(createProgress())
            );
          }
        },
        canApply: () =>
          game.current.mode !== "running" &&
          (game.current.mode === "ready" || startAfterCloudRef.current) &&
          !storeOpenRef.current &&
          !setupOpenRef.current &&
          !guideOpenRef.current &&
          !licensesOpenRef.current && !helpOpenRef.current,
        onChange: updateCloudState,
      });
      cloudRef.current = controller;
      void controller.start().then(() => {
        if (cloudRef.current === controller) updateCloudState(controller.getState());
      });
    }
    const renderer = new Renderer(canvasRef.current!);
    rendererRef.current = renderer;
    renderer.resize();
    let needsRedraw = true;
    let drawnRun: RunState | null = null;
    let drawnMode: RunState["mode"] | null = null;
    let drawnLocale = localeRef.current;
    let drawnSkin = game.current.skin;
    let drawnOutfit = game.current.outfit;
    let drawnFlash = 0;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      renderer.reducedMotion = motionPreference.matches;
      needsRedraw = true;
    };
    updateMotionPreference();
    const stopMotionChanges = listenToMediaQuery(motionPreference, updateMotionPreference);
    const ro = new ResizeObserver(() => {
      if (!renderer.resize()) return;
      // Resizing clears the canvas after this frame's animation callback.
      // Paint before the browser composites it, including when a run is paused.
      renderer.render(game.current, performance.now() / 1000, false, localeRef.current);
      needsRedraw = false;
      drawnRun = game.current;
      drawnMode = game.current.mode;
      drawnLocale = localeRef.current;
      drawnSkin = game.current.skin;
      drawnOutfit = game.current.outfit;
      drawnFlash = game.current.flash;
    });
    ro.observe(canvasRef.current!);
    let raf = 0,
      previous = 0,
      lastHud = 0;
    function frame(now: number) {
      if (!previous) {
        setLocale(localeRef.current);
        setScene(sceneRef.current);
        setBest(bestRef.current);
        setProgress(progressRef.current);
        setSavingAvailable(savingRef.current);
      }
      const s = game.current,
        oldMode = s.mode;
      const shieldAbsorbedBefore = s.shieldAbsorbed;
      const shieldTimeBefore = s.boosts.shieldTime;
      const relicsBefore = { ...s.collectedRelics };
      const oldStumbles = s.stumbles;
      const oldRailPhase = s.rail?.phase;
      const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
      // Season tunnels freeze the run clock, but the visible banner still expires.
      // Pauses and lesson dialogs keep the remaining celebration time.
      if (oldMode === "running") recordClockRef.current += dt;
      update(s, dt, progressRef.current.levels);
      if (s.rail?.phase !== oldRailPhase) {
        swipeRef.current = null;
        lastTapRef.current = null;
        lastRailUpRef.current = null;
        if (s.rail?.phase === "feedback" || s.rail?.phase === "complete") sound("boost");
        else if (s.rail?.phase === "falling") sound("crash");
      }
      if (
        oldMode === "running" &&
        updateRecordProgress(recordRef.current, s.score, recordClockRef.current)
      ) {
        sound("boost");
      }
      previous = now;
      bankRewards();
      rememberScene();
      if (shieldAbsorbedBefore < s.shieldAbsorbed)
        notifyBoost(
          `Shield absorbed the crash. ${s.boosts.shield ? `${s.boosts.shield} protection${s.boosts.shield > 1 ? "s" : ""} left.` : "Keep running!"}`,
        );
      else if (shieldTimeBefore > 0 && s.boosts.shieldTime === 0)
        notifyBoost("Shield expired. Stay alert!");
      const found = PICKUP_BOOSTERS.find((b) => s.collectedRelics[b.id] > relicsBefore[b.id]);
      if (found) {
        notifyBoost(
          `${found.shortName} booster activated! Level ${progressRef.current.levels[found.id]} power.`,
        );
        sound("boost");
      }
      if (s.stumbles > oldStumbles && s.mode === "running") {
        sound("chase");
      }
      if (s.coins > latestCoins.current) {
        latestCoins.current = s.coins;
        sound("coin");
      }
      if (oldMode === "running" && s.mode === "over") {
        if (oldRailPhase !== "falling") sound("crash");
        recordBest();
        void cloudRef.current?.flush();
      }
      syncMusic();
      musicRef.current?.tick();
      const animated =
        s.mode === "running" ||
        (s.mode === "ready" &&
          !rotateRequiredRef.current &&
          !storeOpenRef.current &&
          !setupOpenRef.current &&
          !guideOpenRef.current &&
          !licensesOpenRef.current && !helpOpenRef.current &&
          !cloudStateRef.current.conflict);
      // A paused run is a still image. Keep event/audio bookkeeping alive, but
      // avoid rebuilding thousands of polygons behind pause and lesson dialogs.
      if (
        animated ||
        needsRedraw ||
        drawnRun !== s ||
        drawnMode !== s.mode ||
        drawnLocale !== localeRef.current ||
        drawnSkin !== s.skin ||
        drawnOutfit !== s.outfit ||
        s.flash > 0 ||
        drawnFlash > 0
      ) {
        drawnFlash = s.flash;
        renderer.render(s, now / 1000, false, localeRef.current);
        needsRedraw = false;
        drawnRun = s;
        drawnMode = s.mode;
        drawnLocale = localeRef.current;
        drawnSkin = s.skin;
        drawnOutfit = s.outfit;
      }
      if ((s.mode === "running" && now - lastHud > 75) || s.mode !== oldMode) {
        sync();
        lastHud = now;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function onGameSpace(e: KeyboardEvent) {
      if (shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
      if (
        rotateRequiredRef.current &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !["Tab", "Shift"].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (
        e.key !== " " ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        game.current.mode !== "running" ||
        game.current.review ||
        guideOpenRef.current ||
        storeOpenRef.current ||
        setupOpenRef.current
      )
        return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".licenses-launcher, .help-launcher")) return;
      // Answer cards and Go retain native keyboard activation during a quiz.
      if (game.current.rail && target?.closest(".rail-answers button")) return;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[data-slot="dialog-content"]',
        )
      )
        return;
      // Capture before other button key handlers. Space jumps in a live run;
      // moving focus to the path also prevents a button click on key release.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      canvasRef.current?.focus({ preventScroll: true });
      control("jump");
    }
    function onKey(e: KeyboardEvent) {
      // A double press must be consecutive accepted keydowns. Repeats,
      // modifiers, other keys and events in dialogs discard the first press.
      const lastRailUp = lastRailUpRef.current;
      lastRailUpRef.current = null;
      if (rotateRequiredRef.current || shareOpenRef.current || licensesOpenRef.current || helpOpenRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key;
      // Physical WASD keys also work while a non-Latin input method is active.
      const movement = keyMap[key] ?? keyMap[e.code];
      if (game.current.review || guideOpenRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      // Large-text results are scrollable; keep native scrolling available
      // while the panel or one of its controls has keyboard focus.
      if (
        target?.closest(".result-panel") &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(key)
      ) return;
      if (setupOpenRef.current) {
        if ((key === "b" || key === "B") && !e.repeat) {
          e.preventDefault();
          visitStoreFromSetup();
        }
        return;
      }
      if (storeOpenRef.current || target?.closest('[data-slot="dialog-content"]')) {
        if (key === "b" || key === "B") {
          e.preventDefault();
          if (!e.repeat) changeStore(false);
        }
        return;
      }
      if ((key === "Enter" || key === " ") && target?.closest("button,a")) return;
      if (
        movement ||
        [
          "Enter",
          "Escape",
          "p",
          "P",
          "r",
          "R",
          "m",
          "M",
          "b",
          "B",
          "1",
          "2",
          "3",
          "4",
          "e",
          "E",
        ].includes(key)
      )
        e.preventDefault();
      if (e.repeat) return;
      const mode = game.current.mode;
      if (key === "b" || key === "B") {
        changeStore(true);
        return;
      }
      const booster = BOOSTERS.find((boost) => boost.key === key);
      if (booster) {
        triggerBooster(booster.id);
        return;
      }
      if (key === "e" || key === "E") {
        if (game.current.permanentSkill) triggerSkill(game.current.permanentSkill);
        else notifyBoost("Choose one permanent skill before your next run.");
        return;
      }
      if (key === "m" || key === "M") {
        toggleSound();
        return;
      }
      if (key === "Escape" || key === "p" || key === "P") {
        pause();
        return;
      }
      if (mode === "ready" || mode === "over") {
        if (key === "Enter" || key === " " || key === "r" || key === "R") start();
        return;
      }
      if (mode === "paused") {
        if (key === "Enter" || key === " ") pause();
        return;
      }
      const ride = game.current.rail;
      const upKey = key === "ArrowUp" ? "ArrowUp" : movement === "jump" && e.code === "KeyW" ? "KeyW" : null;
      if (mode === "running" && ride?.phase === "question" && upKey) {
        const last = lastRailUp;
        const interval = last ? e.timeStamp - last.at : Infinity;
        if (last && last.ride === ride && last.questionIndex === ride.index && last.key === upKey && interval >= 0 && interval <= 300) {
          submitRailChoice();
        } else lastRailUpRef.current = { at: e.timeStamp, key: upKey, ride, questionIndex: ride.index };
        return;
      }
      if (movement) control(movement);
    }
    function blur() {
      swipeRef.current = null;
      lastTapRef.current = null;
      lastRailUpRef.current = null;
      bankRewards();
      recordBest();
      if (game.current.mode === "running") {
        game.current.mode = "paused";
        sync();
      }
      void cloudRef.current?.flush();
    }
    function visibility() {
      if (document.hidden) blur();
    }
    window.addEventListener("keydown", onGameSpace, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    const unregisterTools = registerGameTools(() => game.current, start, control, pause, {
      read: () => progressRef.current,
      isOpen: () => storeOpenRef.current,
      open: (open) => (open && setupOpenRef.current ? visitStoreFromSetup() : changeStore(open)),
      buy,
      use: triggerBooster,
      unlock: buySkill,
      triggerSkill,
      equip: equipSkill,
      upgrade,
      setupOpen: () => setupOpenRef.current,
      begin: beginRun,
      home: goHome,
    });
    return () => {
      cloudRef.current?.dispose();
      cloudRef.current = null;
      swipeRef.current = null;
      lastTapRef.current = null;
      lastRailUpRef.current = null;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      unregisterTools();
      musicRef.current?.dispose();
      musicRef.current = null;
      if (audioRef.current) void audioRef.current.close().catch(() => {});
      audioRef.current = null;
      cancelAnimationFrame(raf);
      if (rendererRef.current === renderer) rendererRef.current = null;
      ro.disconnect();
      stopMotionChanges();
      window.removeEventListener("keydown", onGameSpace, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const active = hud.mode === "running";
  const speedBoosted = hud.boosts.rush > 0 || hud.boosts.headstart > 0 || hud.boosts.portal > 0;
  const forkBlockedDirection = game.current.fork?.blockedDirection;
  const forkAhead = active && !hud.rail && game.current.fork !== null && game.current.fork.at - hud.distance < 135;
  const forkCue = forkBlockedDirection === -1
    ? speedBoosted ? l("Auto-turn right →", "自动右转 →") : l("Turn right →", "向右转 →")
    : forkBlockedDirection === 1
      ? speedBoosted ? l("← Auto-turn left", "← 自动左转") : l("← Turn left", "← 向左转")
      : l("← Left or right →", "← 向左或向右 →");
  const cloudBusy = cloudActionPending || ["checking", "saving"].includes(cloudState.status);
  const cloudLabel =
    cloudState.status === "synced"
      ? l("Saved to Bilibili cloud", "已保存至哔哩哔哩云端")
      : cloudState.status === "checking"
        ? l("Checking Bilibili login status…", "正在检查哔哩哔哩登录状态…")
        : cloudState.status === "saving" || cloudState.status === "queued"
          ? l("Saving to Bilibili cloud…", "正在保存至哔哩哔哩云端…")
          : cloudState.status === "conflict"
            ? l("Choose a save to continue", "请选择要使用的存档")
            : cloudState.status === "pending"
              ? l("Cloud save waiting · Check", "云存档待检查 · 点击查看")
              : cloudState.status === "local"
                ? l("This device only · Enable cloud", "仅保存在本机 · 启用云存档")
                : cloudState.status === "unsupported"
                  ? l("Cloud saving not supported", "当前环境不支持云存档")
                  : l("Cloud unavailable · Retry", "云存档暂不可用 · 重试");
  const cloudError =
    cloudState.error === "invalid-save" || cloudState.error === "too-large"
      ? l(
          "The cloud save could not be read safely. Your device save is kept; try again later.",
          "无法安全读取云存档，本机存档已保留，请稍后重试。",
        )
      : cloudState.error
        ? savingAvailable
          ? l(
              "Cloud sync failed. Your device save is kept. Check your connection and Bilibili login status, then retry.",
              "云同步失败，本机存档已保留。请检查网络与哔哩哔哩登录状态后重试。",
            )
          : l(
              "Cloud sync and browser saving are unavailable. Keep this page open and retry to save your progress.",
              "云同步和浏览器保存均不可用，请保持页面打开并重试，以保存进度。",
            )
        : undefined;
  return (
    <main
      className={`game-shell scene-${hud.mode === "ready" ? scene : game.current.scene} ${viewport.height <= 780 ? "compact-viewport" : ""}`}
      lang={locale}
    >
      <header className="topbar">
        <div className="brand">
          <Flower2 size={25} />
          <span>{t("COMMUNITY SEASONS")}</span>
        </div>
        <span className="edition">
          {t("COMMUNITY IN MOTION")} <span> / </span> {t("ENDLESS RUNNER")}
        </span>
        <Button
          variant="outline"
          className="home-button"
          onClick={goHome}
          disabled={hud.mode === "ready"}
          aria-label={t("Back to home. Ends this run and keeps collected coins.")}
          title={t("Back to home")}
        >
          <HomeIcon size={17} />
          <span>{t("Home")}</span>
        </Button>
        <Button
          variant="outline"
          className="language-switch"
          onClick={changeLocale}
          aria-label={t(locale === "en" ? "Switch to Simplified Chinese" : "Switch to English")}
        >
          <Languages size={17} />
          <span>{locale === "en" ? "简体中文" : "English"}</span>
        </Button>
        <Button
          variant="outline"
          className="store-launcher"
          onClick={() => changeStore(true)}
          disabled={hud.mode === "ready" && cloudBlocksEntry()}
          aria-label={t(`Open store. ${progress.wallet} coins in your bank. Press B.`)}
        >
          <ShoppingBag size={17} />
          <span>{t("STORE")}</span>
          <kbd>{t("B")}</kbd>
          <span className="bank-total">
            <Coins size={15} />
            {t(progress.wallet.toLocaleString())}
          </span>
        </Button>
        <Button ref={helpButtonRef} variant="outline" className="help-launcher"
          onClick={() => changeHelp(true)} aria-label={l("Help & information", "帮助与信息")}
          title={l("Help & information", "帮助与信息")} aria-haspopup="dialog"
          aria-expanded={helpOpen} aria-controls="help-panel">
          <CircleHelp size={20} aria-hidden="true" />
        </Button>
      </header>
      <section
        className={`arena ${hud.mode} ${hud.rail ? "rail-active" : ""} ${active && hud.time < 5 ? "opening-boosters" : ""} ${active && hud.celebratingRecord ? "record-celebrating" : ""}`}
        aria-label={t("Community Seasons keyboard and swipe game")}
        onPointerDown={beginSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={cancelSwipe}
        onLostPointerCapture={cancelSwipe}
      >
        <canvas
          ref={canvasRef}
          className="world"
          tabIndex={0}
          aria-label={t(
            "A seasonal community path with three lanes. Swipe or use arrow keys: left and right to dodge, up to jump, down to slide.",
          )}
        />
        <div className="scene-shade" />
        {hud.travelDestination && (
          <SeasonTravel
            skin={progress.equippedSkin}
            outfit={progress.outfit}
            source={game.current.sceneTransitionFrom ?? game.current.scene}
            destination={hud.travelDestination}
            progress={1 - game.current.sceneTransition / SCENE_TRANSITION_DURATION}
            locale={locale}
            paused={!active}
          />
        )}
        <div className="hud">
          {hud.mode !== "ready" && (
            <div className="score-block">
              <span className="eyebrow">{t("SCORE")}</span>
              <strong>{t(String(hud.score).padStart(6, "0"))}</strong>
              <span className="distance">
                {t(Math.floor(hud.distance).toLocaleString())} <small>{t("m")}</small>
              </span>
            </div>
          )}
          <div className="hud-right">
            {hud.mode !== "ready" && (
              <div className="coins">
                <Coins size={17} />
                <b>{hud.coins}</b>
                {hud.boosts.doubleCoins > 0 && (
                  <small className="coin-multiplier" title={t("Shared Rewards")}>
                    ×2
                  </small>
                )}
              </div>
            )}
            <div className="best">
              <Trophy size={15} />
              <span>{t("BEST")}</span>
              <b>{t(best.toLocaleString())}</b>
            </div>
            <div className="hud-buttons">
              <Button
                className="icon-button"
                variant="ghost"
                aria-label={t(muted ? "Turn sound on" : "Mute sound")}
                onClick={toggleSound}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
              {hud.mode !== "ready" && (
                <Button
                  className="icon-button"
                  variant="ghost"
                  disabled={hud.mode === "over" || cloudActionPending}
                  aria-label={t(hud.mode === "paused" ? "Resume game" : "Pause game")}
                  onClick={pause}
                >
                  {hud.mode === "paused" ? <Play /> : <Pause />}
                </Button>
              )}
            </div>
          </div>
        </div>
        {active && hud.celebratingRecord && (
          <output className="record-celebration" aria-live="polite" aria-atomic="true">
            <PartyPopper size={22} />
            <span>
              <strong>{l("New personal best!", "打破个人纪录！")}</strong>
              <small>
                {l("You passed", "已超越")} {t(hud.recordTarget.toLocaleString())}
              </small>
            </span>
            <i aria-hidden="true">✦ ✧ ✦</i>
          </output>
        )}
        {hud.mode === "ready" && (
          <div className="start-screen">
            <div className="expedition-label">
              <span />
              {t("A LITTLE CARE, EVERY SEASON")}
            </div>
            <h1>
              {t("COMMUNITY")}
              <br />
              <em>{t("SEASONS")}</em>
            </h1>
            <p>
              {t("Every season, a better conversation.")}
              <br />
              {t("Spot harmful posts. Make room for respect.")}
            </p>
            <Button className="run-button" onClick={start} disabled={cloudBusy}>
              {t("Start the journey")} <ArrowUpRight size={21} />
            </Button>
            <div className="start-hint">
              {t("or press")} <kbd>{t("ENTER")}</kbd> {t("to begin")}
            </div>
            <div className="touch-start-hint">{t("Swipe on the path to play.")}</div>
            <div className="home-help-actions">
              <Button
                variant="ghost"
                className="start-store"
                onClick={() => changeStore(true)}
                disabled={cloudBlocksEntry()}
              >
                <ShoppingBag size={15} /> {t("Browse boosters")}
              </Button>
              <Button
                variant="ghost"
                className="how-to-play"
                onClick={() => { helpDetailRef.current = null; changeGuide(true); }}
                disabled={cloudActionPending}
              >
                <CircleHelp size={15} /> {l("How to play", "操作指南")}
              </Button>
              {onToy && (
                <CloudSaveStatus
                  locale={locale}
                  status={cloudState.status}
                  label={cloudLabel}
                  error={cloudError}
                  busy={cloudBusy}
                  compact={viewport.width <= 750}
                  suggestBilibili={shouldSuggestBilibili(navigator.userAgent, cloudState)}
                  onRetry={retryCloudSave}
                />
              )}
            </div>
            <div className="start-rule">
              <Coins size={16} />
              <span>{t("Coins to collect. Boundaries to discover.")}</span>
            </div>
            <a className="case-archive-link" href={CASES_URL} target="_blank" rel="noreferrer">
              <MessageSquareHeart size={15} />
              {t("Explore real moderation cases")}
              <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        {!hud.review && ((hud.mode === "paused" && !hud.rail) || hud.mode === "over") && (
          <div className="overlay">
            <div className="result-panel" role="region" aria-labelledby="result-heading" tabIndex={0}>
              <span className="eyebrow">
                {t(hud.mode === "paused" ? "TAKE A BREATHER" : "JOURNEY COMPLETE")}
              </span>
              <h2 id="result-heading">
                {t(
                  hud.mode === "paused"
                    ? "A moment of stillness."
                    : hud.reason.startsWith("The disruptors")
                      ? "The disruptors caught up."
                      : "A chance to learn.",
                )}
              </h2>
              {hud.mode === "over" ? (
                <>
                  {hud.rail?.failure ? (
                    <RailFailure ride={hud.rail} locale={locale} onShareLesson={shareQuizLesson} />
                  ) : (
                    <p>{t(hud.reason)}</p>
                  )}
                  <p className="reviewed-count">
                    {hud.rail ? (
                      `${hud.rail.correctCount} / ${hud.rail.questions.length} ${l("questions answered correctly", "道题回答正确")}`
                    ) : (
                      <>
                        {hud.reviewedPosts}{" "}
                        {l(
                          "posts reviewed · Keep practicing with context.",
                          "条动态已学习 · 结合上下文，继续练习。",
                        )}
                      </>
                    )}
                  </p>
                  <div className="result-stats">
                    <div>
                      <strong>{t(hud.score.toLocaleString())}</strong>
                      <span>{t("FINAL SCORE")}</span>
                    </div>
                    <div>
                      <strong>{t(Math.floor(hud.distance).toLocaleString())}</strong>
                      <span>{t("DISTANCE")} ({t("m")})</span>
                    </div>
                    <div>
                      <strong>{t(hud.coins.toLocaleString())}</strong>
                      <span>{t("COINS")}</span>
                    </div>
                  </div>
                  {hud.score >= best && hud.score > 0 && (
                    <div className="new-best">
                      <Trophy size={15} /> {t("A new personal best")}
                    </div>
                  )}
                  <Button className="run-button" onClick={start} disabled={cloudBusy}>
                    {t("Run again")} <RotateCcw />
                  </Button>
                  <Button
                    ref={shareButtonRef}
                    className="run-button share-result-launcher"
                    onClick={openShareResult}
                  >
                    {l("Share result", "分享成绩")} <Share2 aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <>
                  <p>{t("Your community journey will be here when you’re ready.")}</p>
                  <Button className="run-button" onClick={pause} disabled={cloudActionPending}>
                    {t("Keep running")} <Play />
                  </Button>
                  <Button
                    variant="ghost"
                    className="restart-button"
                    onClick={start}
                    disabled={cloudBusy}
                  >
                    {t("Start a new run")}
                  </Button>
                </>
              )}
              <Button variant="ghost" className="result-home" onClick={goHome}>
                <HomeIcon size={16} />
                {t("Back to home")}
              </Button>
              <span className="panel-hint">
                {cloudActionPending
                  ? l("Checking Bilibili login status…", "正在检查哔哩哔哩登录状态…")
                  : t(
                      hud.mode === "paused"
                        ? "Press P or Enter to resume"
                        : "Press Enter to run again",
                    )}
              </span>
              <Button
                variant="outline"
                className="result-store"
                onClick={() => changeStore(true)}
                disabled={cloudActionPending}
              >
                <ShoppingBag size={15} /> {t("Visit the store")}{" "}
                <span>
                  <Coins size={14} />
                  {t(progress.wallet.toLocaleString())}
                </span>
              </Button>
              <p className="bank-note">
                {t(
                  hud.mode === "over"
                    ? `${hud.coins} coins from this run are in your bank.`
                    : "Shopping keeps your run paused.",
                )}
              </p>
            </div>
          </div>
        )}
        {active && (
          <div className={`run-bottom-hud ${!hud.rail && hud.railReturnRemaining === 0 ? "with-boost-tray" : ""}`}>
            <div className="run-status">
              <span className="pulse-dot" />
              <span>
                {t(
                  hud.distance < 40
                    ? "FOLLOW THE GOLD · FIND YOUR RHYTHM"
                    : sceneDefinition(game.current.scene).name,
                )}
              </span>
            </div>
            {!hud.rail && hud.railReturnRemaining === 0 && (
              <BoostTray
                locale={locale}
                scene={scene}
                progress={progress}
                boosts={hud.boosts}
                runTime={hud.time}
                disabled={hud.travelDestination !== null || game.current.turnRemaining > 0}
                onUse={triggerBooster}
              />
            )}
            {feedback && !hud.rail && hud.railReturnRemaining === 0 && (
              <output className="boost-feedback" aria-live="polite">
                {t(feedback)}
              </output>
            )}
          </div>
        )}
        {active && !hud.rail && hud.railReturnRemaining === 0 && (
          <PermanentSkillHud
            locale={locale}
            kind={hud.permanentSkill}
            charge={hud.skillCharge}
            progress={progress}
            boosts={hud.boosts}
            onTrigger={triggerSkill}
          />
        )}
        {(active || hud.mode === "paused") && hud.rail && !storeOpen && !setupOpen && (
          <RailQuiz
            ride={hud.rail}
            lane={hud.lane}
            locale={locale}
            onChoose={chooseRailAnswer}
            onSubmit={submitRailChoice}
            paused={!active}
            onResume={pause}
            onShareLesson={shareQuizLesson}
          />
        )}
        {(active || hud.mode === "paused") &&
          !storeOpen &&
          !setupOpen &&
          !guideOpen &&
          !helpOpen &&
          !hud.review && (
            <RailTravel
              skin={progress.equippedSkin}
              outfit={progress.outfit}
              frame={railTravelFrame(game.current)}
              locale={locale}
              scene={scene}
              renderer={rendererRef.current}
              paused={!active}
              onResume={pause}
            />
          )}
        {forkAhead && (
          <output id="fork-announcement" className="fork-announcement sr-only" aria-live="polite" aria-atomic="true">
            {forkBlockedDirection === -1
              ? speedBoosted
                ? l("Left dead end. Boost automatically turns right.", "左路不通。加速将自动向右转。")
                : l("Left dead end. Take the right lane.", "左路不通。请选择右侧跑道。")
              : forkBlockedDirection === 1
                ? speedBoosted
                  ? l("Right dead end. Boost automatically turns left.", "右路不通。加速将自动向左转。")
                  : l("Right dead end. Take the left lane.", "右路不通。请选择左侧跑道。")
                : speedBoosted
                  ? l("Boost defaults left. You can still choose right.", "加速默认向左。仍可选择右侧。")
                  : l("Center closed. Take the left or right lane.", "中路封闭。请选择左侧或右侧跑道。")}
          </output>
        )}
        <div className="status-stack" hidden={!!hud.rail || hud.railReturnRemaining > 0}>
          {active &&
            game.current.railPreparedAt === game.current.nextRailAt &&
            game.current.nextRailAt - hud.distance < 110 && (
              <output className="portal-alert" aria-live="polite">
                <b>{l("STATION AHEAD", "前方到站")}</b>
                <strong>{l("Community Express", "社区小列车")}</strong>
                <small>
                  {l(
                    "Board for 3–4 questions. Choose the correct answer lane.",
                    "上车回答 3–4 道题，选择正确答案所在轨道。",
                  )}
                </small>
              </output>
            )}
          {active && hud.milestoneRemaining > 0 && (
            <output className="milestone-toast" aria-live="polite" aria-atomic="true">
              <Trophy size={18} aria-hidden="true" />
              <span>
                <b>{t(`${hud.milestone.toLocaleString()}m reached!`)}</b>
                <small>{t("DISTANCE MILESTONE")}</small>
              </span>
            </output>
          )}
          {active &&
            game.current.sceneTransition === 0 &&
            game.current.nextPortalAt - hud.distance < 140 && (
              <output className="portal-alert" aria-live="polite" aria-atomic="true">
                <b>{l("OPTIONAL TRAVEL GATE", "可选季节传送门")}</b>
                <span className="portal-destination">
                  <ArrowRight size={16} aria-hidden="true" />
                  <strong>{t(sceneDefinition(nextScene(scene)).name)}</strong>
                </span>
                <small>
                  {game.current.portalLane === -1
                    ? l("Run through the left-lane gate to travel.", "穿过左侧跑道的门，即可前往。")
                    : game.current.portalLane === 0
                      ? l(
                          "Run through the center-lane gate to travel.",
                          "穿过中间跑道的门，即可前往。",
                        )
                      : l(
                          "Run through the right-lane gate to travel.",
                          "穿过右侧跑道的门，即可前往。",
                        )}
                </small>
                <small className="portal-stay">
                  {l("Other lanes: stay here.", "其他跑道：留在当前场景。")}
                </small>
              </output>
            )}
          {active && (hud.chase > 0 || hud.time < MONSTER_INTRO_DURATION) && (
            <output
              className={`chase-alert ${hud.chase > 0 ? "danger" : ""}`}
              aria-live="polite"
              aria-label={t(
                hud.chase > 0
                  ? "Avoid spam strips and road edges until the disruptors fall behind."
                  : "The disruptors are chasing you. Keep running.",
              )}
            >
              <MessageSquareHeart size={18} />
              <span>
                <b>
                  {t(
                    hud.chase > 0
                      ? hud.lastStumble === "edge"
                        ? "EDGE HIT"
                        : "DISRUPTORS CLOSE"
                      : "CHASE ON",
                  )}
                </b>
                <small>
                  {hud.edgeStumble > 0
                    ? l("Recovering · briefly protected", "正在恢复 · 短暂保护")
                    : t(hud.chase > 0 ? `Stay clear · ${Math.ceil(hud.chase)}s` : "Keep running")}
                </small>
              </span>
            </output>
          )}
          {active && hud.boosts.shield > 0 && (
            <output className="shield-status" aria-label={t("Shield remaining")}>
              <Shield size={14} />{" "}
              {t(
                `${hud.boosts.shield} hit${hud.boosts.shield > 1 ? "s" : ""} · ${Math.ceil(hud.boosts.shieldTime)}s`,
              )}
            </output>
          )}
        </div>
        {feedback && !hud.rail && !(active && hud.railReturnRemaining === 0) && (
          <output className="boost-feedback" aria-live="polite">
            {t(feedback)}
          </output>
        )}
        <div className="scene-caption">
          <span>
            {t(
              hud.mode === "ready" ? "AUTOPLAY PREVIEW" : sceneDefinition(game.current.scene).name,
            )}
          </span>
          <span>{t("MAKE ROOM FOR RESPECT.")}</span>
        </div>
      </section>
      {cloudState.conflict && (
        <CloudSaveDialog
          open={
            (hud.mode === "ready" || startAfterCloudRef.current) &&
            !storeOpen &&
            !setupOpen &&
            !guideOpen &&
            !licensesOpen &&
            !helpOpen
          }
          locale={locale}
          localSnapshot={cloudState.conflict.local}
          cloudSnapshot={cloudState.conflict.cloud}
          busy={cloudBusy}
          error={cloudError}
          onUseLocal={() => void chooseCloudSave("use-local")}
          onUseCloud={() => void chooseCloudSave("use-cloud")}
          onStayLocal={() => void chooseCloudSave("local-only")}
        />
      )}
      <HelpDialog open={helpOpen} onOpenChange={changeHelp} locale={locale}
        onGuide={() => openHelpDetail("guide")} onLicenses={() => openHelpDetail("licenses")}
        returnFocus={() => guideOpenRef.current || licensesOpenRef.current ? false : helpReturnFocus()} />
      <ControlsGuide open={guideOpen} onOpenChange={changeGuide} locale={locale}
        returnFocus={helpDetailRef.current === "guide" ? helpReturnFocus : undefined} />
      <LicensesDialog open={licensesOpen} onOpenChange={changeLicenses} locale={locale}
        returnFocus={helpReturnFocus} />
      <PostReviewDialog
        review={hud.review}
        ended={hud.mode === "over"}
        locale={locale}
        onContinue={continueAfterReview}
        onShareLesson={sharePostLesson}
      />
      {shareSnapshot && (
        <ShareDialog snapshot={shareSnapshot} onClose={closeShareResult} returnFocus={shareButtonRef} />
      )}
      {lessonShareSnapshot && (
        <ShareDialog lesson={lessonShareSnapshot} onClose={closeShareResult} returnFocus={lessonShareButtonRef} />
      )}
      <BoostStore
        locale={locale}
        scene={scene}
        open={storeOpen}
        onOpenChange={changeStore}
        progress={progress}
        onBuy={buy}
        onUnlock={buySkill}
        onEquip={equipSkill}
        onUpgrade={upgrade}
        onBuySkin={purchaseSkin}
        onEquipSkin={changeSkin}
        onBuyAccessory={purchaseAccessory}
        onEquipAccessory={changeAccessory}
        runInProgress={hud.mode === "running" || hud.mode === "paused"}
        message={storeMessage}
        savingAvailable={savingAvailable}
        saveStatusText={
          onToy ? `${cloudLabel} · ${l("Game coins only", "仅使用游戏金币")}` : undefined
        }
      />
      {!setupDismissedForRun && (
        <RunSetup
          locale={locale}
          open={setupOpen}
          onOpenChange={changeSetup}
          progress={progress}
          selected={selectedSkill}
          onSelectedChange={setSelectedSkill}
          onStart={beginRun}
          returnFocus={() => (game.current.mode === "running" ? canvasRef.current : true)}
          onStore={visitStoreFromSetup}
          scene={scene}
        />
      )}
      <RotateDevice
        open={rotateRequired}
        locale={locale}
        height={portraitPromptHeight(viewport)}
        paused={hud.mode === "paused"}
      />
      <footer className="control-bar keyboard-controls">
        <span className={forkAhead ? "controls-label fork-direction-cue" : "controls-label"} aria-hidden={forkAhead || undefined}>
          {forkAhead ? forkCue : <><Footprints size={17} /> {t("MAKE YOUR MOVE")}</>}
        </span>
        <div className="control">
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
          </div>
          <span>
            {t("Change lanes")}
            <small className="alternate-keys">A / D</small>
          </span>
        </div>
        <div className="control">
          <div>
            <kbd>↑</kbd>
            <span className="key-or">/</span>
            <kbd className="wide">{t("SPACE")}</kbd>
          </div>
          <span>
            {t("Jump")}
            <small className="alternate-keys">W</small>
          </span>
        </div>
        <div className="control">
          <kbd>↓</kbd>
          <span>
            {t("Slide")}
            <small className="alternate-keys">S</small>
          </span>
        </div>
        <div className="control">
          <kbd>{t("P")}</kbd>
          <span>{t("Pause")}</span>
        </div>
        <span className="wasd">{t("1–4 boosters · E skill · B store")}</span>
      </footer>
      <footer className="swipe-guide" aria-label={t("Swipe controls")}>
        <b className={forkAhead ? "fork-direction-cue" : undefined} aria-hidden={forkAhead || undefined}>
          {forkAhead ? forkCue : t("SWIPE TO MOVE")}
        </b>
        <div>
          <span>
            <ArrowLeft />
            <ArrowRight /> {t("Change lanes")}
          </span>
          <span>
            <ArrowUp /> {t("Jump")}
          </span>
          <span>
            <ArrowDown /> {t("Slide")}
          </span>
        </div>
        <small>{t("Double-tap the path to use your charged skill")}</small>
      </footer>
      <footer className="credits-footer">
        <button ref={licensesButtonRef} type="button" className="licenses-launcher"
          onClick={() => { helpDetailRef.current = null; changeLicenses(true); }} aria-haspopup="dialog" aria-expanded={licensesOpen}
          aria-controls="licenses-panel">
          <ScrollText size={16} aria-hidden="true" />{l("Open-source licenses", "开源许可")}
        </button>
      </footer>
    </main>
  );
}
