import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'resolved']).optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        dealer: { select: { id: true, name: true, businessName: true } },
      },
    });
    if (!incident) {
      return NextResponse.json(
        { error: 'Incident bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (session.user.role === 'DEALER' && incident.dealerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu incident\'i görüntüleme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(incident, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('incidents GET:', error);
    return NextResponse.json(
      { error: 'Incident yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const existing = await prisma.incident.findUnique({
      where: { id },
      select: { dealerId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Incident bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (session.user.role === 'DEALER' && existing.dealerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu incident\'i güncelleme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const data: { status?: string; assignedToId?: string | null; dueAt?: Date | null; resolvedAt?: Date | null } = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;
    if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (parsed.data.resolvedAt !== undefined) {
      data.resolvedAt = parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : null;
    }

    if (Object.keys(data).length === 0) {
      const row = await prisma.incident.findUnique({
        where: { id },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          dealer: { select: { id: true, name: true, businessName: true } },
        },
      });
      if (!row) {
        return NextResponse.json(
          { error: 'Incident bulunamadı' },
          { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(row, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (session.user.role === 'ADMIN') {
      const updated = await prisma.incident.update({
        where: { id },
        data,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          dealer: { select: { id: true, name: true, businessName: true } },
        },
      });
      return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const n = await prisma.incident.updateMany({
      where: { id, dealerId: session.user.id },
      data,
    });
    if (n.count === 0) {
      return NextResponse.json(
        { error: 'Incident bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const updated = await prisma.incident.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        dealer: { select: { id: true, name: true, businessName: true } },
      },
    });
    if (!updated) {
      return NextResponse.json(
        { error: 'Incident bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('incidents PATCH:', error);
    return NextResponse.json(
      { error: 'Güncelleme başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
