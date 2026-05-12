
export const dynamic = 'force-dynamic';

/**
 * Incident/Kriz radarı (madde 35): eşik aşımında alarm + görev.
 * GET: list dealer incidents; otomatik tetikleme (puan düşüşü, şikayet artışı) sayfa açıldığında çalışır.
 * POST: create incident (manuel veya otomatik tetikleme).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { runIncidentDetection, ensureDemoIncidentIfEmpty } from '@/lib/incident-detection';
import { z } from 'zod';

const createIncidentSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1),
  description: z.string().optional(),
  thresholdValue: z.number().optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100);
  const skip = (page - 1) * pageSize;

  const dealerId = session.user.role === 'DEALER' ? session.user.id : null;
  const where =
    session.user.role === 'ADMIN'
      ? (status ? { status } : {})
      : { dealerId: session.user.id, ...(status ? { status } : {}) };

  // Otomatik tetikleme: sadece dealer için; eşik aşımında olay oluştur, yoksa demo olay
  if (dealerId) {
    try {
      await runIncidentDetection(dealerId);
      const incidentCount = await prisma.incident.count({ where: { dealerId } });
      if (incidentCount === 0) await ensureDemoIncidentIfEmpty(dealerId);
    } catch (_) {
      // Detection hatası listeyi bozmasın
    }
  }

  const [items, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.incident.count({ where }),
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

  if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const dealerId = (body.dealerId && session.user.role === 'ADMIN') ? body.dealerId : session.user.id;
  const data = {
    dealerId,
    type: parsed.data.type,
    severity: parsed.data.severity,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    thresholdValue: parsed.data.thresholdValue ?? null,
    assignedToId: parsed.data.assignedToId ?? null,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
  };

  const incident = await prisma.incident.create({ data });
  return NextResponse.json(incident, { status: 201 });
}
