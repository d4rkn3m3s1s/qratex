/**
 * Sunucu otoritesi çerçevesi — doğrulayıcı fabrikaları ve tek çalıştırıcı.
 *
 *   runVerifier(verifier, { seed, rules, proof, clientScore, serverElapsedSec }) → { verifiedScore, flags }
 *
 * `lib/game-session.ts → finalizeAttempt` bunu `verify` kancasıyla çağırır; sonuç
 * `evaluateAttempt`'a girer (sunucu skoru esas, bloklayan bayrak → kazanılmadı).
 * Çalıştırıcı ASLA fırlatmaz: bozuk kanıt `proof_invalid` olur (dürüst ama eski istemci
 * 500 görmez, hileli istemci ödül alamaz).
 */
import { z } from 'zod';
import { inputLogSchema, type InputLog } from '@/lib/games/engine/record';
import {
  BLOCKING_VERIFIER_FLAGS,
  MAX_PROOF_BYTES,
  type ActionVerifier,
  type AnyGameVerifier,
  type ClassificationRound,
  type ClassificationVerifier,
  type DeterministicVerifier,
  type PublicContentItem,
  type VerifierFlag,
  type VerifierOutcome,
  type VerifierRules,
  type VerifyInput,
} from './types';

export * from './types';

/** İstemci ile sunucu saati arasındaki tolerans (ağ gecikmesi). */
export const VERIFY_CLOCK_SLACK_MS = 5_000;

function clampScore(n: number, rules: VerifierRules): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(rules.maxScore, Math.floor(n)));
}

function uniq(flags: VerifierFlag[]): VerifierFlag[] {
  return Array.from(new Set(flags));
}

/** Bayrak listesinde kazanmayı engelleyen var mı. */
export function hasBlockingVerifierFlag(flags: readonly string[]): boolean {
  return flags.some((f) => BLOCKING_VERIFIER_FLAGS.has(f as VerifierFlag));
}

/** Doğrulayıcıyı çalıştırır; asla fırlatmaz. */
export function runVerifier(verifier: AnyGameVerifier, input: VerifyInput): VerifierOutcome {
  const client = clampScore(input.clientScore, input.rules);
  const finish = (o: VerifierOutcome): VerifierOutcome => {
    const verifiedScore = clampScore(o.verifiedScore, input.rules);
    const flags = [...o.flags];
    if (verifiedScore !== Math.floor(Number.isFinite(input.clientScore) ? input.clientScore : 0)) {
      flags.push('score_mismatch');
    }
    return { verifiedScore, flags: uniq(flags), detail: o.detail };
  };

  if (input.proof === undefined || input.proof === null) {
    if (verifier.requireProof) return { verifiedScore: 0, flags: ['proof_missing'], detail: 'kanıt yok' };
    return { verifiedScore: client, flags: [] };
  }

  let size = 0;
  try {
    size = JSON.stringify(input.proof).length;
  } catch {
    return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'serileştirilemedi' };
  }
  if (size > MAX_PROOF_BYTES) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'kanıt çok büyük' };

  const parsed = verifier.proofSchema.safeParse(input.proof);
  if (!parsed.success) {
    return { verifiedScore: 0, flags: ['proof_invalid'], detail: parsed.error.issues[0]?.message ?? 'şema' };
  }

  try {
    switch (verifier.kind) {
      case 'classification': {
        const round = verifier.buildRound(input.seed, input.rules);
        return finish(verifier.score(round, parsed.data, input));
      }
      case 'deterministic':
        return finish(verifier.replay(input.seed, parsed.data, input));
      case 'action':
        return finish(verifier.check(parsed.data, input));
      default:
        return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'bilinmeyen doğrulayıcı' };
    }
  } catch (e) {
    return { verifiedScore: 0, flags: ['proof_invalid'], detail: e instanceof Error ? e.message.slice(0, 120) : 'hata' };
  }
}

/** `start` cevabındaki etiketsiz içerik (yalnız sınıflandırma ailesi; diğerlerinde null). */
export function rankedContentFor(
  verifier: AnyGameVerifier | null | undefined,
  seed: string,
  rules: VerifierRules
): PublicContentItem[] | null {
  if (!verifier || verifier.kind !== 'classification') return null;
  return verifier.buildRound(seed, rules).items;
}

/** Pratik turu (etiketli; ödülsüz). Sınıflandırma dışı ailelerde içerik yok. */
export function practiceContentFor(
  verifier: AnyGameVerifier | null | undefined,
  seed: string,
  rules: VerifierRules
): ClassificationRound | null {
  if (!verifier || verifier.kind !== 'classification') return null;
  return verifier.practiceRound(seed, rules);
}

// ───────────────────────────── Sınıflandırma ─────────────────────────────

export const classificationProofSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        verdict: z.string().min(1).max(64),
        /** Deneme başlangıcından (istemcinin `start` alışından) ms. */
        tMs: z.number().int().min(0).max(4 * 60 * 60 * 1000),
      })
    )
    .max(500),
});
export type ClassificationProof = z.infer<typeof classificationProofSchema>;

export interface ClassificationVerifierConfig {
  buildRound: (seed: string, rules: VerifierRules) => ClassificationRound;
  practiceRound: (seed: string, rules: VerifierRules) => ClassificationRound;
  /** İnsan için en kısa makul cevap aralığı (ms). Varsayılan 250. */
  minAnswerGapMs?: number;
  /** Bu kadar "insanüstü hızlı" cevap → implausible. Varsayılan 2. */
  maxFastAnswers?: number;
  /** Doğru cevap puanı (kombo vb.). Varsayılan: doğru = 1, yanlış = 0. */
  scoreAnswer?: (ctx: { correct: boolean; index: number; streak: number; tMs: number }) => number;
  requireProof?: boolean;
}

/** Standart sınıflandırma doğrulayıcısı: `{ answers: [{ id, verdict, tMs }] }`. */
export function classificationVerifier(cfg: ClassificationVerifierConfig): ClassificationVerifier<ClassificationProof> {
  const minGap = cfg.minAnswerGapMs ?? 250;
  const maxFast = cfg.maxFastAnswers ?? 2;
  const scoreAnswer = cfg.scoreAnswer ?? (({ correct }) => (correct ? 1 : 0));
  return {
    kind: 'classification',
    requireProof: cfg.requireProof !== false,
    proofSchema: classificationProofSchema,
    buildRound: cfg.buildRound,
    practiceRound: cfg.practiceRound,
    score(round, proof, input) {
      const seen = new Set<string>();
      let lastT = -1;
      let fast = 0;
      let score = 0;
      let streak = 0;
      const limitMs = input.serverElapsedSec * 1000 + VERIFY_CLOCK_SLACK_MS;
      for (let i = 0; i < proof.answers.length; i++) {
        const a = proof.answers[i];
        const truth = round.answerKey[a.id];
        if (truth === undefined || seen.has(a.id)) {
          return { verifiedScore: 0, flags: ['proof_invalid'], detail: `geçersiz/tekrarlı öğe ${a.id}` };
        }
        seen.add(a.id);
        if (a.tMs < lastT) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'zaman sırası bozuk' };
        if (a.tMs > limitMs) return { verifiedScore: 0, flags: ['implausible'], detail: 'cevap sunucu süresinden sonra' };
        if (lastT >= 0 && a.tMs - lastT < minGap) fast += 1;
        lastT = a.tMs;
        const correct = a.verdict === truth;
        streak = correct ? streak + 1 : 0;
        score += scoreAnswer({ correct, index: i, streak, tMs: a.tMs });
      }
      if (fast > maxFast) return { verifiedScore: 0, flags: ['implausible'], detail: `${fast} insanüstü hızlı cevap` };
      return { verifiedScore: score, flags: [] };
    },
  };
}

// ───────────────────────────── Deterministik ─────────────────────────────

export const deterministicProofSchema = z.object({
  /** Girdi kaydı (`record.ts`). */
  log: inputLogSchema,
  /** Oyunun bittiği toplam mantık adımı. */
  steps: z.number().int().min(0).max(60 * 60 * 60),
});
export type DeterministicProof = z.infer<typeof deterministicProofSchema>;

export interface SimulationResult {
  score: number;
  /** Kayıt kurallara aykırı (ör. bitmiş oyuna hamle, geçersiz hücre). */
  illegal?: boolean;
  detail?: string;
}

export interface DeterministicVerifierConfig {
  /** SAF simülasyon: istemci ile aynı `sim.ts`. Tohumlu RNG `createRng(seed)` kullanmalı. */
  simulate: (seed: string, log: InputLog, steps: number, rules: VerifierRules) => SimulationResult;
  /** Mantık frekansı (motor varsayılanı 60). */
  hz?: number;
  requireProof?: boolean;
}

export function deterministicVerifier(cfg: DeterministicVerifierConfig): DeterministicVerifier<DeterministicProof> {
  const hz = cfg.hz ?? 60;
  return {
    kind: 'deterministic',
    requireProof: cfg.requireProof !== false,
    proofSchema: deterministicProofSchema,
    replay(seed, proof, input) {
      const lastLogStep = proof.log.length ? proof.log[proof.log.length - 1][0] : 0;
      if (lastLogStep > proof.steps) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'kayıt oyun sonundan sonra' };
      // Simülasyon zamanı duvar saatini aşamaz (hızlandırılmış betik).
      const simMs = (proof.steps / hz) * 1000;
      if (simMs > input.serverElapsedSec * 1000 + VERIFY_CLOCK_SLACK_MS) {
        return { verifiedScore: 0, flags: ['implausible'], detail: 'simülasyon süresi > sunucu süresi' };
      }
      const r = cfg.simulate(seed, proof.log, proof.steps, input.rules);
      if (r.illegal) return { verifiedScore: 0, flags: ['proof_invalid'], detail: r.detail ?? 'kural dışı hamle' };
      return { verifiedScore: r.score, flags: [], detail: r.detail };
    },
  };
}

// ───────────────────────────── Aksiyon ─────────────────────────────

/** `[tMs, skor]` — oyun içinden periyodik (ör. 5 sn'de bir) + bitişte son nokta. */
export const actionProofSchema = z.object({
  checkpoints: z
    .array(z.tuple([z.number().int().min(0).max(4 * 60 * 60 * 1000), z.number().int().min(0).max(1_000_000)]))
    .min(1)
    .max(2_000),
});
export type ActionProof = z.infer<typeof actionProofSchema>;

export interface ActionVerifierConfig {
  /** Checkpoint aralığı üst sınırı (sn). İki nokta arası daha uzunsa iz eksik sayılır. Varsayılan 12. */
  maxGapSec?: number;
  /** Kısa pencerede izin verilen patlama (maxScorePerSec × bu katsayı). Varsayılan 3. */
  burstFactor?: number;
  /** Saniye başına skor tavanı (verilmezse `rules.maxScorePerSec`). */
  maxRatePerSec?: number;
  /** Skor düşebilir mi (ceza alan oyunlar). Varsayılan false. */
  allowDecrease?: boolean;
  requireProof?: boolean;
}

/**
 * Skor eğrisi makullüğü. Not: izi oyun SONUNDA gönderilir; gerçek zamanlı ping değildir.
 * Sunucu saatiyle karşılaştırma + parça parça hız sınırı betikle "anında tavan skor"u
 * engeller; ince ayar için admin oyun detayındaki dağılımlar kullanılır (F4.1).
 */
export function actionVerifier(cfg: ActionVerifierConfig = {}): ActionVerifier<ActionProof> {
  const maxGapMs = (cfg.maxGapSec ?? 12) * 1000;
  const burst = cfg.burstFactor ?? 3;
  return {
    kind: 'action',
    requireProof: cfg.requireProof !== false,
    proofSchema: actionProofSchema,
    check(proof, input) {
      const cps = proof.checkpoints;
      const rate = cfg.maxRatePerSec ?? input.rules.maxScorePerSec;
      const limitMs = input.serverElapsedSec * 1000 + VERIFY_CLOCK_SLACK_MS;
      let prevT = 0;
      let prevS = 0;
      for (let i = 0; i < cps.length; i++) {
        const [t, s] = cps[i];
        if (i > 0 && t <= prevT) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'checkpoint zamanı artmıyor' };
        if (t > limitMs) return { verifiedScore: 0, flags: ['implausible'], detail: 'checkpoint sunucu süresinden sonra' };
        if (!cfg.allowDecrease && s < prevS) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'skor geriledi' };
        if (t - prevT > maxGapMs + VERIFY_CLOCK_SLACK_MS) {
          return { verifiedScore: 0, flags: ['implausible'], detail: 'checkpoint izi eksik' };
        }
        if (typeof rate === 'number' && rate > 0) {
          const dtSec = Math.max(1, (t - prevT) / 1000);
          if (s - prevS > rate * burst * dtSec) {
            return { verifiedScore: 0, flags: ['implausible'], detail: 'kısa pencerede aşırı skor' };
          }
        }
        prevT = t;
        prevS = s;
      }
      // Son nokta oyun sonu skoru; istemci beyanı bunu aşamaz.
      const last = cps[cps.length - 1][1];
      return { verifiedScore: Math.min(last, Math.max(0, Math.floor(input.clientScore))), flags: [] };
    },
  };
}
