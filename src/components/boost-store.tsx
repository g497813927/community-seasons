"use client";
import {
  Orbit,
  X,
  Shield,
  Magnet,
  Rocket,
  Coins,
  Zap,
  ShoppingBag,
  Check,
  Lock,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress as Meter } from "@/components/ui/progress";
import {
  BOOSTERS,
  HEAD_START_WINDOW,
  UPGRADE_BOOSTERS,
  type SkillKind,
  PERMANENT_SKILLS,
  boostDefinition,
  skillDefinition,
  upgradePrice,
  type BoostLevel,
  type BoostKind,
  type BoostState,
} from "@/lib/game/boosts";
import { nextPortalScene, type Progress } from "@/lib/game/store";
import { translate, type Locale } from "@/lib/game/i18n";
import { SCENES, sceneDefinition, type SceneKind } from "@/lib/game/scenes";
import type { SkinId } from "@/lib/game/skins";
import type { AccessoryId, CosmeticSlot } from "@/lib/game/cosmetics";
import { SkinStore } from "@/components/skin-store";
const icons = {
  portal: Orbit,
  shield: Shield,
  magnet: Magnet,
  rush: Zap,
  headstart: Rocket,
  doubleCoins: Coins,
};
export function BoostStore({
  locale = "en",
  scene = "spring",
  open,
  onOpenChange,
  progress,
  onBuy,
  onUnlock,
  onEquip,
  onUpgrade,
  onBuySkin,
  onEquipSkin,
  onBuyAccessory,
  onEquipAccessory,
  runInProgress,
  message,
  savingAvailable,
  saveStatusText,
}: {
  locale?: Locale;
  scene?: SceneKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: Progress;
  onBuy: (kind: BoostKind, destination?: SceneKind) => void;
  onUnlock: (kind: BoostKind) => void;
  onEquip: (kind: BoostKind) => void;
  onUpgrade: (kind: BoostKind) => void;
  onBuySkin: (skin: SkinId) => void;
  onEquipSkin: (skin: SkinId) => void;
  onBuyAccessory: (id: AccessoryId) => void;
  onEquipAccessory: (slot: CosmeticSlot, id: AccessoryId | null) => void;
  runInProgress: boolean;
  message: string;
  savingAvailable: boolean;
  saveStatusText?: string;
}) {
  const t = (text: string) => translate(locale, text);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="store-dialog">
        <DialogHeader>
          <span className="store-eyebrow">
            <ShoppingBag size={16} /> {t("THE COMMUNITY STORE")}
          </span>
          <DialogTitle className="store-title">{t("Tools, skills, and a look of your own.")}</DialogTitle>
          <DialogDescription className="store-description">
            {t(
              "Spend collected coins on helpful tools, lasting skills, and TV outfits.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="store-balance">
          <span>{t("YOUR COIN BANK")}</span>
          <strong>
            <Coins size={22} />
            {t(progress.wallet.toLocaleString())}
          </strong>
        </div>
        <Tabs defaultValue="boosters" className="store-tabs">
          <TabsList className="store-tab-list">
            <TabsTrigger value="boosters">{t("Boosters")}</TabsTrigger>
            <TabsTrigger value="skills">
              <InfinityIcon size={15} />
              {t("Permanent skills")}
            </TabsTrigger>
            <TabsTrigger value="skins">{t("Skins")}</TabsTrigger>
            <TabsTrigger value="levels">{t("Levels")}</TabsTrigger>
          </TabsList>
          <TabsContent value="boosters">
            <p className="store-tab-note">
              {t(
                "Tap the booster buttons or press 1–4. Fresh Start and Season Pass work in the first 5 seconds; Shield and Shared Rewards remain available throughout the run. Jump to collect path boosters; they activate immediately.",
              )}
            </p>
            <div className="store-grid">
              {BOOSTERS.map((base) => {
                const booster = boostDefinition(base.id, progress.levels[base.id]);
                const Icon = icons[booster.id];
                const missing = Math.max(0, booster.price - progress.wallet);
                return (
                  <article className={`store-item ${booster.id}`} key={booster.id}>
                    <div className="store-item-top">
                      <span className="booster-symbol">
                        <Icon size={29} />
                      </span>
                      <span className="owned-count">
                        {progress.inventory[booster.id]} {t("owned")}
                      </span>
                    </div>
                    <span className="boost-duration">
                      {booster.id === "portal" ? (
                        t("ONE LEVEL · HOLD ONE")
                      ) : (
                        <>
                          {t("LEVEL")} {booster.level}
                        </>
                      )}{" "}
                      · {t(booster.durationLabel)}
                    </span>
                    <h3>{t(booster.name)}</h3>
                    <p>{t(booster.description)}</p>
                    <div className="boost-key-hint">
                      {t("Tap a booster button or press")} <kbd>{t(booster.key)}</kbd>
                    </div>
                    {booster.id === "portal" ? (
                      <div
                        className="headstart-routes"
                        aria-label={t("Buy Season Pass to another world")}
                      >
                        {SCENES.filter((world) => world.id !== scene).map((world) => (
                          <Button
                            key={world.id}
                            className="buy-button"
                            disabled={missing > 0 || progress.inventory.portal > 0}
                            onClick={() => onBuy("portal", world.id)}
                            aria-label={t(
                              `Buy Season Pass to ${world.name} for ${booster.price} coins`,
                            )}
                          >
                            <span>{t(world.name)}</span>
                            <span>
                              <Coins size={15} />
                              {booster.price}
                            </span>
                          </Button>
                        ))}
                        <small>
                          {t(
                            "Use within the first 5 seconds to travel. Hold only one Season Pass at a time.",
                          )}
                        </small>
                      </div>
                    ) : (
                      <Button
                        className="buy-button"
                        disabled={missing > 0}
                        onClick={() => onBuy(booster.id)}
                        aria-label={t(`Buy ${booster.name} for ${booster.price} coins`)}
                      >
                        <span>{t("Buy booster")}</span>
                        <span>
                          <Coins size={15} />
                          {booster.price}
                        </span>
                      </Button>
                    )}
                    <span className="afford-hint">
                      {t(
                        booster.id === "portal" && progress.inventory.portal > 0
                          ? "Use your Season Pass before buying another."
                          : missing > 0
                            ? `${missing} more coins needed`
                            : "Ready for your next journey",
                      )}
                    </span>
                  </article>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="skills">
            <p className="store-tab-note">
              {t(
                "Unlock skills, then equip just one for each run. Collected coins charge your equipped skill and still go into your bank. Press E when full.",
              )}{" "}
              {runInProgress && t("Selection changes apply to your next run.")}
            </p>
            <div className="store-grid">
              {PERMANENT_SKILLS.map((definition) => {
                const Icon = icons[definition.id],
                  skill = progress.skills[definition.id],
                  effect = boostDefinition(definition.id, progress.levels[definition.id]);
                const missing = Math.max(0, definition.price - progress.wallet);
                return (
                  <article
                    className={`store-item permanent-item ${definition.id}`}
                    key={definition.id}
                  >
                    <div className="store-item-top">
                      <span className="booster-symbol">
                        <Icon size={29} />
                      </span>
                      <span className="owned-count">
                        {skill.unlocked ? (
                          <>
                            <Check size={12} />
                            {t(progress.equippedSkill === definition.id ? "Selected" : "Unlocked")}
                          </>
                        ) : (
                          <>
                            <Lock size={12} />
                            {t("Locked")}
                          </>
                        )}
                      </span>
                    </div>
                    <span className="boost-duration">
                      {t("LEVEL")} {effect.level} · {t(effect.durationLabel)}
                    </span>
                    <h3>{t(definition.name)}</h3>
                    <p>
                      {t(effect.description)}{" "}
                      {t(`Collect ${definition.chargeCoins} coins per charge during a run.`)}
                    </p>
                    <div className="boost-key-hint">
                      {t("Trigger when full")} <kbd>{t(definition.key)}</kbd>
                    </div>
                    {skill.unlocked ? (
                      <Button
                        className="buy-button equip-button"
                        disabled={progress.equippedSkill === definition.id}
                        onClick={() => onEquip(definition.id)}
                      >
                        <span>
                          {t(
                            progress.equippedSkill === definition.id
                              ? "Equipped for next run"
                              : runInProgress
                                ? "Equip next run"
                                : "Equip skill",
                          )}
                        </span>
                        <Check size={15} />
                      </Button>
                    ) : (
                      <Button
                        className="buy-button"
                        disabled={missing > 0}
                        onClick={() => onUnlock(definition.id)}
                        aria-label={t(
                          `Permanently unlock ${definition.name} for ${definition.price} coins`,
                        )}
                      >
                        <span>{t("Unlock forever")}</span>
                        <span>
                          <Coins size={15} />
                          {definition.price}
                        </span>
                      </Button>
                    )}
                    <span className="afford-hint">
                      {t(
                        skill.unlocked
                          ? "Charge starts at zero every run"
                          : missing > 0
                            ? `${missing} more coins needed`
                            : "One purchase. Recharge again and again.",
                      )}
                    </span>
                  </article>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="skins">
            <SkinStore locale={locale} progress={progress} onBuy={onBuySkin} onEquip={onEquipSkin}
              onBuyAccessory={onBuyAccessory} onEquipAccessory={onEquipAccessory} />
          </TabsContent>
          <TabsContent value="levels">
            <p className="store-tab-note">
              {t(
                "Upgrade booster effects to level 3. Shield upgrades improve both versions. Magnet and Momentum can also be found along the path and activate immediately when collected.",
              )}
            </p>
            <div className="store-grid">
              {UPGRADE_BOOSTERS.map((base) => {
                const level = progress.levels[base.id],
                  effect = boostDefinition(base.id, level),
                  price = upgradePrice(base.id, level),
                  next = level < 3 ? boostDefinition(base.id, (level + 1) as BoostLevel) : null,
                  Icon = icons[base.id];
                return (
                  <article className={`store-item upgrade-item ${base.id}`} key={base.id}>
                    <div className="store-item-top">
                      <span className="booster-symbol">
                        <Icon size={29} />
                      </span>
                      <span className="owned-count">
                        {t("Level")} {level} / 3
                      </span>
                    </div>
                    <span className="boost-duration">
                      {t(
                        base.id === "magnet" || base.id === "rush"
                          ? "PERMANENT SKILL EFFECT"
                          : "CONSUMABLE BOOSTER",
                      )}
                    </span>
                    <h3>{t(base.name)}</h3>
                    <div className="level-pips" aria-label={t(`Level ${level} out of 3`)}>
                      {[1, 2, 3].map((n) => (
                        <span className={n <= level ? "filled" : ""} key={n}>
                          {n}
                        </span>
                      ))}
                    </div>
                    <p className="level-effect">
                      {t("Now:")} <b>{t(effect.durationLabel)}</b>
                      {base.id === "magnet" && t(` · ${effect.magnetRange}m range`)}
                      <br />
                      {next ? (
                        <>
                          {t("Next:")} <b>{t(next.durationLabel)}</b>
                          {base.id === "magnet" && t(` · ${next.magnetRange}m range`)}
                        </>
                      ) : (
                        t("Maximum power unlocked")
                      )}
                    </p>
                    <Button
                      className="buy-button"
                      disabled={price === null || progress.wallet < price}
                      onClick={() => onUpgrade(base.id)}
                    >
                      <span>
                        {t(price === null ? "Maximum level" : `Upgrade to level ${level + 1}`)}
                      </span>
                      {price !== null && (
                        <span>
                          <Coins size={15} />
                          {price}
                        </span>
                      )}
                    </Button>
                    <span className="afford-hint">
                      {t(
                        price !== null && progress.wallet < price
                          ? `${price - progress.wallet} more coins needed`
                          : "One upgrade improves every copy",
                      )}
                    </span>
                  </article>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
        <output className="store-message" aria-live="polite">
          <Check size={15} />
          <span>
            {t(
              message ||
                "Your coins, inventory, permanent unlocks, and levels are saved automatically. Skill charge resets every run.",
            )}
          </span>
        </output>
        <div className="store-bottom">
          <p>
            {saveStatusText ??
              t(
                savingAvailable
                  ? "Saved in this browser · Shop with game coins only"
                  : "Browser saving is unavailable. Progress will last for this session only.",
              )}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Back to game")}
          </Button>
        </div>
        <LocalizedClose locale={locale} />
      </DialogContent>
    </Dialog>
  );
}
export function BoostTray({
  locale = "en",
  scene = "spring",
  progress,
  boosts,
  runTime,
  disabled = false,
  onUse,
}: {
  locale?: Locale;
  progress: Progress;
  boosts: BoostState;
  scene?: SceneKind;
  runTime: number;
  disabled?: boolean;
  onUse: (kind: BoostKind) => void;
}) {
  const t = (text: string) => translate(locale, text);
  const opening = runTime < HEAD_START_WINDOW;
  return (
    <div
      className={`boost-tray ${opening ? "boost-tray-opening" : "boost-tray-compact"}`}
      role="group"
      data-game-controls
      aria-label={t("Consumable boosters")}
    >
      <span className="boost-tray-label">{t("BOOSTERS · USE ONCE")}</span>
      {BOOSTERS.filter(
        (booster) =>
          (opening || (booster.id !== "headstart" && booster.id !== "portal")) &&
          (booster.id !== "portal" || nextPortalScene(progress) !== scene),
      ).map((booster) => {
        const Icon = icons[booster.id],
          active = boosts[booster.id] > 0,
          count = progress.inventory[booster.id];
        const status = active
          ? booster.id === "shield"
            ? `${boosts.shield} hit${boosts.shield > 1 ? "s" : ""} · ${Math.ceil(boosts.shieldTime)}s`
            : `${Math.ceil(boosts[booster.id])}s left`
          : `${count} owned`;
        return (
          <Button
            key={booster.id}
            className={`boost-slot ${booster.id} ${active ? "boost-active" : ""}`}
            disabled={disabled || active || count === 0}
            onClick={() => onUse(booster.id)}
            aria-label={`${t(booster.shortName)}: ${t(status)}. ${t("Tap to activate")}.`}
            aria-keyshortcuts={booster.key}
            title={`${t(booster.shortName)}: ${t(status)}`}
          >
            <kbd aria-hidden="true">{t(booster.key)}</kbd>
            <Icon aria-hidden="true" />
            <span className="boost-slot-count" aria-hidden="true">
              {active
                ? `${Math.ceil(booster.id === "shield" ? boosts.shieldTime : boosts[booster.id])}${locale === "zh-CN" ? "秒" : "s"}`
                : `×${count > 99 ? "99+" : count}`}
            </span>
            <span className="boost-slot-copy">
              <b>{t(booster.shortName)}</b>
              <span className="boost-slot-meta">
                {booster.id !== "portal" && (
                  <small className="boost-slot-level">
                    {t("L")}
                    {progress.levels[booster.id]}
                  </small>
                )}
                <small>{t(status)}</small>
              </span>
              {booster.id === "portal" && count > 0 && !active && nextPortalScene(progress) && (
                <small>
                  {t("To")} {t(sceneDefinition(nextPortalScene(progress)!).name)}
                </small>
              )}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
export function PermanentSkillHud({
  locale = "en",
  kind,
  progress,
  boosts,
  onTrigger,
  charge,
}: {
  locale?: Locale;
  kind: SkillKind | null;
  progress: Progress;
  boosts: BoostState;
  onTrigger: (kind: BoostKind) => void;
  charge: number;
}) {
  const t = (text: string) => translate(locale, text);
  if (!kind)
    return (
      <div className="permanent-hud empty-skill">
        <span className="boost-tray-label">{t("PERMANENT SKILL")}</span>
        <b>{t("No skill equipped")}</b>
        <small>{t("Choose one before your next run.")}</small>
      </div>
    );
  const definition = skillDefinition(kind),
    Icon = icons[kind],
    active = boosts[kind] > 0,
    ready = charge >= definition.chargeCoins;
  const activeLabel =
    kind === "shield"
      ? `${boosts.shield} hit${boosts.shield > 1 ? "s" : ""} · ${Math.ceil(boosts.shieldTime)}s`
      : `${Math.ceil(boosts[kind])}s active`;
  const percent = Math.max(0, Math.min(100, (charge / definition.chargeCoins) * 100));
  return (
    <div
      className={`permanent-hud ${kind} ${ready && !active ? "skill-ready" : ""}`}
      aria-label={t("Equipped permanent skill")}
    >
      <span className="boost-tray-label">
        <InfinityIcon size={12} />
        {t("EQUIPPED PERMANENT SKILL")}
      </span>
      <Button
        className="permanent-trigger"
        disabled={!ready || active}
        onClick={() => onTrigger(kind)}
        aria-label={t(
          `${definition.name}. ${active ? "Active." : ready ? "Fully charged." : "Charging."} Double-tap or press E when ready.`,
        )}
      >
        <svg className="skill-charge-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle className="skill-ring-track" cx="32" cy="32" r="27" />
          <circle
            className="skill-ring-fill"
            cx="32"
            cy="32"
            r="27"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - percent}
          />
        </svg>
        <Icon size={24} />
        <span>
          <b>{t(definition.name)}</b>
          <small>
            {t("Level")} {progress.levels[kind]} ·{" "}
            {t(active ? activeLabel : ready ? "Double-tap or press E" : "Collect coins to charge")}
          </small>
        </span>
        <kbd>{t("E")}</kbd>
      </Button>
      <div className="skill-mobile-label" aria-hidden="true">
        <b>{t(boostDefinition(kind).shortName)}</b>
        <small>{active ? t(activeLabel) : ready ? t("Ready") : t("Charging")}</small>
      </div>
      <small className="skill-compact-status" aria-hidden="true">
        {active
          ? `${Math.ceil(kind === "shield" ? boosts.shieldTime : boosts[kind])}${locale === "zh-CN" ? "秒" : "s"}`
          : `${Math.floor(percent)}%`}
      </small>
      <Meter
        className="permanent-meter"
        value={charge}
        max={definition.chargeCoins}
        aria-label={t(`${definition.name} charge`)}
        aria-valuetext={t(active ? "Active" : ready ? "Ready" : "Charging")}
      />
      <div className="permanent-charge-label">
        <span>
          {t(active ? "Charging resumes after the effect" : ready ? "FULLY CHARGED" : "CHARGE")}
        </span>
      </div>
    </div>
  );
}

export function RunSetup({
  locale = "en",
  open,
  onOpenChange,
  progress,
  selected,
  onSelectedChange,
  onStart,
  returnFocus,
  automaticLeaderboard = false,
  onStore,
  scene,
}: {
  locale?: Locale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: Progress;
  selected: SkillKind | null;
  onSelectedChange: (kind: SkillKind | null) => void;
  onStart: (kind: SkillKind | null) => void;
  returnFocus?: () => HTMLElement | boolean | null;
  automaticLeaderboard?: boolean;
  onStore: () => void;
  scene: SceneKind;
}) {
  const t = (text: string) => translate(locale, text);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="run-setup-dialog" finalFocus={returnFocus}>
        <DialogHeader>
          <span className="store-eyebrow">{t("BEFORE YOU RUN")}</span>
          <DialogTitle className="store-title">{t("Choose your expedition.")}</DialogTitle>
          <DialogDescription className="store-description">
            {t(
              "Your run starts in your last world. Equip one skill; collect 100 coins, then double-tap the path or press E.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onStart(selected);
          }}
        >
          <p className="starting-world">
            {t("Starting world")}: <b>{t(sceneDefinition(scene).name)}</b>
          </p>
          <RadioGroup
            className="loadout-options"
            value={selected ?? "none"}
            onValueChange={(value) =>
              onSelectedChange(value === "none" ? null : (value as SkillKind))
            }
            aria-label={t("Permanent skill for this run")}
          >
            <label
              htmlFor="loadout-none"
              className={`loadout-option ${selected === null ? "selected" : ""}`}
            >
              <RadioGroupItem value="none" id="loadout-none" />
              <span>
                <b>{t("Run without a skill")}</b>
                <small>{t("Tap booster buttons or press 1 / 2 / 3.")}</small>
              </span>
            </label>
            {PERMANENT_SKILLS.map((definition) => {
              const skill = progress.skills[definition.id],
                Icon = icons[definition.id];
              return (
                <label
                  htmlFor={`loadout-${definition.id}`}
                  className={`loadout-option ${selected === definition.id ? "selected" : ""} ${!skill.unlocked ? "locked" : ""}`}
                  key={definition.id}
                >
                  <RadioGroupItem
                    value={definition.id}
                    id={`loadout-${definition.id}`}
                    disabled={!skill.unlocked}
                  />
                  <Icon size={22} />
                  <span>
                    <b>
                      {t(definition.name)}
                      <i>
                        {t("Lv")} {progress.levels[definition.id]}
                      </i>
                    </b>
                    <small>
                      {t(
                        skill.unlocked
                          ? `Starts empty · Collect ${definition.chargeCoins} coins to charge`
                          : `Unlock in the store for ${definition.price} coins`,
                      )}
                    </small>
                  </span>
                  {!skill.unlocked && <Lock size={14} />}
                </label>
              );
            })}
          </RadioGroup>
          {automaticLeaderboard && <p className="run-leaderboard-note">
            {locale === "zh-CN"
              ? "本局结束后，符合条件的成绩会自动提交至 Toy 排行榜，并公开展示你的哔哩哔哩昵称和头像。可在排行榜中关闭以后的提交；已提交的成绩不会因此移除。存档中的最高分不会提交。"
              : "Eligible completed runs post automatically to Toy with your Bilibili nickname and avatar. You can stop future submissions in the leaderboard; scores already posted are not removed. Saved best scores are never submitted."}
          </p>}
          <div className="run-setup-footer">
            <Button type="button" variant="outline" onClick={onStore}>
              <ShoppingBag size={16} />
              {t("Store")}
            </Button>
            <Button type="submit" className="run-button">
              {t("Begin run")} <Zap size={16} />
            </Button>
          </div>
        </form>
        <LocalizedClose locale={locale} />
      </DialogContent>
    </Dialog>
  );
}

function LocalizedClose({ locale }: { locale: Locale }) {
  const label = translate(locale, "Close");
  return (
    <DialogClose
      render={
        <Button
          variant="ghost"
          className="localized-dialog-close"
          size="icon-sm"
          aria-label={label}
        />
      }
    >
      <X size={18} />
    </DialogClose>
  );
}
