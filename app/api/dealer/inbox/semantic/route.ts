/**
 * POST /api/dealer/inbox/semantic — "anlamca ara": serbest metne anlamca benzeyen QR geri
 * bildirimleri (embedding kosinüs benzerliği; anahtar kelime değil). "soğuk yemek" → tema.
 *
 *   { query: string (2..200) }  →  { results: [{ key, score, rating, textPreview, createdAt, sentiment }] }
 *
 * Kapsam: çözülmüş bayi (STAFF aktifliği DB'den); sonuç satırları ayrıca `qrCode.dealerId` ile
 * süzülür ve moderasyonla kaldırılanlar dışlanır. Dış embedding çağrısı → `ai` hız sınırı.
 * Eski `POST /api/dealer/feedbacks/search` ucunun yerine (hiçbir arayüz çağırmıyordu).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { findSimilarFeedback } from '@/lib/ai-learning';
import { inboxKey, previewText, unifiedSentiment } from '@/lib/dealer-inbox/core';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().trim().min(2, 'En az 2 karakter yazın.').max(200, 'Arama en fazla 200 karakter olabilir.'),
});

export const POST = defineRoute(
  {
    name: 'dealer.inbox.semantic',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: 'ai',
    schema: bodySchema,
  },
  async ({ body, tenant }) => {
    const matches = await findSimilarFeedback({ dealerId: tenant.dealerId, text: body.query, limit: 15, minScore: 0.35 });
    if (matches.length === 0) return ok({ results: [] });
    const rows = await prisma.feedback.findMany({
      where: { id: { in: matches.map((m) => m.feedbackId) }, deletedAt: null, qrCode: { dealerId: tenant.dealerId } },
      select: { id: true, rating: true, text: true, sentiment: true, aiProcessedAt: true, createdAt: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results = matches.flatMap((m) => {
      const r = byId.get(m.feedbackId);
      if (!r) return [];
      const s = unifiedSentiment({ sentiment: r.sentiment, rating: r.rating, hasText: !!r.text?.trim(), analyzed: !!r.aiProcessedAt });
      return [
        {
          key: inboxKey('qr', r.id),
          score: Math.round(m.score * 1000) / 1000,
          rating: r.rating,
          textPreview: previewText(r.text, 200),
          createdAt: r.createdAt.toISOString(),
          sentiment: s.sentiment,
        },
      ];
    });
    return ok({ results });
  }
);
