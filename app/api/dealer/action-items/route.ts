
export const dynamic = 'force-dynamic';

/**
 * AI Action Engine (madde 36): öneri -> sahip atama -> takip.
 * GET: list action items; otomatik tetikleme (feedback suggestions + AI sidebar analizi).
 * POST: create from feedback actionSuggestions veya manuel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { runActionItemsAutoTrigger } from '@/lib/action-items-ai';
import { z } from 'zod';

const createSchema = z.object({
  feedbackId: z.string().min(1).optional(),
  suggestionText: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  sourceModule: z.string().optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q')?.trim();
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100);
  const skip = (page - 1) * pageSize;

  const dealerId = session.user.role === 'DEALER' ? session.user.id : null;
  const where =
    session.user.role === 'ADMIN'
      ? {
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { suggestionText: { contains: q, mode: 'insensitive' as const } },
                  { feedback: { text: { contains: q, mode: 'insensitive' as const } } },
                ],
              }
            : {}),
        }
      : {
          dealerId: session.user.id,
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { suggestionText: { contains: q, mode: 'insensitive' as const } },
                  { feedback: { text: { contains: q, mode: 'insensitive' as const } } },
                ],
              }
            : {}),
        };

  // Otomatik tetikleme: feedback suggestions + sidebar verilerinden AI öneri
  if (dealerId) {
    try {
      await runActionItemsAutoTrigger(dealerId);
    } catch (_) {
      // Hata listeyi bozmasın
    }
  }

  const [items, total] = await Promise.all([
    prisma.actionItem.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        feedback: { select: { id: true, rating: true, text: true, createdAt: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.actionItem.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  let feedbackId: string | null = null;
  let dealerId: string;

  if (parsed.data.feedbackId) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: parsed.data.feedbackId },
      include: { qrCode: { select: { dealerId: true } } },
    });
    if (!feedback) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 });
    }
    if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu geri bildirim için aksiyon oluşturma yetkiniz yok' }, { status: 403 });
    }
    feedbackId = feedback.id;
    dealerId = feedback.qrCode.dealerId;
  } else {
    if (session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'feedbackId gerekli' }, { status: 400 });
    }
    dealerId = session.user.id;
  }

  const existingOpenItem = await prisma.actionItem.findFirst({
    where: {
      dealerId,
      suggestionText: parsed.data.suggestionText.trim(),
      status: { in: ['pending', 'assigned', 'in_progress'] },
    },
    select: { id: true },
  });
  if (existingOpenItem) {
    return NextResponse.json({ error: 'Bu öneri için açık bir aksiyon zaten mevcut' }, { status: 409 });
  }

  const item = await prisma.actionItem.create({
    data: {
      feedbackId,
      dealerId,
      suggestionText: parsed.data.suggestionText.trim(),
      priority: parsed.data.priority ?? 'medium',
      sourceModule: parsed.data.sourceModule ?? (feedbackId ? 'feedback' : 'ai_aggregate'),
      assignedToId: parsed.data.assignedToId ?? null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
