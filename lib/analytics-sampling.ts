/**
 * Analytics sampling (P2-20 item 18).
 * Büyük date range (>90 gün) için otomatik sampling.
 */
import { parseOpenUnitFloatEnv, parsePositiveIntEnv } from '@/lib/safe-env-number';

const SAMPLE_THRESHOLD_DAYS = parsePositiveIntEnv(process.env.ANALYTICS_SAMPLE_THRESHOLD, 90);
const SAMPLE_RATIO = parseOpenUnitFloatEnv(process.env.ANALYTICS_SAMPLE_RATIO, 0.1);

export interface SamplingConfig {
  sampleRatio: number;
  maxTake?: number;
  note?: string;
}

export function getSamplingConfig(startDate: Date, endDate: Date): SamplingConfig {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= SAMPLE_THRESHOLD_DAYS) {
    return { sampleRatio: 1 };
  }
  return {
    sampleRatio: SAMPLE_RATIO,
    maxTake: Math.ceil(10000 * SAMPLE_RATIO),
    note: `${days} günlük aralık için örnekleme uygulandı (${SAMPLE_RATIO * 100}%)`,
  };
}
