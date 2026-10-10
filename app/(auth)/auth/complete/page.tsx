import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { firstParam } from '@/components/auth/p-auth/server-data';
import { CompleteView } from './complete-view';

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };

/**
 * OAuth (Google/GitHub) sonrası ara durak — sunucu önce: oturum, şifre durumu ve sağlayıcı
 * ilk HTML ile gelir (eskiden istemci GET + spinner). Oturum yoksa davet kodu ve hedef
 * KORUNARAK girişe gönderilir.
 */
export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ref = firstParam(sp.ref)?.trim().toUpperCase().slice(0, 32) || null;
  const next = firstParam(sp.next);

  let session: Awaited<ReturnType<typeof getServerSession>> = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    session = null;
  }
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  if (!userId) {
    const qs = new URLSearchParams();
    if (ref) qs.set('ref', ref);
    if (next) qs.set('next', next.slice(0, 2048));
    const back = `/auth/complete${qs.toString() ? `?${qs.toString()}` : ''}`;
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  let hasPassword = true;
  let provider = 'Google';
  let role: string | null = null;
  let email = '';
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, role: true, email: true, accounts: { select: { provider: true } } },
    });
    hasPassword = !!user?.password;
    role = user?.role ?? null;
    email = user?.email ?? '';
    const p = user?.accounts.map((a) => a.provider).find((x) => PROVIDER_LABEL[x]);
    if (p) provider = PROVIDER_LABEL[p];
  } catch {
    // DB okunamazsa şifre adımı atlanır (yalnız isteğe bağlı bir UX adımı; fail-open kabul edilebilir).
    hasPassword = true;
  }

  return (
    <CompleteView
      userId={userId}
      email={email}
      role={role}
      hasPassword={hasPassword}
      provider={provider}
      refCode={ref}
      rawNext={next}
    />
  );
}
