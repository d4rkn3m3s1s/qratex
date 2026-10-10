/**
 * Sunucu otoritesi çerçevesi — oyun başına doğrulayıcı sözleşmesi (yol haritası §7.2 ilke 1).
 *
 * Üç aile:
 *   classification → etiketler SUNUCUDA. `start` tohumdan bir tur kurar, istemciye ETİKETSİZ
 *                    içerik gider; `complete`'te aynı tohumdan tur yeniden kurulur ve
 *                    cevaplar sunucuda puanlanır. (Sahte Avcısı, Günün Kelimesi, Bilgi Yarışması)
 *   deterministic  → tohum + girdi kaydı → saf simülasyon (`sim.ts`) sunucuda yeniden oynatılır,
 *                    skor sunucunundur. (Veri Yılanı, Yorum İstifi, Güven Birleştir, Sinyal Bağla,
 *                    Eşleştir-3, Spam Kırıcı)
 *   action         → gerçek zamanlı aksiyon; tam replay pahalıysa skor eğrisi (checkpoint
 *                    izi) + makullük. (Zihin Hırsızı, Çekirdek Savunması, Kar Tanesi, Yıldız Avı)
 *
 * Ortak kurallar (lib/game-session.ts zaten uygular, doğrulayıcı ÜSTÜNE ekler):
 * imzalı deneme belirteci, sunucu saatiyle süre, saniye başına skor tavanı, maxScore kırpma.
 * `won` bayrağı yalnız kozmetiktir; kazanma = sunucu skorunun eşiği geçmesi.
 *
 * Doğrulayıcılar SAF ve senkron olmalı (DB/ağ yok): girdi = tohum + kanıt + kurallar.
 */
import type { ZodType } from 'zod';

export type VerificationKind = 'classification' | 'deterministic' | 'action';

/**
 * Doğrulayıcı bayrakları.
 *  - bloklayan: `proof_missing`, `proof_invalid`, `implausible` → deneme kazanılmış sayılmaz.
 *  - sinyal:    `score_mismatch` → |istemci − sunucu| > 0 (hile sinyali; dürüst oyuncuyu
 *               cezalandırmaz, sunucu skoru esas alınır).
 */
export type VerifierFlag = 'proof_missing' | 'proof_invalid' | 'implausible' | 'score_mismatch';

export const BLOCKING_VERIFIER_FLAGS: ReadonlySet<VerifierFlag> = new Set(['proof_missing', 'proof_invalid', 'implausible']);

/** Doğrulamanın ihtiyaç duyduğu etkin oyun kuralları (EffectiveMiniGame alt kümesi). */
export interface VerifierRules {
  gameType: string;
  maxScore: number;
  rewardThreshold: number;
  minDurationSec: number;
  maxScorePerSec?: number;
  maxDurationSec?: number;
}

export interface VerifyInput {
  /** `start`'ta üretilen deneme tohumu (DB'deki satırdan; istemciden DEĞİL). */
  seed: string;
  rules: VerifierRules;
  /** İstemcinin gönderdiği ham kanıt (şemayla doğrulanacak). */
  proof: unknown;
  /** İstemcinin skor beyanı. */
  clientScore: number;
  /** Sunucu saatine göre geçen süre (sn). */
  serverElapsedSec: number;
}

export interface VerifierOutcome {
  /** Sunucunun hesapladığı/doğruladığı skor (0..maxScore'a kırpılır). */
  verifiedScore: number;
  flags: VerifierFlag[];
  /** Denetim/inceleme için kısa ayrıntı (istemciye GÖNDERİLMEZ). */
  detail?: string;
}

interface VerifierBase<P> {
  kind: VerificationKind;
  /** Kanıt şeması (zod). Gövde boyutu `MAX_PROOF_BYTES` ile ayrıca sınırlı. */
  proofSchema: ZodType<P>;
  /**
   * true → kanıtsız `complete` kazanılmış sayılmaz (`proof_missing`). Yeni oyunlarda true;
   * geçiş döneminde eski istemciyle uyum için false olabilir (yalnız makullük uygulanır).
   */
  requireProof: boolean;
}

/** İstemciye giden etiketsiz içerik öğesi. `id` tur içinde benzersiz. */
export interface PublicContentItem {
  id: string;
  [field: string]: unknown;
}

export interface ClassificationRound {
  /** İstemciye gidecek ETİKETSİZ öğeler (sırası korunur). */
  items: PublicContentItem[];
  /** id → doğru etiket. ASLA istemciye gitmez (pratik turu hariç). */
  answerKey: Record<string, string>;
}

export interface ClassificationVerifier<P = unknown> extends VerifierBase<P> {
  kind: 'classification';
  /** Sıralı tur: tohumdan deterministik kurulur (start'ta ve complete'te aynı sonuç). */
  buildRound(seed: string, rules: VerifierRules): ClassificationRound;
  /**
   * Pratik turu: ödülsüz, ETİKETLİ (istemci kendisi puanlar). Sıralı havuzdan AYRI bir
   * havuzdan kurulmalı; yoksa sınırsız pratikle sıralı havuzun etiketleri kazınabilir.
   */
  practiceRound(seed: string, rules: VerifierRules): ClassificationRound;
  /** Cevapları puanlar. */
  score(round: ClassificationRound, proof: P, input: VerifyInput): VerifierOutcome;
}

export interface DeterministicVerifier<P = unknown> extends VerifierBase<P> {
  kind: 'deterministic';
  /** Tohum + kanıt (girdi kaydı) → saf simülasyonla skor. */
  replay(seed: string, proof: P, input: VerifyInput): VerifierOutcome;
}

export interface ActionVerifier<P = unknown> extends VerifierBase<P> {
  kind: 'action';
  /** Checkpoint izi + makullük. */
  check(proof: P, input: VerifyInput): VerifierOutcome;
}

export type GameVerifier<P = unknown> = ClassificationVerifier<P> | DeterministicVerifier<P> | ActionVerifier<P>;
// Kayıt defterinde farklı kanıt tipleri yan yana durur.
export type AnyGameVerifier = GameVerifier<any>;

/** Sunucu tarafı oyun modülü (`lib/games/registry/<id>.server.ts`). */
export interface GameServerModule {
  verifier: AnyGameVerifier;
}

/** `complete` gövdesindeki kanıtın JSON boyut sınırı (bayt). */
export const MAX_PROOF_BYTES = 256_000;
