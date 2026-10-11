/**
 * Otomasyon › Uyarı kuralları — kriz radarı eşiklerinin form/BFF şeması (saf).
 * Aralıklar `lib/dealer-queues/radar-rules.ts` → `parseRadarRules` ile birebir aynıdır;
 * sunucu okurken yine kırpar (iki katmanlı savunma).
 */
import { z } from 'zod';

const n = (label: string, min: number, max: number, int = true) => {
  let s = z.number({ invalid_type_error: `${label} bir sayı olmalı.` }).min(min, `${label} en az ${min} olmalı.`).max(max, `${label} en fazla ${max} olabilir.`);
  if (int) s = s.int(`${label} tam sayı olmalı.`);
  return s;
};

export const alertRulesSchema = z.object({
  ratingDrop: z.object({
    enabled: z.boolean(),
    minDrop: n('Düşüş eşiği', 0.1, 4, false),
    minSample: n('En az yorum', 1, 500),
  }),
  complaintSpike: z.object({
    enabled: z.boolean(),
    count: n('Olumsuz yorum sayısı', 1, 500),
    windowHours: n('Zaman penceresi', 1, 168),
  }),
  urgentToxic: z.object({
    enabled: z.boolean(),
    minUrgency: n('Aciliyet eşiği', 0.1, 1, false),
  }),
  unansweredNegative: z.object({
    enabled: z.boolean(),
    slaHours: n('Yanıt süresi', 1, 336),
    count: n('Yanıtsız yorum sayısı', 1, 500),
  }),
});

export type AlertRulesInput = z.infer<typeof alertRulesSchema>;
