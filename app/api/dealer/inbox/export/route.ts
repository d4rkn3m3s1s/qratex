/**
 * GET /api/dealer/inbox/export — filtrelenmiş Gelen Kutusu'nun TAMAMI (en fazla 5000 satır)
 * CSV olarak (yalnız ekrandaki sayfa değil). Hücreler formül enjeksiyonuna karşı korunur,
 * tarihler Europe/Istanbul. Kesildiyse `X-Export-Truncated: true`.
 */
import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { collectInboxExport } from '@/lib/dealer-inbox/server';
import { normalizeInboxFilters, toCsv } from '@/lib/dealer-inbox/core';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z
  .object({
    source: z.string().max(16).optional(),
    status: z.string().max(16).optional(),
    rating: z.string().max(4).optional(),
    sentiment: z.string().max(16).optional(),
    signal: z.string().max(16).optional(),
    assigned: z.string().max(16).optional(),
    range: z.string().max(4).optional(),
    qr: z.string().max(64).optional(),
    q: z.string().max(200).optional(),
    sort: z.string().max(16).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .passthrough();

const STATUS_TR = { new: 'Yeni', replied: 'Yanıtlandı', resolved: 'Çözüldü' } as const;
const SENTIMENT_TR = { positive: 'Olumlu', neutral: 'Nötr', negative: 'Olumsuz', pending: 'Analiz bekliyor' } as const;
const SOURCE_TR = { qr: 'QR geri bildirimi', consumption: 'Tüketim yorumu' } as const;

function istanbulStamp(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const GET = defineRoute(
  {
    name: 'dealer.inbox.export',
    // Toplu dışa aktarım yalnız işletme sahibi (ve kapıdan geçmiş yönetici): personel tek tek
    // kayıtları görebilir ama müşteri adlı 5000 satırlık dökümü indiremez — müşteri, işlem ve
    // katalog dışa aktarımlarıyla aynı kural (guvenlik-bayi-api Y4, KVKK veri minimizasyonu).
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    query: querySchema,
  },
  async ({ query, tenant, user }) => {
    const filters = normalizeInboxFilters(query as Record<string, unknown>);
    const { items, truncated } = await collectInboxExport(tenant.dealerId, user.id, filters);
    const csv = toCsv(
      ['Kaynak', 'Tarih', 'Puan', 'Duygu', 'Durum', 'Müşteri', 'QR / Ürün', 'Yorum', 'Yanıt tarihi', 'Atanan', 'Telafi'],
      items.map((i) => [
        SOURCE_TR[i.source],
        istanbulStamp(i.createdAt),
        i.rating,
        SENTIMENT_TR[i.sentiment],
        STATUS_TR[i.status],
        i.anonymous ? 'Anonim' : i.customerName ?? '',
        i.contextLabel ?? '',
        i.textPreview ?? '',
        istanbulStamp(i.repliedAt),
        i.case?.assignee?.name ?? '',
        i.remedyStatus ?? '',
      ])
    );
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    return new Response(csv, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="gelen-kutusu-${day}.csv"`,
        'x-export-truncated': truncated ? 'true' : 'false',
        'x-export-rows': String(items.length),
      },
    });
  }
);
