import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { ADMIN_ALL_TENANTS, recordAdminTenantAccess } from '@/lib/auth/admin-tenant-audit';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { z } from 'zod';
import { ASSIGNEE_SELECT, assigneeDto, validateAssignee } from '@/lib/dealer/assignee';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * AI Action Engine (madde 36): öneri -> sahip atama -> takip.
 * GET: SALT OKUMA. Eskiden her liste isteği LLM çağırıp yeni aksiyon yazıyordu (bitmeyen iş
 * döngüsü, N+1, yarış — denetim K9). Öneriler artık Gelen Kutusu → Bana atananlar'daki
 * "Öneriler" bandında gösterilir ve yalnız bayi kabul edince göreve dönüşür
 * (`/api/dealer/queues/*`, `lib/dealer-queues/work-server.ts`).
 * POST: create from feedback actionSuggestions veya manuel.
 */

const createSchema = z.object({
  feedbackId: z.string().min(1).max(64).optional(),
  suggestionText: z.string().min(1).max(8000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  sourceModule: z.string().max(120).optional(),
  assignedToId: z.string().max(64).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.action-items.list', session.user.id, 'read');
  if (limited) return limited;
  if (session.user.role === 'ADMIN') {
    // Yöneticinin TÜM işletmeleri kapsayan listesi denetime yazılır (guvenlik-bayi-api O6).
    await recordAdminTenantAccess({ adminId: session.user.id, dealerId: ADMIN_ALL_TENANTS, context: 'dealer.action-items.list', method: 'GET' });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim();
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 20, 100);
    const skip = paginationSkip(page, pageSize);

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

    const [rows, total] = await Promise.all([
      prisma.actionItem.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          feedback: { select: { id: true, rating: true, text: true, createdAt: true } },
          assignedTo: { select: ASSIGNEE_SELECT },
        },
      }),
      prisma.actionItem.count({ where }),
    ]);

    // P0-11: AÇIK DTO (`...row` yayılımı yok: şemaya eklenen alan kendiliğinden dışarı çıkmaz);
    // atanan kişinin e-postası maskeli.
    const items = rows.map((row) => ({
      id: row.id,
      feedbackId: row.feedbackId,
      dealerId: row.dealerId,
      suggestionText: row.suggestionText,
      priority: row.priority,
      status: row.status,
      assignedToId: row.assignedToId,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      sourceModule: row.sourceModule,
      impactScore: row.impactScore,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      feedback: row.feedback,
      assignedTo: assigneeDto(row.assignedTo),
    }));

    return NextResponse.json(
      {
        items,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Action items list error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Aksiyonlar yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.action-items.create', session.user.id, 'mutation');
  if (limited) return limited;

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    let feedbackId: string | null = null;
    let dealerId: string;

    if (parsed.data.feedbackId) {
      const feedback = await prisma.feedback.findUnique({
        where: { id: parsed.data.feedbackId },
        include: { qrCode: { select: { dealerId: true } } },
      });
      if (!feedback) {
        return NextResponse.json(
          { error: 'Geri bildirim bulunamadı' },
          { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
        return NextResponse.json(
          { error: 'Bu geri bildirim için aksiyon oluşturma yetkiniz yok' },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      feedbackId = feedback.id;
      dealerId = feedback.qrCode.dealerId;
    } else {
      if (session.user.role !== 'DEALER') {
        return NextResponse.json(
          { error: 'feedbackId gerekli' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      dealerId = session.user.id;
    }

    // P0-11: atanan kişi bu bayinin kendisi ya da AKTİF personeli olmalı.
    const assignee = await validateAssignee(dealerId, parsed.data.assignedToId);
    if (!assignee.ok) {
      return NextResponse.json({ error: assignee.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json(
        { error: 'Bu öneri için açık bir aksiyon zaten mevcut' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const item = await prisma.actionItem.create({
      data: {
        feedbackId,
        dealerId,
        suggestionText: parsed.data.suggestionText.trim(),
        priority: parsed.data.priority ?? 'medium',
        sourceModule: parsed.data.sourceModule ?? (feedbackId ? 'feedback' : 'ai_aggregate'),
        assignedToId: assignee.value ?? null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      },
    });
    return NextResponse.json(item, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Action item create error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Aksiyon oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
