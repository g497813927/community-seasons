"use client";

import { useState, type CSSProperties } from "react";
import { Check, Coins, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutfitPreview } from "@/components/outfit-preview";
import { translate, type Locale } from "@/lib/game/i18n";
import { SKINS, skinDefinition, type SkinId } from "@/lib/game/skins";
import {
  ACCESSORIES, COSMETIC_SLOTS, accessoryDefinition,
  type AccessoryId, type CosmeticSlot, type Outfit,
} from "@/lib/game/cosmetics";
import type { Progress } from "@/lib/game/store";
import "./skin-store.css";

const categories = [
  { id: "body", label: "Body" },
  { id: "hat", label: "Hats" },
  { id: "shoes", label: "Shoes" },
  { id: "effect", label: "Effects" },
] as const;
const slotLabels = { hat: "Hat", shoes: "Shoes", effect: "Effect" };
const defaults = { hat: "No hat", shoes: "Default shoes", effect: "No effect" };

export function SkinStore({ locale, progress, onBuy, onEquip, onBuyAccessory, onEquipAccessory }: {
  locale: Locale;
  progress: Progress;
  onBuy: (skin: SkinId) => void;
  onEquip: (skin: SkinId) => void;
  onBuyAccessory: (id: AccessoryId) => void;
  onEquipAccessory: (slot: CosmeticSlot, id: AccessoryId | null) => void;
}) {
  const [category, setCategory] = useState<string>("body");
  const t = (text: string) => translate(locale, text);
  const skin = skinDefinition(progress.equippedSkin);
  const summary = [
    { label: "Body", name: skin.name },
    ...COSMETIC_SLOTS.map((slot) => ({
      label: slotLabels[slot],
      name: accessoryDefinition(progress.outfit[slot])?.name ?? defaults[slot],
    })),
  ];
  return (
    <div className="skin-store">
      <div className="skin-store-intro">
        <h2>{t("Build your own TV.")}</h2>
        <p>{t("Mix a body color, hat, shoes, and effect. Every item is cosmetic.")}</p>
      </div>
      <section className="outfit-summary" aria-label={t("YOUR OUTFIT")}>
        <OutfitPreview
          skin={skin.id} outfit={progress.outfit}
          label={`${t("YOUR OUTFIT")}: ${summary.map(({ name }) => t(name)).join(", ")}`}
        />
        <div>
          <h3>{t("YOUR OUTFIT")}</h3>
          <dl>
            {summary.map(({ label, name }) => (
              <div key={label}><dt>{t(label)}</dt><dd>{t(name)}</dd></div>
            ))}
          </dl>
        </div>
      </section>
      <Tabs value={category} onValueChange={(value) => setCategory(String(value))} className="outfit-categories">
        <TabsList className="outfit-category-list" aria-label={t("Customize your look")}>
          {categories.map(({ id, label }) => <TabsTrigger key={id} value={id}>{t(label)}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="body">
          <div className="skin-grid">
            {SKINS.map((item) => (
              <CosmeticCard
                key={item.id} id={item.id} name={item.name} description={item.description}
                price={item.price} accent={item.palette.shell[0]} locale={locale}
                owned={progress.ownedSkins.includes(item.id)} equipped={skin.id === item.id}
                wallet={progress.wallet} skin={item.id} outfit={progress.outfit}
                onSelect={() => progress.ownedSkins.includes(item.id) ? onEquip(item.id) : onBuy(item.id)}
                equipLabel="Equip skin"
              />
            ))}
          </div>
        </TabsContent>
        {COSMETIC_SLOTS.map((slot) => (
          <TabsContent key={slot} value={slot}>
            <div className="skin-grid">
              <CosmeticCard
                id={`default-${slot}`} name={defaults[slot]} description="Included with every TV"
                price={0} accent={skin.palette.shell[0]} locale={locale} owned
                equipped={progress.outfit[slot] === null} wallet={progress.wallet}
                skin={skin.id} outfit={{ ...progress.outfit, [slot]: null }}
                onSelect={() => onEquipAccessory(slot, null)} equipLabel="Use default" isDefault
              />
              {ACCESSORIES.filter((item) => item.slot === slot).map((item) => (
                <CosmeticCard
                  key={item.id} id={item.id} name={item.name} description={item.description}
                  price={item.price} accent={item.accent} locale={locale}
                  owned={progress.ownedAccessories.includes(item.id)} equipped={progress.outfit[slot] === item.id}
                  wallet={progress.wallet} skin={skin.id} outfit={{ ...progress.outfit, [slot]: item.id } as Outfit}
                  onSelect={() => progress.ownedAccessories.includes(item.id) ? onEquipAccessory(slot, item.id) : onBuyAccessory(item.id)}
                  equipLabel="Equip item"
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <p className="store-tab-note">{t("Unlock items permanently. Mix and match owned items for free; changes apply immediately.")}</p>
    </div>
  );
}

function CosmeticCard({ id, name, description, price, accent, locale, owned, equipped, wallet,
  skin, outfit, onSelect, equipLabel, isDefault = false,
}: {
  id: string; name: string; description: string; price: number; accent: string; locale: Locale;
  owned: boolean; equipped: boolean; wallet: number; skin: SkinId; outfit: Outfit;
  onSelect: () => void; equipLabel: string; isDefault?: boolean;
}) {
  const t = (text: string) => translate(locale, text);
  const missing = Math.max(0, price - wallet);
  return (
    <article
      className={`skin-card${equipped ? " skin-equipped" : ""}`}
      style={{ "--skin-accent": accent } as CSSProperties}
      aria-labelledby={`skin-name-${id}`}
    >
      <div className="skin-preview">
        <span className="skin-status">
          {owned ? <Check size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
          {t(equipped ? "Equipped" : owned ? "Owned" : "Unlock & equip")}
        </span>
        <OutfitPreview skin={skin} outfit={outfit} />
      </div>
      <div className="skin-card-content">
        <h3 id={`skin-name-${id}`}>{t(name)}</h3>
        <p>{t(description)}</p>
        <Button
          className="buy-button skin-action"
          disabled={equipped || (!owned && missing > 0)}
          aria-label={equipped ? `${t(name)} · ${t("Equipped")}` : isDefault ? `${t("Use default")}: ${t(name)}` : t(owned ? `Equip ${name}` : `Unlock and equip ${name} for ${price} coins`)}
          onClick={onSelect}
        >
          <span>{t(equipped ? "Equipped" : owned ? equipLabel : "Unlock & equip")}</span>
          {!owned && <span><Coins size={15} aria-hidden="true" />{price.toLocaleString(locale)}</span>}
          {equipped && <Check size={16} aria-hidden="true" />}
        </Button>
        <span className="skin-hint">
          {t(!owned && missing > 0 ? `${missing} more coins needed` : price === 0 ? "Included" : owned ? "Owned" : "Your look, your way")}
        </span>
      </div>
    </article>
  );
}
