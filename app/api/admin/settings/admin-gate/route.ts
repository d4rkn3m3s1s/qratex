import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  ADMIN_GATE_SETTING_KEY,
  ADMIN_GATE_SETTING_CATEGORY,
  normalizeAdminGate,
} from '@/lib/admin-gate';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET — Gizli kapı SORUSU + CEVABI (admin ayar ekranı için). Cevap yalnız ADMIN'e
 * gösterilir (admin zaten paneldeyse gate'i geçmiştir; kendi soru/cevabını yönetir).
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const setting = await prisma.settings
    .findUnique({ where: { key: ADMIN_GATE_SETTING_KEY }, select: { value: true } })
    .catch(() => null);
  const gate = normalizeAdminGate(setting?.value);
  return NextResponse.json({ success: true, question: gate.question, answer: gate.answer }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * PUT — Soru + cevabı (tek rakam) günceller. normalize whitelist uygular (cevap 0-9 değilse
 * varsayılana düşer). Audit log. NOT: cevap değişince tüm eski gate cookie'leri geçersizleşir
 * (HMAC cevabı bağladığından herkes yeniden doğrular) — kasıtlı, güvenli davranış.
 */
export async function PUT(request: NextRequest) {
  const auditMeta = getAuditRequestMeta(request);
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const raw = await request.json().catch(() => ({}));
  const normalized = normalizeAdminGate({ question: raw?.question, answer: raw?.answer });

  const previous = await prisma.settings.findUnique({ where: { key: ADMIN_GATE_SETTING_KEY } });
  const saved = await prisma.settings.upsert({
    where: { key: ADMIN_GATE_SETTING_KEY },
    update: { value: normalized as unknown as Prisma.InputJsonValue, category: ADMIN_GATE_SETTING_CATEGORY },
    create: { key: ADMIN_GATE_SETTING_KEY, value: normalized as unknown as Prisma.InputJsonValue, category: ADMIN_GATE_SETTING_CATEGORY },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'UPDATE_ADMIN_GATE',
      entity: 'Settings',
      entityId: saved.id,
      // Cevabı audit'e ham yazma (gizli) — sadece sorunun değiştiğini kaydet.
      oldData: previous ? ({ question: (previous.value as { question?: string })?.question ?? null } as Prisma.InputJsonValue) : Prisma.JsonNull,
      newData: { question: normalized.question } as Prisma.InputJsonValue,
      ...auditMeta,
    },
  });

  return NextResponse.json({ success: true, question: normalized.question, answer: normalized.answer }, { headers: PRIVATE_NO_STORE_HEADERS });
}
