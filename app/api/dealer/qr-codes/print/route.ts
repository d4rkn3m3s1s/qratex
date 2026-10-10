/**
 * GET /api/dealer/qr-codes/print?ids=a,b&template=card|tent|sticker|plain&format=pdf|svg&fg=&bg=&cta=&link=
 * Sunucuda üretilen baskı çıktısı (masa kartı, katlanır masa standı, sticker, düz QR).
 * `?download=1` → indirilir; aksi hâlde satır içi (önizleme <img>).
 */
import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { renderPrint } from '@/lib/dealer/qr-codes/print.server';
import { printQuerySchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

const query = printQuerySchema.extend({ download: z.enum(['1', '0']).optional() });

export const GET = defineRoute(
  {
    name: 'dealer.qr-codes.print',
    roles: ['DEALER'],
    tenant: 'dealer',
    query,
    // Liste küçük resimleri de bu uçtan gelir (sayfa başına 24) → okuma tavanı.
    rateLimit: { max: 300, windowMs: 60_000, by: 'user' },
  },
  async ({ tenant, query: q }) => {
    const out = await renderPrint(tenant.dealerId, q);
    const body = typeof out.body === 'string' ? out.body : new Blob([out.body as BlobPart], { type: out.contentType });
    return new Response(body, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        // Satır içi SVG (küçük resim/önizleme) içerik olarak değişmez (kod sabit) → kısa özel önbellek.
        ...(q.format === 'svg' && q.download !== '1' ? { 'Cache-Control': 'private, max-age=300' } : {}),
        'Content-Type': out.contentType,
        'Content-Disposition': `${q.download === '1' ? 'attachment' : 'inline'}; filename="${out.filename}"`,
        'X-Content-Type-Options': 'nosniff',
        // Doğrudan açılan SVG'de betik çalışmasın (çıktı zaten betiksiz; derinlemesine savunma).
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }
);
