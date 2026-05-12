import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { updateQRCodeSchema } from '@/lib/validations';


export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;
    const qr = await prisma.qRCode.findUnique({
      where: { id },
      include: { dealer: { select: { id: true, name: true, businessName: true } } },
    });
    if (!qr) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 });
    }
    if (session.user.role !== 'ADMIN' && qr.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu görüntüleme yetkiniz yok' }, { status: 403 });
    }
    return NextResponse.json(qr);
  } catch (error) {
    console.error('Error fetching QR code:', error);
    return NextResponse.json({ error: 'QR kod getirilemedi' }, { status: 500 });
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
    const existing = await prisma.qRCode.findUnique({
      where: { id },
      select: { id: true, dealerId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 });
    }
    if (session.user.role !== 'ADMIN' && existing.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu güncelleme yetkiniz yok' }, { status: 403 });
    }
    const body = await request.json();
    const validated = updateQRCodeSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 });
    }
    const data: Prisma.QRCodeUpdateInput = {};
    if (validated.data.name !== undefined) data.name = validated.data.name;
    if (validated.data.description !== undefined) data.description = validated.data.description;
    if (validated.data.isActive !== undefined) data.isActive = validated.data.isActive;
    if (validated.data.expiresAt !== undefined) {
      data.expiresAt = validated.data.expiresAt ? new Date(validated.data.expiresAt) : null;
    }
    if (validated.data.revoke !== undefined) {
      data.revokedAt = validated.data.revoke ? new Date() : null;
    }
    if (validated.data.segmentConfig !== undefined) data.segmentConfig = validated.data.segmentConfig === null ? Prisma.JsonNull : (validated.data.segmentConfig as Prisma.InputJsonValue);
    const updated = await prisma.qRCode.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating QR code:', error);
    return NextResponse.json({ error: 'QR kod güncellenemedi' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const existing = await prisma.qRCode.findUnique({
      where: { id },
      select: { id: true, dealerId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 });
    }

    const canDelete = session.user.role === 'ADMIN' || existing.dealerId === session.user.id;
    if (!canDelete) {
      return NextResponse.json({ error: 'Bu QR kodu silme yetkiniz yok' }, { status: 403 });
    }

    await prisma.qRCode.delete({ where: { id } });

    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'qr_code_deleted',
        category: 'qr',
        data: { qrCodeId: id },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting QR code:', error);
    return NextResponse.json({ error: 'QR kod silinemedi' }, { status: 500 });
  }
}
