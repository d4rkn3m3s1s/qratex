import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { syncInbox, isInboxConfigured } from '@/lib/mail-inbox';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LAST_RUN_KEY = 'inbox_sync_last_run';

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/**
 * Vercel Cron — gelen kutusunu periyodik senkronize eder (stajyer cevaplarını otomatik ayırır).
 * Admin "Yenile"ye basmadan yeni mailler DB'ye düşer. CRON_SECRET fail-closed. Son çalışma
 * özeti Settings'e yazılır (durum paneli okur).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isInboxConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'imap-not-configured' });
  }

  const r = await syncInbox(40);
  // Son çalışma özetini yaz (durum paneli için).
  const summary = r.ok
    ? { at: new Date().toISOString(), ok: true, stored: r.stored, matched: r.matched, fetched: r.fetched }
    : { at: new Date().toISOString(), ok: false, error: r.error };
  await prisma.settings.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: summary as Prisma.InputJsonValue, category: 'email' },
    create: { key: LAST_RUN_KEY, value: summary as Prisma.InputJsonValue, category: 'email' },
  }).catch(() => {});

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  return NextResponse.json(r);
}
