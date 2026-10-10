
export const dynamic = 'force-dynamic';

/**
 * Incident/Kriz radarı (madde 35): eşik aşımında alarm + görev.
 * GET: list dealer incidents; otomatik tetikleme (puan düşüşü, şikayet artışı) sayfa açıldığında çalışır.
 * POST: create incident (manuel veya otomatik tetikleme).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { runIncidentDetection, purgeLegacyDemoIncidents } from '@/lib/incident-detection';
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = clampPageParam(searchParams.get('page'));
  const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 20, 100);
  const skip = paginationSkip(page, pageSize);

  const dealerId = session.user.role === 'DEALER' ? session.user.id : null;
  const where =
    session.user.role === 'ADMIN'
      ? (status ? { status } : {})
      : { dealerId: session.user.id, ...(status ? { status } : {}) };

  // Otomatik tetikleme: sadece dealer için; eşik aşımında olay oluştur.
  // Sahte "demo olay" artık YAZILMAZ (D11); eskiden yazılmış olanlar burada temizlenir.
  if (dealerId) {
    try {
      await purgeLegacyDemoIncidents(dealerId);
      await runIncidentDetection(dealerId);
    } catch (_) {
      // Detection hatası listeyi bozmasın
    }
  }

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
  // P0-11: atanan kişi açık DTO ile; e-posta maskeli.
  const items = rows.map((row) => ({ ...row, assignedTo: assigneeDto(row.assignedTo) }));

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
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
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
