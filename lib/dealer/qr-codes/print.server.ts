/**
 * Baskı çıktısı (sunucu): seçili QR'lar → SVG (tek kod) ya da çok sayfalı PDF.
 * Önizleme de bu uçtan gelir (SVG) → ekranda görülen = indirilen = basılan (rapor #46, Bulgu 8).
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { qrMatrix } from './matrix';
import { buildPrintPage, renderSvg, type PrintPage } from './print-layout';
import { renderPdf } from './pdf';
import { buildLinkUrl, checkPrintColors, fileSlug, linksFromSegmentConfig, type PrintQuery } from './rules';
import { buildQrTargetUrl, siteHost } from './load.server';

export interface PrintResult {
  body: Uint8Array | string;
  contentType: string;
  filename: string;
}

export async function renderPrint(dealerId: string, q: PrintQuery): Promise<PrintResult> {
  const verdict = checkPrintColors(q.fg, q.bg);
  if (!verdict.ok) {
    throw new ApiError(
      'VALIDATION',
      verdict.reason === 'inverted'
        ? 'QR koyu renkte, zemin açık renkte olmalı; ters renkleri birçok okuyucu tanımaz.'
        : `Renk kontrastı çok düşük (${verdict.ratio.toFixed(1)}:1). En az 4,5:1 olmalı.`,
      { details: [{ path: 'fg', message: 'Okunabilirlik' }] }
    );
  }
  if (q.format === 'svg' && q.ids.length > 1) {
    throw new ApiError('VALIDATION', 'SVG tek kod içindir; birden çok kod için PDF seçin.');
  }
  const [rows, dealer] = await Promise.all([
    prisma.qRCode.findMany({
      where: { id: { in: q.ids }, dealerId },
      select: { id: true, code: true, name: true, revokedAt: true, archivedAt: true, segmentConfig: true },
    }),
    prisma.user.findUnique({ where: { id: dealerId }, select: { businessName: true, name: true } }),
  ]);
  if (rows.length !== q.ids.length) throw new ApiError('NOT_FOUND', 'Seçili kodlardan biri bulunamadı.');
  const dead = rows.filter((r) => r.revokedAt || r.archivedAt);
  if (dead.length > 0) {
    throw new ApiError('CONFLICT', `İptal edilmiş ya da arşivlenmiş kod basılamaz: ${dead.map((d) => d.name).join(', ')}`);
  }
  if (q.link) {
    const missing = rows.filter((r) => !linksFromSegmentConfig(r.segmentConfig).some((l) => l.key === q.link));
    if (missing.length > 0) throw new ApiError('VALIDATION', 'Seçili karşılama bağlantısı bu kodda tanımlı değil.');
  }
  const businessName = (dealer?.businessName || dealer?.name || 'İşletmemiz').trim();
  const host = siteHost();
  const order = new Map(q.ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const pages: PrintPage[] = rows.map((r) => {
    const url = buildLinkUrl(buildQrTargetUrl(r.code), { segment: q.link ?? null });
    const spotName = r.name.trim() && r.name.trim().toLocaleLowerCase('tr') !== businessName.toLocaleLowerCase('tr') ? r.name.trim() : null;
    return buildPrintPage({
      template: q.template,
      matrix: qrMatrix(url),
      businessName,
      spotName,
      code: r.code,
      host,
      style: { fg: q.fg.toUpperCase(), bg: q.bg.toUpperCase(), cta: q.cta ?? '' },
    });
  });

  const base = rows.length === 1 ? `qr-${fileSlug(rows[0].name)}-${q.template}` : `qr-kodlar-${rows.length}-${q.template}`;
  if (q.format === 'svg') {
    return { body: renderSvg(pages[0]), contentType: 'image/svg+xml; charset=utf-8', filename: `${base}.svg` };
  }
  return {
    body: renderPdf(pages, { title: rows.length === 1 ? pages[0].title : `${businessName} QR kodları` }),
    contentType: 'application/pdf',
    filename: `${base}.pdf`,
  };
}
