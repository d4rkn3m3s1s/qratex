/**
 * Telafi otomasyonu ayarı — saf sözleşme (istemci formu, BFF, çekirdek motor ortak).
 *
 * Kapanan denetim bulguları (dealer_remedy-automation.md):
 *  - 2: tüm sayılar TAM SAYI (`.int()`); okumada `Math.trunc` + kırpma — eski bozuk kayıtlar
 *       (ör. `maxPerRun = 2.5`) taramayı artık 500'e düşüremez.
 *  - 6: puan eşiği 1–3 (5 yıldızlı memnun müşteriye telafi üretilemez); mesaj en az 10 karakter.
 *  - 7: ayrıştırıcı ve varsayılanlar TEK kaynak (eskiden 3 kopya).
 *  - 10: varsayılan mesaj sunucudan gelir ve tek dildir; müşteri adı/işletme değişkenleri.
 *  - Bulgu 21 + eksik özellik 3: churn eşiği ayarlanabilir; müşteri başına bekleme süresi.
 */
import { z } from 'zod';

export interface RemedyAutomationConfig {
  enabled: boolean;
  /** Bu puan VE ALTI tetikler (1–3). Alan adı eski kayıtlarla uyum için korunur. */
  minRating: number;
  /** Tek taramada kuyruğa eklenecek en fazla taslak. */
  maxPerRun: number;
  /** Ay başına (Europe/Istanbul) en fazla OTOMATİK taslak. */
  maxMonthlyAuto: number;
  messageTemplate: string;
  /** Yüksek kayıp riski tetiği (AI analizi gerekir). */
  churnEnabled: boolean;
  /** 0,50–0,95 */
  churnThreshold: number;
  /** Aynı müşteriye bu kadar gün içinde ikinci otomatik telafi taslağı üretilmez (0 = kapalı). */
  cooldownDays: number;
}

export const REMEDY_LIMITS = {
  minRating: { min: 1, max: 3 },
  maxPerRun: { min: 1, max: 25 },
  maxMonthlyAuto: { min: 1, max: 500 },
  message: { min: 10, max: 500 },
  churnThreshold: { min: 0.5, max: 0.95 },
  cooldownDays: { min: 0, max: 90 },
} as const;

export const DEFAULT_REMEDY_MESSAGE =
  'Merhaba {{musteri}}, yaşadığınız deneyim için özür dileriz. {{isletme}} olarak telafi etmek istiyoruz; aşağıdan size uygun seçeneği seçin.';

export const DEFAULT_REMEDY_AUTOMATION: RemedyAutomationConfig = {
  enabled: false,
  minRating: 2,
  maxPerRun: 5,
  maxMonthlyAuto: 40,
  messageTemplate: DEFAULT_REMEDY_MESSAGE,
  churnEnabled: true,
  churnThreshold: 0.7,
  cooldownDays: 30,
};

function intIn(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function numIn(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
}

/** Saklanan Json'u güvenli ayara indirger (eksik/bozuk → varsayılan, aralık dışı → kırpılır). */
export function parseRemedyAutomationConfig(raw: unknown): RemedyAutomationConfig {
  const d = DEFAULT_REMEDY_AUTOMATION;
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const L = REMEDY_LIMITS;
  const msg = typeof o.messageTemplate === 'string' ? o.messageTemplate.trim().slice(0, L.message.max) : '';
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    minRating: intIn(o.minRating, d.minRating, L.minRating.min, L.minRating.max),
    maxPerRun: intIn(o.maxPerRun, d.maxPerRun, L.maxPerRun.min, L.maxPerRun.max),
    maxMonthlyAuto: intIn(o.maxMonthlyAuto, d.maxMonthlyAuto, L.maxMonthlyAuto.min, L.maxMonthlyAuto.max),
    messageTemplate: msg.length >= L.message.min ? msg : d.messageTemplate,
    churnEnabled: typeof o.churnEnabled === 'boolean' ? o.churnEnabled : d.churnEnabled,
    churnThreshold: numIn(o.churnThreshold, d.churnThreshold, L.churnThreshold.min, L.churnThreshold.max),
    cooldownDays: intIn(o.cooldownDays, d.cooldownDays, L.cooldownDays.min, L.cooldownDays.max),
  };
}

const L = REMEDY_LIMITS;
const int = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${label} bir sayı olmalı.` })
    .int(`${label} tam sayı olmalı.`)
    .min(min, `${label} en az ${min} olmalı.`)
    .max(max, `${label} en fazla ${max} olabilir.`);

export const remedyConfigSchema = z.object({
  enabled: z.boolean(),
  minRating: int('Puan eşiği', L.minRating.min, L.minRating.max),
  maxPerRun: int('Tarama başına taslak', L.maxPerRun.min, L.maxPerRun.max),
  maxMonthlyAuto: int('Aylık üst sınır', L.maxMonthlyAuto.min, L.maxMonthlyAuto.max),
  messageTemplate: z
    .string()
    .trim()
    .min(L.message.min, `Mesaj en az ${L.message.min} karakter olmalı.`)
    .max(L.message.max, `Mesaj en fazla ${L.message.max} karakter olabilir.`),
  churnEnabled: z.boolean(),
  churnThreshold: z
    .number({ invalid_type_error: 'Risk eşiği bir sayı olmalı.' })
    .min(L.churnThreshold.min, 'Risk eşiği en az %50 olmalı.')
    .max(L.churnThreshold.max, 'Risk eşiği en fazla %95 olabilir.'),
  cooldownDays: int('Bekleme süresi', L.cooldownDays.min, L.cooldownDays.max),
});

export const remedyScanSchema = z.object({ dryRun: z.boolean().default(true) });

/** Müşteriye giden telafi mesajını doldurur (`{{musteri}}`, `{{isletme}}`). */
export function renderRemedyMessage(template: string, vars: { musteri?: string | null; isletme?: string | null }): string {
  const first = (vars.musteri ?? '').trim().split(/\s+/)[0] ?? '';
  return template
    .replace(/\{\{\s*musteri\s*\}\}/gi, first || 'değerli misafirimiz')
    .replace(/\{\{\s*isletme\s*\}\}/gi, (vars.isletme ?? '').trim() || 'işletmemiz')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Tetik kararı (saf): düşük puan ya da (açıksa) yüksek kayıp riski. */
export function remedyTrigger(
  cfg: Pick<RemedyAutomationConfig, 'minRating' | 'churnEnabled' | 'churnThreshold'>,
  rating: number | null,
  churnRisk: number | null | undefined
): 'low_rating' | 'high_churn' | null {
  if (rating != null && rating <= cfg.minRating) return 'low_rating';
  if (cfg.churnEnabled && typeof churnRisk === 'number' && churnRisk >= cfg.churnThreshold) return 'high_churn';
  return null;
}

/** Ay başı (Europe/Istanbul, UTC+3 sabit) — eskiden tarama yerel saat, çekirdek UTC kullanıyordu. */
export function istanbulMonthStart(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  return new Date(Date.UTC(y, m - 1, 1, -3, 0, 0, 0));
}
