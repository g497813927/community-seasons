"use client";

import { useRef } from "react";
import { Cloud, CloudDownload, CloudUpload, HardDrive, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOOSTERS, PERMANENT_SKILLS, UPGRADE_BOOSTERS } from "@/lib/game/boosts";
import type { SaveSnapshot } from "@/lib/game/cloud-save";
import { ACCESSORIES, accessoryDefinition, type CosmeticSlot } from "@/lib/game/cosmetics";
import { translate, type Locale } from "@/lib/game/i18n";
import { sceneDefinition } from "@/lib/game/scenes";
import { SKINS, skinDefinition } from "@/lib/game/skins";
import "./cloud-save-dialog.css";

export function CloudSaveDialog({
  open,
  locale,
  localSnapshot,
  cloudSnapshot,
  busy,
  error,
  onUseLocal,
  onUseCloud,
  onStayLocal,
}: {
  open: boolean;
  locale: Locale;
  localSnapshot: SaveSnapshot;
  cloudSnapshot: SaveSnapshot | null;
  busy: boolean;
  error?: string;
  onUseLocal: () => void;
  onUseCloud: () => void;
  onStayLocal: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const l = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const t = (text: string) => translate(locale, text);
  const number = (value: number) => value.toLocaleString(locale);
  const unlockedCount = (save: SaveSnapshot) =>
    PERMANENT_SKILLS.filter(({ id }) => save.progress.skills[id].unlocked).length;
  const upgrades = (save: SaveSnapshot) =>
    UPGRADE_BOOSTERS.filter(({ id }) => save.progress.levels[id] > 1).length;
  const inventoryCount = (save: SaveSnapshot) =>
    BOOSTERS.reduce((total, { id }) => total + save.progress.inventory[id], 0);
  const accessorySlots: { id: CosmeticSlot; label: string; empty: string }[] = [
    { id: "hat", label: t("Hats"), empty: t("No hat") },
    { id: "shoes", label: t("Shoes"), empty: t("Default shoes") },
    { id: "effect", label: t("Effects"), empty: t("No effect") },
  ];
  const equippedAccessory = (save: SaveSnapshot, slot: CosmeticSlot, empty: string) => {
    const accessory = accessoryDefinition(save.progress.outfit[slot]);
    return accessory ? t(accessory.name) : empty;
  };
  const saves = [
    { id: "local", title: l("This device", "本机存档"), save: localSnapshot },
    ...(cloudSnapshot
      ? [{ id: "cloud", title: l("Bilibili cloud", "哔哩哔哩云存档"), save: cloudSnapshot }]
      : []),
  ];
  const rows = [
    { label: l("Coins", "金币"), value: (save: SaveSnapshot) => number(save.progress.wallet) },
    { label: l("Best score", "最高分"), value: (save: SaveSnapshot) => number(save.best) },
    {
      label: l("Skills unlocked", "已解锁技能"),
      value: (save: SaveSnapshot) => `${unlockedCount(save)} / ${PERMANENT_SKILLS.length}`,
    },
    {
      label: l("Upgraded effects", "已升级效果"),
      value: (save: SaveSnapshot) => `${upgrades(save)} / ${UPGRADE_BOOSTERS.length}`,
    },
    {
      label: l("Stored boosters", "持有道具"),
      value: (save: SaveSnapshot) => number(inventoryCount(save)),
    },
    {
      label: l("Owned skins", "已拥有皮肤"),
      value: (save: SaveSnapshot) =>
        SKINS.filter((skin) => save.progress.ownedSkins.includes(skin.id))
          .map((skin) => t(skin.name))
          .join(l(", ", "、")),
    },
    {
      label: l("Equipped skin", "已装备皮肤"),
      value: (save: SaveSnapshot) => t(skinDefinition(save.progress.equippedSkin).name),
    },
    {
      label: l("Owned accessories", "已拥有饰品"),
      value: (save: SaveSnapshot) =>
        `${save.progress.ownedAccessories.length} / ${ACCESSORIES.length}`,
    },
    ...accessorySlots.map(({ id, label, empty }) => ({
      label: l(`Equipped ${id}`, `已装备${label}`),
      value: (save: SaveSnapshot) => equippedAccessory(save, id, empty),
    })),
    {
      label: l("Last season", "上次场景"),
      value: (save: SaveSnapshot) => t(sceneDefinition(save.scene).name),
    },
  ];

  return (
    <Dialog
      open={open}
      disablePointerDismissal={busy}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onStayLocal();
      }}
    >
      <DialogContent
        className="cloud-save-dialog"
        showCloseButton={false}
        initialFocus={titleRef}
        lang={locale}
        aria-busy={busy}
      >
        <DialogHeader>
          <span className="cloud-save-eyebrow">
            <Cloud size={17} aria-hidden="true" /> {l("YOUR BILIBILI SAVE", "你的哔哩哔哩存档")}
          </span>
          <DialogTitle ref={titleRef} tabIndex={-1} className="cloud-save-title">
            {cloudSnapshot
              ? l("Which save would you like to use?", "你想使用哪份存档？")
              : l("Take your progress with you", "让进度随你同行")}
          </DialogTitle>
          <DialogDescription className="cloud-save-description">
            {cloudSnapshot
              ? l(
                  "Your device and Bilibili cloud have different saves. Choose one to sync across devices signed in to this Bilibili account.",
                  "本机与哔哩哔哩云端的存档不同。选择一份，在登录同一哔哩哔哩账号的设备间同步。",
                )
              : l(
                  "This Bilibili account has no cloud save yet. Upload this device’s progress to continue on your other devices.",
                  "这个哔哩哔哩账号还没有云存档。上传本机进度，即可在其他设备继续游戏。",
                )}
          </DialogDescription>
        </DialogHeader>

        <table className="cloud-save-comparison">
          <caption className="sr-only">{l("Saved progress comparison", "存档进度对比")}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{l("Progress", "进度")}</span>
              </th>
              {saves.map(({ id, title }) => (
                <th scope="col" key={id}>
                  {id === "local" ? (
                    <HardDrive size={17} aria-hidden="true" />
                  ) : (
                    <Cloud size={17} aria-hidden="true" />
                  )}
                  <span>{title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {saves.map(({ id, save }) => (
                  <td key={id}>{row.value(save)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <details className="cloud-save-details">
          <summary>{l("View outfits, skills, levels and boosters", "查看装扮、技能、等级与道具")}</summary>
          <div className="cloud-save-detail-grid">
            {saves.map(({ id, title, save }) => (
              <section key={id} aria-label={title}>
                <h3>{title}</h3>
                <h4>{l("TV skins", "小电视皮肤")}</h4>
                <ul>
                  {SKINS.map((skin) => (
                    <li key={skin.id}>
                      <span>{t(skin.name)}</span>
                      <span>
                        {save.progress.equippedSkin === skin.id
                          ? l("Equipped", "已装备")
                          : save.progress.ownedSkins.includes(skin.id)
                            ? l("Owned", "已拥有")
                            : l("Locked", "未解锁")}
                      </span>
                    </li>
                  ))}
                </ul>
                <h4>{l("Owned accessories", "已拥有饰品")}</h4>
                <ul className="cloud-save-accessories">
                  {accessorySlots.map(({ id: slot, label }) => (
                    <li key={slot}>
                      <span>{label}</span>
                      <span>
                        {ACCESSORIES.filter(
                          (item) => item.slot === slot && save.progress.ownedAccessories.includes(item.id),
                        )
                          .map((item) => t(item.name))
                          .join(l(", ", "、")) || l("None", "暂无")}
                      </span>
                    </li>
                  ))}
                </ul>
                <h4>{l("Permanent skills", "永久技能")}</h4>
                <ul>
                  {PERMANENT_SKILLS.map((skill) => (
                    <li key={skill.id}>
                      <span>{t(skill.name)}</span>
                      <span>
                        {save.progress.skills[skill.id].unlocked
                          ? l("Unlocked", "已解锁")
                          : l("Locked", "未解锁")}
                        {save.progress.equippedSkill === skill.id
                          ? l(" · Equipped", " · 已装备")
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <h4>{l("Effect levels", "效果等级")}</h4>
                <ul>
                  {UPGRADE_BOOSTERS.map((booster) => (
                    <li key={booster.id}>
                      <span>{t(booster.name)}</span>
                      <span>
                        {l("Lv", "等级")} {save.progress.levels[booster.id]}
                      </span>
                    </li>
                  ))}
                </ul>
                <h4>{l("Stored boosters", "持有道具")}</h4>
                <ul>
                  {BOOSTERS.map((booster) => (
                    <li key={booster.id}>
                      <span>{t(booster.name)}</span>
                      <span>× {number(save.progress.inventory[booster.id])}</span>
                    </li>
                  ))}
                </ul>
                {save.progress.portalDestination && save.progress.inventory.portal > 0 && (
                  <p>
                    {l("Season Pass destination: ", "四季通行目的地：")}
                    {t(sceneDefinition(save.progress.portalDestination).name)}
                  </p>
                )}
              </section>
            ))}
          </div>
        </details>

        <p className="cloud-save-consequence">
          {cloudSnapshot
            ? l(
                "Saves are not merged. The save you choose will replace the other one, including coins, purchases, owned skins and accessories, your equipped outfit, and your last season.",
                "存档不会合并。选中的存档将覆盖另一份，包括金币、购买内容、已拥有的皮肤与饰品、当前装扮，以及上次场景。",
              )
            : l(
                "Your coins, purchases, owned skins and accessories, equipped outfit, best score and last season will be saved to this Bilibili account.",
                "金币、购买内容、已拥有的皮肤与饰品、当前装扮、最高分和上次场景将保存到这个哔哩哔哩账号。",
              )}
        </p>
        {error && (
          <p className="cloud-save-error" role="alert">
            {error}
          </p>
        )}
        <div className="cloud-save-actions">
          {cloudSnapshot && (
            <Button className="cloud-save-choice" disabled={busy} onClick={onUseCloud}>
              <CloudDownload size={20} aria-hidden="true" />
              <span>
                <strong>{l("Use cloud save", "使用云存档")}</strong>
                <small>{l("Replace this device’s progress", "覆盖本机进度")}</small>
              </span>
            </Button>
          )}
          <Button className="cloud-save-choice" disabled={busy} onClick={onUseLocal}>
            <CloudUpload size={20} aria-hidden="true" />
            <span>
              <strong>
                {cloudSnapshot
                  ? l("Use this device save", "使用本机存档")
                  : l("Upload this device save", "上传本机存档")}
              </strong>
              <small>
                {cloudSnapshot
                  ? l("Replace your Bilibili cloud progress", "覆盖哔哩哔哩云端进度")
                  : l("Enable sync across your devices", "开启跨设备同步")}
              </small>
            </span>
          </Button>
          <Button
            className="cloud-save-local-only"
            variant="ghost"
            disabled={busy}
            onClick={onStayLocal}
          >
            <HardDrive size={17} aria-hidden="true" />
            <span>
              <strong>{l("Keep this device only", "仅使用本机存档")}</strong>
              <small>{l("No cloud changes · Sync stays off", "不改动云端 · 暂不开启同步")}</small>
            </span>
          </Button>
        </div>
        {busy && (
          <p className="cloud-save-dialog-status" role="status">
            <LoaderCircle className="cloud-save-spinner" size={16} aria-hidden="true" />
            {l("Saving your choice…", "正在保存你的选择…")}
          </p>
        )}
        <p className="cloud-save-dismiss-note">
          {l(
            "Closing this dialog keeps this device’s save and leaves cloud sync off.",
            "关闭此窗口将保留本机存档，不开启云同步。",
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
