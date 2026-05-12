
export const dynamic = 'force-dynamic';

/**
 * P3 Partner kanalı: partner oluşturma ve listeleme.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';

const createPartnerSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['POS', 'ajans', 'dijital_menu']),
  webhookUrl: z.string().url().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

// GET /api/admin/partners
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: 'desc' },
  });
  // API key'leri döndürme; sadece hash var
  const safe = partners.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    webhookUrl: p.webhookUrl,
    metadata: p.metadata,
    isActive: p.isActive,
    createdAt: p.createdAt,
  }));
  return NextResponse.json({ partners: safe });
}

// POST /api/admin/partners
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
  }

  const parsed = createPartnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rawKey = `qrk_${randomBytes(24).toString('hex')}`;
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const partner = await prisma.partner.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      apiKeyHash,
      webhookUrl: parsed.data.webhookUrl ?? null,
      ...(parsed.data.metadata != null && { metadata: parsed.data.metadata as Prisma.InputJsonValue }),
    },
  });

  // Sadece oluşturma anında raw key dönülür; sonra hiç dönülmez
  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      type: partner.type,
      webhookUrl: partner.webhookUrl,
      isActive: partner.isActive,
      createdAt: partner.createdAt,
    },
    apiKey: rawKey,
    message: 'API anahtarını güvenli saklayın; tekrar görüntülenemez.',
  });
}
