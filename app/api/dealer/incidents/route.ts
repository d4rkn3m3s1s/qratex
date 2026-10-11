
export const dynamic = 'force-dynamic';

/**
 * Eski vaka ucu (geriye uyumluluk). Yeni yüzey: Gelen Kutusu → Vakalar
 * (`/dealer/inbox/incidents`, BFF `/api/dealer/queues/incidents`).
 * GET artık SALT OKUMA: eşik tespiti ve demo temizliği okuma yolundan çıkarıldı
 * (bkz. `lib/dealer-queues/radar.ts`, `lib/dealer-queues/maintenance.ts`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { z } from 'zod';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';
import { resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { ASSIGNEE_SELECT, assigneeDto, validateAssignee } from '@/lib/dealer/assignee';

const createIncidentSchema = z.object({
  type: z.string().min(1).max(64),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  thresholdValue: z.number().finite().optional(),
  assignedToId: z.string().max(64).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  dealerId: z.string().max(191).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 20, 100);
    const skip = paginationSkip(page, pageSize);

    const where =
      session.user.role === 'ADMIN'
        ? (status ? { status } : {})
        : { dealerId: session.user.id, ...(status ? { status } : {}) };

    const [rows, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: ASSIGNEE_SELECT },
        },
      }),
      prisma.incident.count({ where }),
    ]);
    // P0-11: AÇIK DTO (`...row` yayılımı yok); atanan kişinin e-postası maskeli.
    const items = rows.map((row) => ({
      id: row.id,
      dealerId: row.dealerId,
      type: row.type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      description: row.description,
      thresholdValue: row.thresholdValue,
      assignedToId: row.assignedToId,
      dueAt: row.dueAt,
      resolvedAt: row.resolvedAt,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('incidents GET:', error);
    return NextResponse.json({ error: 'Olaylar yüklenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.incidents.create', session.user.id, 'mutation');
  if (limited) return limited;
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Geçersiz veri' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Kapsam: DEALER kendi; ADMIN yalnız AÇIK ve gerçekten DEALER olan `dealerId` ile (eski kod
    // ADMIN'in kendi id'sine ya da doğrulanmamış bir id'ye olay yazıyordu).
    const scope = await resolveDealerScope(session, { dealerId: parsed.data.dealerId, allowRoles: ['ADMIN', 'DEALER'] });
    if (!scope.ok) return scopeErrorResponse(scope);
    const dealerId = scope.dealerId;

    // P0-11: atanan kişi bayinin kendisi ya da AKTİF personeli olmalı.
    const assignee = await validateAssignee(dealerId, parsed.data.assignedToId);
    if (!assignee.ok) {
      return NextResponse.json({ error: assignee.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const incident = await prisma.incident.create({
      data: {
        dealerId,
        type: parsed.data.type,
        severity: parsed.data.severity,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        thresholdValue: parsed.data.thresholdValue ?? null,
        assignedToId: assignee.value ?? null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      },
    });
    return NextResponse.json(incident, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('incidents POST:', error);
    return NextResponse.json({ error: 'Olay oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
