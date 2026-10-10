'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseAuthError } from '@/lib/auth/login-errors';
import { AuthCard } from '@/components/auth/p-auth/auth-card';
import { resolveErrorCopy, useAuthCopy } from '@/components/auth/p-auth/copy';

/**
 * NextAuth hata ekranı (`pages.error`). Eskiden bu rota yoktu: Google onayında "İptal",
 * hesap bağlanamadı vb. her OAuth hatası 404'e düşüyordu. Ham `error` değeri asla
 * gösterilmez; bilinen kodlar anlaşılır metne, bilinmeyenler genel metne eşlenir.
 */
export function AuthErrorView({ code }: { code: string | null }) {
  const copy = useAuthCopy();
  const parsed = parseAuthError(code) ?? { code: 'UNKNOWN' as const };
  const msg = resolveErrorCopy(copy, parsed.code, parsed.retryAfterSec);
  return (
    <AuthCard tone="danger" icon={<ShieldAlert className="h-6 w-6" aria-hidden />} title={msg.title} description={msg.body} live="assertive">
      <Button asChild className="w-full">
        <Link href="/auth/login">{copy.backToLogin}</Link>
      </Button>
      <p className="qx-small text-center text-fg-muted text-pretty">{copy.errorPageHelp}</p>
    </AuthCard>
  );
}
