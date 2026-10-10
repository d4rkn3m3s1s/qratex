/**
 * Oyun kayıt defteri tipleri — İSTEMCİ GÜVENLİ (etiketli içerik / doğrulayıcı import etmez).
 * Sunucu tarafı (doğrulayıcı) eşi: `<id>.server.ts` → `registry/server.ts`.
 */
import type { ComponentType } from 'react';
import type { MiniGameConfig } from '@/lib/use-mini-game';
import type { GameFx } from '@/lib/games/engine/fx';
import type { ActionProof, ClassificationProof, DeterministicProof } from '@/lib/games/verify';
import type { PublicContentItem, VerificationKind } from '@/lib/games/verify/types';

/**
 * live     → oynanabilir (dinamik rota bileşeni yükler).
 * building → kayıtlı ama bileşen/sunucu doğrulayıcısı hazır değil; rota hub'a döner,
 *            hub'da görünmez, sunucu yeni deneme açmaz (`minigame-config` hidden + release).
 * retired  → portföyden çıktı (§7.3); rota hub'a ya da birleştiği oyuna döner.
 */
export type GameStatus = 'live' | 'building' | 'retired';

/**
 * legacy → bileşen kendi `GameShell`'ini ve `useMiniGame`'ini içerir (bugünkü 20 oyun).
 * v2     → bileşen YALNIZ oynanışı çizer; kabuk, mod seçimi, duraklatma, oturum ve ödül
 *          dinamik rotadaki `GameHost`'tadır. Props: `GameComponentProps`.
 */
export type GameContract = 'legacy' | 'v2';

/** Pratik: sınırsız, ödülsüz, liderliğe girmez. Sıralı: günde N deneme, ödüllü. */
export type GameMode = 'practice' | 'ranked';

export type GameRole = 'flagship' | 'action' | 'arcade' | 'puzzle' | 'casual' | 'social';

export type GameProof = ClassificationProof | DeterministicProof | ActionProof;

/** Oyunun bitiş bildirimi. `won` kozmetiktir; karar sunucunundur (sıralıda). */
export interface GameFinish {
  score: number;
  won: boolean;
  /** Doğrulayıcı ailesine uygun kanıt (sıralıda gönderilir; pratikte yok sayılır). */
  proof?: GameProof;
}

/** v2 sözleşmesi — dinamik rota `GameHost` bu props'u verir. */
export interface GameComponentProps {
  /** Kayıt defteri kimliği (URL). */
  id: string;
  /** Sunucu anahtarı (API/DB). */
  gameType: string;
  mode: GameMode;
  /** Deneme tohumu: sıralıda sunucudan, pratikte sunucu/yerel. Skoru etkileyen her rastgelelik bundan. */
  seed: string;
  /** Etkin (admin override sonrası) yapılandırma — eşik/tavan için `DEF` değil BU kullanılır. */
  config: MiniGameConfig;
  /** Sınıflandırma ailesinde tur içeriği (sıralıda ETİKETSİZ). Diğer ailelerde null. */
  content: PublicContentItem[] | null;
  /** Yalnız pratik turunda: öğe → doğru etiket (anında geri bildirim için). Sıralıda null. */
  answerKey: Record<string, string> | null;
  /** Kabuk duraklattı mı (menü açık / sekme gizlendi). Döngü bunu `useGameLoop({ paused })`'a verir. */
  paused: boolean;
  /** Oyun duraklatma ister (Esc tuşu, sekme gizlendi). */
  onPauseRequest: () => void;
  /** Oyun bitti → kabuk sonucu gönderir (sıralı) ya da yerel gösterir (pratik). Bir kez çağrılır. */
  onFinish: (result: GameFinish) => void;
  /** Ses/titreşim/konfeti — politika + oyuncu tercihiyle süzülmüş. */
  fx: GameFx;
  /** Tema vurgusu (hex). */
  accent: string;
}

export type V2GameComponent = ComponentType<GameComponentProps>;
/** Eski bileşenler props almaz (kendi kabuklarını kurar). */
export type LegacyGameComponent = ComponentType<Record<string, never>>;

export type GameLoader =
  | { contract: 'v2'; load: () => Promise<V2GameComponent> }
  | { contract: 'legacy'; load: () => Promise<LegacyGameComponent> };

export interface GameEntry {
  /** URL kimliği (`/customer/games/<id>`), kebab-case. */
  id: string;
  /** Sunucu anahtarı (`MiniGameSession.gameType`, `/api/customer/games/<gameType>`). Çoğunlukla id ile aynı. */
  gameType: string;
  /** Türkçe ad. */
  title: string;
  /** Mekaniği BİREBİR anlatan kısa açıklama (Y3: vaat ≠ mekanik yasak). */
  tagline: string;
  emoji: string;
  /** Hex vurgu (oyun kabuğu; play kaydı). */
  accent: string;
  status: GameStatus;
  role: GameRole;
  /** Hedef doğrulama ailesi (lib/games/verify). */
  verification: VerificationKind;
  /** Bu oyuna birleşen eski kimlikler (yönlendirme ve geçmiş veri için). */
  mergedFrom?: readonly string[];
  modes: {
    practice: boolean;
    /** Sıralı mod; `attemptsPerDay` bugün şema gereği 1 (`@@unique([userId, gameType, dayKey])`). */
    ranked: { attemptsPerDay: 1 } | false;
  };
  /** Bileşen yükleyici. `building` iken null. */
  component: GameLoader | null;
  /** Klavye/dokunma şeması (erişilebilirlik; kabukta "Kontroller" altında). */
  controls?: string;
}

export interface RetiredGame {
  id: string;
  title: string;
  /** §7.3 gerekçesi. */
  reason: string;
  /** Yerine geçen oyun (canlıysa oraya, değilse hub'a yönlenir). */
  successor: string | null;
}

/** Eski kimlik → yeni oyun (+ isteğe bağlı mod ipucu). */
export interface LegacyAlias {
  target: string;
  /** Hedef oyunun alt modu (ör. Sahte Avcısı `?mod=profil`). */
  mode?: string;
}

/** Yer tutucu kayıt kurucusu — tip denetimi ve varsayılanlar. */
export function defineGame(entry: GameEntry): GameEntry {
  return entry;
}
