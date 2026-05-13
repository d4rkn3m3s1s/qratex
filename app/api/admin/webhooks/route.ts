import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { adminWebhookCreateSchema } from '@/lib/validations-admin';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const list = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { createdBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json(list, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Webhooks GET error:', e);
    return NextResponse.json({ error: 'Webhook listesi alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
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
    const parsed = adminWebhookCreateSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const url = parsed.data.url.trim();
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const events = Array.isArray(parsed.data.events) && parsed.data.events.length > 0
      ? parsed.data.events
      : ['feedback.created'];
    const secret = typeof parsed.data.secret === 'string' ? parsed.data.secret.trim() || undefined : undefined;
    const webhook = await prisma.webhook.create({
      data: {
        url,
        secret,
        events: events as unknown as object,
        createdById: auth.session.user.id,
      },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'CREATE_WEBHOOK',
        entity: 'Webhook',
        entityId: webhook.id,
        newData: { url: webhook.url, events: webhook.events } as object,
        ...auditMeta,
      },
    });
    return NextResponse.json(webhook, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Webhook POST error:', e);
    return NextResponse.json({ error: 'Webhook eklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const existing = await prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Webhook bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    await prisma.webhook.delete({ where: { id } });
    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'DELETE_WEBHOOK',
        entity: 'Webhook',
        entityId: id,
        oldData: { url: existing.url, events: existing.events } as object,
        ...auditMeta,
      },
    });
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Webhook DELETE error:', e);
    return NextResponse.json({ error: 'Webhook silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
