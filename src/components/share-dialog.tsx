"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Download, ImageDown, LoaderCircle, RotateCcw, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSharePoster, type SharePosterSnapshot } from "@/lib/game/share-poster";
import { createLessonSharePoster, type LessonShareSnapshot } from "@/lib/game/lesson-share-poster";
import { loadToySdk, type ToySdk } from "@/lib/game/toy-sdk";
import {
  getToyShareCapabilities,
  getToyShareQr,
  saveToyImage,
  shareToyLink,
} from "@/lib/game/toy-share";

type Capabilities = { qr: boolean; share: boolean; saveImage: boolean };
type Poster = { blob: Blob; url: string; hasQr: boolean };

type ShareDialogProps = {
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
} & (
  | { snapshot: SharePosterSnapshot; lesson?: never }
  | { lesson: LessonShareSnapshot; snapshot?: never }
);

export function ShareDialog({
  snapshot,
  lesson,
  onClose,
  returnFocus,
}: ShareDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sdkRef = useRef<ToySdk | null>(null);
  const generationRef = useRef(0);
  const readerRef = useRef<FileReader | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const actionRef = useRef<"saving" | "sharing" | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    qr: false,
    share: false,
    saveImage: false,
  });
  const [poster, setPoster] = useState<Poster | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [withoutQr, setWithoutQr] = useState(false);
  const [error, setError] = useState<"connection" | "qr" | "poster" | null>(null);
  const [action, setAction] = useState<"saving" | "sharing" | null>(null);
  const [actionError, setActionError] = useState<"saving" | "sharing" | null>(null);
  const [message, setMessage] = useState("");
  const locale = lesson ? lesson.locale : snapshot.locale;
  const l = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const filename = lesson
    ? `community-seasons-lesson-${locale}.png`
    : `community-seasons-${Math.floor(snapshot.score)}.png`;
  const posterAlt = lesson
    ? l(
        `Community lesson: ${lesson.title.en}. Helpful response: ${lesson.guidance.en}. Example: ${lesson.example.en}. Why it matters: ${lesson.explanation.en}.`,
        `社区学习卡：${lesson.title.zh}。可以这样做：${lesson.guidance.zh}。示例：${lesson.example.zh}。原因：${lesson.explanation.zh}。`,
      )
    : l(
        `Result poster: ${snapshot.score.toLocaleString()} points, ${Math.floor(snapshot.distance)} metres, ${snapshot.coins} coins.`,
        `成绩海报：${snapshot.score.toLocaleString()} 分，${Math.floor(snapshot.distance)} 米，${snapshot.coins} 枚金币。`,
      );

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    let objectUrl: string | null = null;
    const current = () => !cancelled && generationRef.current === generation;
    setPoster(null);
    setError(null);
    setActionError(null);
    setAction(null);
    setMessage("");
    async function generate() {
      let stage: "connection" | "qr" | "poster" = "connection";
      try {
        let qr: string | undefined;
        if (!withoutQr) {
          const sdk = await loadToySdk();
          if (!current()) return;
          const available = await getToyShareCapabilities(sdk);
          if (!current()) return;
          sdkRef.current = sdk;
          setCapabilities(available);
          if (available.qr && sdk) {
            stage = "qr";
            qr = await getToyShareQr(sdk);
            if (!current()) return;
          }
        }
        stage = "poster";
        const blob = lesson
          ? await createLessonSharePoster(lesson, qr)
          : await createSharePoster(snapshot, qr);
        if (!current()) return;
        objectUrl = URL.createObjectURL(blob);
        setPoster({ blob, url: objectUrl, hasQr: Boolean(qr) });
      } catch {
        if (current()) setError(stage);
      }
    }
    void generate();
    return () => {
      cancelled = true;
      generationRef.current++;
      controller.abort();
      actionRef.current = null;
      readerRef.current?.abort();
      readerRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshot, lesson, attempt, withoutQr]);

  function retry() {
    setWithoutQr(false);
    setAttempt((value) => value + 1);
  }
  async function saveImage() {
    const sdk = sdkRef.current;
    if (!poster || !sdk || !capabilities.saveImage || actionRef.current) return;
    const generation = generationRef.current;
    actionRef.current = "saving";
    setAction("saving");
    setActionError(null);
    setMessage("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        readerRef.current = reader;
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("invalid-image"));
        reader.onerror = () => reject(new Error("image-read-failed"));
        reader.onabort = () => reject(new Error("cancelled"));
        reader.readAsDataURL(poster.blob);
      });
      readerRef.current = null;
      if (generationRef.current !== generation) return;
      await saveToyImage(
        sdk,
        data,
        lesson ? l("Community Seasons lesson", "四季共建学习卡") : l("Community Seasons result", "四季共建成绩"),
        abortRef.current?.signal,
      );
      if (generationRef.current === generation) setMessage(l("Image saved.", "图片已保存。"));
    } catch {
      if (generationRef.current === generation) setActionError("saving");
    } finally {
      if (generationRef.current === generation) {
        actionRef.current = null;
        setAction(null);
      }
    }
  }
  async function shareGame() {
    const sdk = sdkRef.current;
    if (!sdk || !capabilities.share || actionRef.current) return;
    const generation = generationRef.current;
    actionRef.current = "sharing";
    setAction("sharing");
    setActionError(null);
    setMessage("");
    try {
      await shareToyLink(sdk, abortRef.current?.signal);
      if (generationRef.current === generation)
        setMessage(l("Game sharing opened.", "已打开游戏分享。"));
    } catch {
      if (generationRef.current === generation) setActionError("sharing");
    } finally {
      if (generationRef.current === generation) {
        actionRef.current = null;
        setAction(null);
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="share-result-dialog"
        showCloseButton={false}
        initialFocus={titleRef}
        finalFocus={returnFocus}
        lang={locale}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          variant="ghost"
          className="share-result-close"
          aria-label={l("Close sharing", "关闭分享")}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </Button>
        <DialogHeader>
          <span className="share-result-eyebrow">
            <Share2 size={16} aria-hidden="true" /> {lesson ? l("A LESSON TO SHARE", "分享友善的力量") : l("YOUR JOURNEY", "你的四季之旅")}
          </span>
          <DialogTitle ref={titleRef} tabIndex={-1} className="share-result-title">
            {lesson ? l("Share a helpful response", "分享社区学习卡") : l("Share your result", "分享你的成绩")}
          </DialogTitle>
          <DialogDescription className="share-result-description">
            {lesson
              ? l("Share this fictional example and a constructive way to respond.", "把虚构示例和更友善的回应方式分享给朋友。")
              : l("Save a picture of this run to share with friends.", "保存本次成绩图片，与朋友分享你的旅程。")
            }
          </DialogDescription>
        </DialogHeader>
        {!poster && !error && (
          <div className="share-result-loading" role="status" aria-live="polite">
            <LoaderCircle size={30} className="share-result-spinner" aria-hidden="true" />
            <p>{lesson ? l("Creating your lesson card…", "正在生成学习卡…") : l("Creating your result image…", "正在生成成绩图片…")}</p>
          </div>
        )}
        {error && (
          <div className="share-result-failure" role="alert">
            <p>
              {error === "poster"
                ? lesson
                  ? l("The lesson card could not be created. Please try again.", "学习卡生成失败，请重试。")
                  : l("The result image could not be created. Please try again.", "成绩图片生成失败，请重试。")
                : l(
                    "Toy’s QR code is unavailable right now. Retry, or create an image without it.",
                    "暂时无法获取 Toy 二维码。可以重试，或生成不含二维码的图片。",
                  )}
            </p>
            <Button onClick={retry}>
              <RotateCcw size={16} aria-hidden="true" /> {l("Try again", "重试")}
            </Button>
            {error !== "poster" && (
              <Button variant="ghost" onClick={() => setWithoutQr(true)}>
                {l("Create without QR code", "生成不含二维码的图片")}
              </Button>
            )}
          </div>
        )}
        {poster && (
          <>
            <div className="share-result-preview">
              <img
                src={poster.url}
                width={720}
                height={960}
                alt={posterAlt}
              />
            </div>
            {!poster.hasQr && (
              <p className="share-result-note">
                {l(
                  "This image has no Toy QR code. You can still save and share it.",
                  "此图片不含 Toy 二维码，仍可保存并分享。",
                )}
              </p>
            )}
            <div className="share-result-actions">
              {capabilities.saveImage ? (
                <Button
                  className="share-result-primary"
                  onClick={() => void saveImage()}
                  disabled={action !== null}
                >
                  <ImageDown size={18} aria-hidden="true" />{" "}
                  {action === "saving" ? l("Saving…", "正在保存…") : l("Save image", "保存图片")}
                </Button>
              ) : (
                <a className="share-result-primary" href={poster.url} download={filename}>
                  <Download size={18} aria-hidden="true" /> {l("Download image", "下载图片")}
                </a>
              )}
              {capabilities.share && (
                <Button
                  className="share-result-game"
                  variant="outline"
                  onClick={() => void shareGame()}
                  disabled={action !== null}
                >
                  <Share2 size={18} aria-hidden="true" />{" "}
                  {action === "sharing" ? l("Opening…", "正在打开…") : l("Share game", "分享游戏")}
                </Button>
              )}
            </div>
            {actionError && (
              <p className="share-result-error" role="alert">
                {actionError === "saving"
                  ? l(
                      "Toy could not save the image. You can download it instead.",
                      "Toy 暂时无法保存图片，可以改为下载。",
                    )
                  : l(
                      "The game could not be shared. Please try again.",
                      "暂时无法分享游戏，请重试。",
                    )}
              </p>
            )}
            {actionError === "saving" && (
              <a className="share-result-download" href={poster.url} download={filename}>
                <Download size={16} aria-hidden="true" />{" "}
                {l("Download image instead", "改为下载图片")}
              </a>
            )}
            {message && (
              <p className="share-result-note" role="status">
                {message}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
