import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/** Sabit-zaman string karşılaştırma (bearer token timing attack önlemi). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Inngest veya harici cron’ların kendi deployment’ına güvenli POST atması için. */
export function internalAppBaseUrl(): string {
  const fromNextAuth = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, '');
  if (fromNextAuth) return fromNextAuth;
  const v = process.env.VERCEL_URL?.trim();
  if (v) return /^https?:\/\//i.test(v) ? v.replace(/\/$/, '') : `https://${v.replace(/\/$/, '')}`;
  return 'http://127.0.0.1:3000';
}

export function internalJobSecret(): string | undefined {
  return process.env.INNGEST_INTERNAL_JOB_SECRET || process.env.CRON_SECRET;
}

export function authorizeInternalJobRequest(req: NextRequest): boolean {
  const secret = internalJobSecret();
  const auth = req.headers.get('authorization');
  if (!secret || !auth) return false;
  return safeEqual(auth, `Bearer ${secret}`);
}

export function unauthorizedInternalJob(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function internalJobAuthHeaders(): Record<string, string> {
  const secret = internalJobSecret();
  if (!secret) {
    throw new Error('INNGEST_INTERNAL_JOB_SECRET veya CRON_SECRET tanımlı olmalı.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
  };
}

export async function invokeInternalCron(
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const base = internalAppBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${base}${p}`, {
    method: 'POST',
    headers: internalJobAuthHeaders(),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Internal cron ${p} HTTP ${res.status}: ${text.slice(0, 2000)}`);
  }
  return text ? JSON.parse(text) : {};
}
