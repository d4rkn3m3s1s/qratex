/**
 * GET /api/admin/cards/print?batch=<id>&page=<n> — partinin BASKI SAYFASI (bağımsız HTML).
 *
 * Matbaa / ofis yazıcısı için A4 ızgara: her hücrede QR (SVG, sunucuda üretilir), sıra no ve
 * okunur kod; kesim çizgileri kesikli. Tarayıcının "PDF olarak kaydet"iyle baskı PDF'i alınır.
 * Sayfa başına en çok 120 kart; büyük partiler sayfa bağlantılarıyla bölünür. Her açılış
 * denetime `CARDS_PRINTED` olarak yazılır (token listesi hassastır).
 */
import { z } from 'zod';
import QRCode from 'qrcode';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PRINT_PAGE_SIZE } from '@/lib/admin-cards/contract';
import { printBatchPage, recordBatchExport, routeActor } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const group = (t: string) => t.replace(/(.{4})(?=.)/g, '$1 ');

export const GET = defineRoute(
  {
    name: 'admin.cards.print',
    roles: ['ADMIN'],
    query: z.object({ batch: z.string().min(1).max(64), page: z.coerce.number().int().min(1).max(1000).default(1) }),
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ query, session, request, requestId }) => {
    const data = await printBatchPage(query.batch, query.page, PRINT_PAGE_SIZE);
    if (!data) throw new ApiError('NOT_FOUND', 'Parti bulunamadı.');
    const svgs = await Promise.all(
      data.cards.map((c) => QRCode.toString(c.url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000000', light: '#ffffff' } }))
    );
    await recordBatchExport('CARDS_PRINTED', data.batch.id, data.cards.length, { page: data.page }, routeActor(session), getAuditRequestMeta(request));

    const cells = data.cards
      .map(
        (c, i) => `<figure class="cell"><div class="qr" role="img" aria-label="Kart ${c.seq} QR kodu">${svgs[i]}</div><figcaption><b>#${c.seq}</b><code>${esc(group(c.token))}</code></figcaption></figure>`
      )
      .join('');
    const nav = Array.from({ length: data.pageCount }, (_, i) => i + 1)
      .map((p) =>
        p === data.page
          ? `<span aria-current="page">${p}</span>`
          : `<a href="?batch=${encodeURIComponent(data.batch.id)}&amp;page=${p}">${p}</a>`
      )
      .join(' ');
    const from = data.cards[0]?.seq ?? 0;
    const to = data.cards[data.cards.length - 1]?.seq ?? 0;

    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Baskı · ${esc(data.batch.name)} · ${data.page}/${data.pageCount}</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;background:#f4f4f5}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px;background:#fff;border-bottom:1px solid #ddd}
h1{font-size:18px;margin:0}p{margin:4px 0 0;color:#444}nav{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
nav a,nav span,button{display:inline-flex;min-width:44px;min-height:44px;align-items:center;justify-content:center;border:1px solid #ccc;border-radius:8px;padding:0 12px;color:#111;text-decoration:none;background:#fff;font:inherit;cursor:pointer}
nav span{background:#111;color:#fff;border-color:#111}button{background:#111;color:#fff;border-color:#111}
a:focus-visible,button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(42mm,1fr));gap:0;padding:16px;background:#fff;margin:16px;max-width:210mm}
.cell{margin:0;padding:3mm;border:1px dashed #999;display:flex;flex-direction:column;align-items:center;break-inside:avoid;page-break-inside:avoid}
.qr{width:34mm;height:34mm}.qr svg{width:100%;height:100%;display:block}
figcaption{margin-top:1.5mm;text-align:center;font-size:8pt;line-height:1.25}figcaption b{display:block}figcaption code{font:8pt ui-monospace,Consolas,monospace;word-break:break-all}
@page{size:A4;margin:8mm}
@media print{header{display:none}body{background:#fff}main{margin:0;padding:0;max-width:none;grid-template-columns:repeat(4,1fr)}}
</style></head><body>
<header><div><h1>${esc(data.batch.name)}</h1><p>Kart ${from}–${to} / ${data.total} · sayfa ${data.page}/${data.pageCount} · kesikli çizgiler kesim yerleridir</p></div>
<nav aria-label="Baskı sayfaları">${nav}<button type="button" onclick="window.print()">Yazdır / PDF</button></nav></header>
<main>${cells || '<p>Bu partide basılacak (arşivlenmemiş) kart yok.</p>'}</main></body></html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/html; charset=utf-8',
        'x-request-id': requestId,
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'x-robots-tag': 'noindex',
      },
    });
  }
);
