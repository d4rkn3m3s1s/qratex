/**
 * Girdi kaydı (replay için) — deterministik oyunlarda sunucu, `start`'taki tohum + bu
 * kayıtla oyunu yeniden oynatıp skoru KENDİSİ hesaplar (oyun-ekosistemi K1.2).
 *
 * Biçim (sıkı, JSON'a uygun): `[adım, kod, a?, b?]`
 *   adım → `loop.step` (sabit 60 Hz mantık adımı; duvar saati değil)
 *   kod  → eylem kodu (`ACTION_CODE`) ya da oyuna özel kod (≥ 16)
 *   a, b → isteğe bağlı sayısal yük (ör. mantıksal x/y, hücre indeksi)
 *
 * Kayıt adım sırasına göre AZALMAYAN olmalıdır; sunucu şeması bunu doğrular.
 */
import { z } from 'zod';
import type { GameAction } from './input';

export type InputLogEntry = [step: number, code: number, a?: number, b?: number];
export type InputLog = InputLogEntry[];

/** Standart eylem kodları (0–15 ayrılmış). Oyuna özel kodlar 16'dan başlar. */
export const ACTION_CODE: Readonly<Record<GameAction, number>> = {
  up: 1,
  down: 2,
  left: 3,
  right: 4,
  primary: 5,
  secondary: 6,
  pause: 7,
};
export const CUSTOM_CODE_BASE = 16;

/** Bir replay kaydının üst sınırı (gövde boyutu ve sunucu CPU bütçesi). */
export const MAX_INPUT_LOG_ENTRIES = 20_000;
/** En uzun oyun ≈ 60 dk × 60 Hz. */
export const MAX_REPLAY_STEPS = 60 * 60 * 60;

const stepZ = z.number().int().min(0).max(MAX_REPLAY_STEPS);
const codeZ = z.number().int().min(0).max(65_535);
const argZ = z.number().finite().min(-1_000_000).max(1_000_000);

export const inputLogEntrySchema = z.union([
  z.tuple([stepZ, codeZ]),
  z.tuple([stepZ, codeZ, argZ]),
  z.tuple([stepZ, codeZ, argZ, argZ]),
]);

/** Sunucu doğrulayıcılarının kullandığı şema (adım sırası azalmayan). */
export const inputLogSchema = z
  .array(inputLogEntrySchema)
  .max(MAX_INPUT_LOG_ENTRIES)
  .refine(
    (log) => {
      for (let i = 1; i < log.length; i++) if (log[i][0] < log[i - 1][0]) return false;
      return true;
    },
    { message: 'Girdi kaydı adım sırasına göre artan olmalı' }
  );

export interface InputRecorder {
  /** Olay ekle. Sınır aşılırsa false (kayıt bozuk sayılır; oyun yine oynanır). */
  record(step: number, code: number, a?: number, b?: number): boolean;
  /** Eylem kısayolu. */
  recordAction(step: number, action: GameAction, a?: number, b?: number): boolean;
  entries(): InputLog;
  readonly size: number;
  /** Sınır aşıldı mı (taşma → sunucu kanıtı reddeder; skor plausibility'ye düşmez). */
  readonly overflowed: boolean;
  clear(): void;
}

/** Sayıyı kayıt için sıkıştırır (2 ondalık; JSON boyutu). */
function compact(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return Math.round(n * 100) / 100;
}

export function createInputRecorder(maxEntries = MAX_INPUT_LOG_ENTRIES): InputRecorder {
  let log: InputLog = [];
  let lastStep = 0;
  let overflowed = false;
  const rec: InputRecorder = {
    record(step, code, a, b) {
      if (log.length >= maxEntries) {
        overflowed = true;
        return false;
      }
      const s = Math.max(lastStep, Math.max(0, Math.floor(step)));
      lastStep = s;
      const ca = compact(a);
      const cb = compact(b);
      if (cb !== undefined) log.push([s, code, ca ?? 0, cb]);
      else if (ca !== undefined) log.push([s, code, ca]);
      else log.push([s, code]);
      return true;
    },
    recordAction(step, action, a, b) {
      return rec.record(step, ACTION_CODE[action], a, b);
    },
    entries() {
      return log.slice();
    },
    get size() {
      return log.length;
    },
    get overflowed() {
      return overflowed;
    },
    clear() {
      log = [];
      lastStep = 0;
      overflowed = false;
    },
  };
  return rec;
}
