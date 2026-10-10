/**
 * Olay (incident) otomatik tetikleme — geriye uyumlu giriş noktası.
 *
 * Tespit artık `lib/dealer-queues/radar.ts`'tedir (SQL toplamları, bayi eşikleri, tekillik
 * kilidi, bildirim). Eski davranıştaki kusurlar orada kapandı: GET yan etkisi (artık yalnız
 * olay güdümlü / günlük bakım / açık POST), 14 günlük yorumların belleğe çekilmesi, 7 günde bir
 * kopya vaka üretimi ve çözülen vakanın anında yeniden açılması.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runIncidentRadarForDealer } from '@/lib/dealer-queues/radar';

export type IncidentType = 'rating_drop' | 'nps_drop' | 'complaint_spike' | 'negative_spike' | 'other';

/** Eşik aşımı varsa (tekil) sistem vakası açar. Okuma yollarından ÇAĞRILMAZ. */
export async function runIncidentDetection(dealerId: string): Promise<{ created: string[] }> {
  const res = await runIncidentRadarForDealer(dealerId, { trigger: 'event' });
  return { created: res.created.map((c) => c.type) };
}

/**
 * Eskiden sayfa boş kalmasın diye her yeni bayiye yazılan SAHTE "demo olay"ın birebir imzası
 * (D11 / P0-14). Bu kayıt gerçek `Incident` olarak kalıcı yazılıyor, arayüzde kapatılamıyor ve
 * Copilot / sabah brifingi / admin sağlık skoru / AI aksiyon bağlamındaki "açık olay"
 * sayaçlarını kirletiyordu. Artık hiç yazılmıyor; boş durum arayüzde gösterilir.
 */
export const LEGACY_DEMO_INCIDENT = {
  type: 'other',
  severity: 'low',
  title: 'Olaylar / Kriz Radarı',
  description:
    'Eşik aşımında (puan düşüşü, şikayet artışı, yüksek aciliyet) otomatik olaylar burada listelenir. Manuel olay da ekleyebilirsiniz.',
} as const;

/**
 * Eski sahte demo olay kayıtlarını siler (kendini onaran tek seferlik temizlik). Yalnız tam
 * imza eşleşmesi (tip + önem + başlık + açıklama) ve kimseye atanmamış, metadata'sız kayıtlar
 * silinir → bayinin elle girdiği gerçek bir olay asla etkilenmez. İdempotenttir.
 * `dealerId` verilmezse platform genelinde çalışır (bakım işi için).
 */
export async function purgeLegacyDemoIncidents(dealerId?: string): Promise<number> {
  const res = await prisma.incident.deleteMany({
    where: {
      ...(dealerId ? { dealerId } : {}),
      type: LEGACY_DEMO_INCIDENT.type,
      severity: LEGACY_DEMO_INCIDENT.severity,
      title: LEGACY_DEMO_INCIDENT.title,
      description: LEGACY_DEMO_INCIDENT.description,
      assignedToId: null,
      thresholdValue: null,
      metadata: { equals: Prisma.DbNull },
    },
  });
  return res.count;
}
