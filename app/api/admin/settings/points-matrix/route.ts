import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  getPointsMatrix,
  normalizePointsMatrix,
  clearPointsMatrixCache,
  POINTS_MATRIX_SETTING_CATEGORY,
  POINTS_MATRIX_SETTING_KEY,
} from '@/lib/points-rules';
import { adminPointsMatrixPutSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const matrix = await getPointsMatrix();
    return NextResponse.json({
      success: true,
      key: POINTS_MATRIX_SETTING_KEY,
      matrix,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Points matrix fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Puan matrisi getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json();
    const parsed = adminPointsMatrixPutSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const normalizedMatrix = normalizePointsMatrix(parsed.data.matrix);

    const previous = await prisma.settings.findUnique({
      where: { key: POINTS_MATRIX_SETTING_KEY },
    });

    const saved = await prisma.settings.upsert({
      where: { key: POINTS_MATRIX_SETTING_KEY },
      update: {
        value: normalizedMatrix as Prisma.InputJsonValue,
        category: POINTS_MATRIX_SETTING_CATEGORY,
      },
      create: {
        key: POINTS_MATRIX_SETTING_KEY,
        value: normalizedMatrix as Prisma.InputJsonValue,
        category: POINTS_MATRIX_SETTING_CATEGORY,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_POINTS_MATRIX',
        entity: 'Settings',
        entityId: saved.id,
        oldData: previous?.value ?? Prisma.JsonNull,
        newData: normalizedMatrix as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });
    clearPointsMatrixCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      matrix: normalizedMatrix,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Points matrix update error:', error);
    return NextResponse.json(
      { success: false, error: 'Puan matrisi güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
