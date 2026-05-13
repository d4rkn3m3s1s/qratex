import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { adminApiKeyCreateSchema } from '@/lib/validations-admin';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const list = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { createdBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json(list.map((k) => ({ ...k, keyHash: undefined })), { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('API keys GET error:', e);
    return NextResponse.json({ error: 'API anahtarları listelenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
        },
      }
    );
  }
  try {
    const raw = await request.json();
    const parsed = adminApiKeyCreateSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { name: nameOpt, scope: scopeOpt } = parsed.data;
    const name = (nameOpt?.trim() || 'Yeni anahtar').trim();
    if (!name) return NextResponse.json({ error: 'İsim gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    const rawKey = `qrx_${randomBytes(24).toString('base64url')}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);
    const scope = Array.isArray(scopeOpt) ? (scopeOpt as unknown as object) : null;
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        scope: scope ?? undefined,
        createdById: auth.session.user.id,
      },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'CREATE_API_KEY',
        entity: 'ApiKey',
        entityId: apiKey.id,
        newData: { name: apiKey.name, keyPrefix: apiKey.keyPrefix } as object,
        ...auditMeta,
      },
    });
    return NextResponse.json({
      ...apiKey,
      keyHash: undefined,
      rawKey, // Sadece bu yanıtta; bir daha gösterilmez
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('API key POST error:', e);
    return NextResponse.json({ error: 'API anahtarı oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const existing = await prisma.apiKey.findUnique({ where: { id }, select: { id: true, name: true, keyPrefix: true } });
    if (!existing) {
      return NextResponse.json({ error: 'API anahtarı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    await prisma.apiKey.delete({ where: { id } });
    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'DELETE_API_KEY',
        entity: 'ApiKey',
        entityId: id,
        oldData: { name: existing.name, keyPrefix: existing.keyPrefix } as object,
        ...auditMeta,
      },
    });
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('API key DELETE error:', e);
    return NextResponse.json({ error: 'Anahtar silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
