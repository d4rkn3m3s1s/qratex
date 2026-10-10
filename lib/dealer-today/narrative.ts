/**
 * Haftalık rapor AI anlatısı — "sayıyı kod hesaplar, LLM anlatır" (§4.4/7).
 *
 * - Üretim YALNIZ POST ucundan (kullanıcı ister), mevcut AI geçidi `runChatCompletion` ile:
 *   bayi AI ana anahtarı, dakikalık + günlük token tavanı, prompt-injection denetimi ve
 *   kullanım kaydı oradan gelir. GET hiçbir zaman LLM çağırmaz; yalnız önbelleği okur.
 * - LLM'e yalnız deterministik toplamlar ve tema etiketleri gider; müşteri metni/kimliği GİTMEZ.
 * - Çıktı düz metindir (React kaçışlı gösterir), uzunluğu sınırlıdır.
 * - Eski operations-brief panelindeki uydurma "Genel Performans Skoru", trend ve "sonraki
 *   dönem tahmini" bu tasarımda yoktur (dealer_operations-brief.md Bulgu 2).
 */
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { getModuleControls } from '@/lib/module-gate';
import { isAIConfigured, runChatCompletion } from '@/lib/ai-engine';
import { isDealerAiEnabled } from '@/lib/ai-policy';
import type { WeeklyNarrative, WeeklyReport } from './types';

export const narrativeKey = (dealerId: string, week: string) => `dealer-today:narrative:v1:${dealerId}:${week}`;

const COMPLETE_TTL_SECONDS = 60 * 24 * 3600;
const OPEN_WEEK_TTL_SECONDS = 6 * 3600;
const MAX_CHARS = 1200;

export class NarrativeUnavailableError extends Error {
  constructor(message = 'AI anlatısı şu an üretilemiyor.') {
    super(message);
    this.name = 'NarrativeUnavailableError';
  }
}

export async function readNarrative(dealerId: string, week: string): Promise<{ text: string; generatedAt: string } | null> {
  const hit = await redisGetJson<{ text?: unknown; generatedAt?: unknown }>(narrativeKey(dealerId, week));
  if (!hit || typeof hit.text !== 'string' || typeof hit.generatedAt !== 'string') return null;
  return { text: hit.text, generatedAt: hit.generatedAt };
}

/** Modül + sağlayıcı + bayinin AI ana anahtarı (fail-closed). */
export async function isNarrativeAvailable(dealerId: string): Promise<boolean> {
  if (!isAIConfigured()) return false;
  try {
    const controls = (await getModuleControls()) as Record<string, boolean | undefined>;
    if (controls.ai_features === false) return false;
    return await isDealerAiEnabled(dealerId);
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = `Sen bir kafe/restoran işletmesine haftalık müşteri deneyimi özeti yazan bir asistansın.
Kurallar:
- YALNIZ sana verilen sayıları ve tema adlarını kullan. Yeni sayı, yüzde, tahmin ya da skor UYDURMA.
- Veri az ise (geri bildirim sayısı 5'ten azsa) bunu açıkça söyle, kesin yargıdan kaçın.
- 3-4 kısa cümle yaz, Türkçe, düz metin; madde işareti, başlık, emoji, markdown kullanma.
- Son cümle işletmenin bu hafta yapabileceği TEK somut öneri olsun.`;

function metricLine(label: string, m: { value: number | null; delta?: { value: number } | null }, unit = ''): string {
  const v = m.value == null ? 'veri yok' : `${m.value}${unit}`;
  const d = m.delta ? ` (önceki haftaya göre ${m.delta.value > 0 ? '+' : ''}${m.delta.value})` : '';
  return `${label}: ${v}${d}`;
}

export function buildNarrativePrompt(r: WeeklyReport): string {
  const lines = [
    `Hafta: ${r.week} – ${r.weekEnd}${r.isComplete ? '' : ' (hafta henüz bitmedi)'}`,
    metricLine('Geri bildirim sayısı', r.metrics.feedback),
    metricLine('Ortalama puan (5 üzerinden)', r.metrics.avgRating),
    metricLine('Olumsuz oranı (1-2 yıldız, %)', r.metrics.negativeRate),
    metricLine('Yanıtlanma oranı (%)', r.metrics.responseRate),
    metricLine('İşlem (tüketim) sayısı', r.metrics.consumptions),
    `Kanal: QR ${r.sources.qr}, tüketim yorumu ${r.sources.consumption}`,
    r.themes.length
      ? `Temalar: ${r.themes
          .map((t) => `${t.label} (${t.count} kez; olumlu ${t.positive}, olumsuz ${t.negative}; önceki hafta ${t.prevCount})`)
          .join('; ')}`
      : 'Temalar: bu hafta tema analizi yok',
  ];
  return lines.join('\n');
}

export function sanitizeNarrative(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[*_#`>]+/g, '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

/** Anlatıyı üretir ve önbelleğe yazar. `force` yoksa önbellekteki döner. */
export async function generateNarrative(dealerId: string, report: WeeklyReport, opts: { force?: boolean } = {}): Promise<WeeklyNarrative> {
  if (!opts.force) {
    const cached = await readNarrative(dealerId, report.week);
    if (cached) return { week: report.week, ...cached, cached: true };
  }
  if (!(await isNarrativeAvailable(dealerId))) throw new NarrativeUnavailableError('AI özellikleri bu işletme için kapalı.');
  const result = await runChatCompletion({
    system: SYSTEM_PROMPT,
    user: buildNarrativePrompt(report),
    dealerId,
    task: 'insights',
    temperature: 0.3,
    maxTokens: 350,
  });
  const text = result ? sanitizeNarrative(result.content) : '';
  if (!text) throw new NarrativeUnavailableError();
  const generatedAt = new Date().toISOString();
  await redisSetJson(narrativeKey(dealerId, report.week), { text, generatedAt }, report.isComplete ? COMPLETE_TTL_SECONDS : OPEN_WEEK_TTL_SECONDS);
  return { week: report.week, text, generatedAt, cached: false };
}
