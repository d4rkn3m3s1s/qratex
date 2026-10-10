'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TONE_CHIP } from '@/components/states';
import { parseAuthError } from '@/lib/auth/login-errors';
import { resolveErrorCopy, useAuthCopy } from '../_components/auth-copy';

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
    <div className="w-full max-w-md">
      <Card glass>
        <CardContent className="space-y-5 pt-6 text-center">
          <div role="alert" className="flex flex-col items-center gap-3">
            <div className={cn('grid h-14 w-14 place-items-center rounded-full', TONE_CHIP.danger)}>
              <ShieldAlert className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="qx-h2 text-fg">{msg.title}</h1>
            <p className="qx-body text-fg-muted text-pretty">{msg.body}</p>
          </div>
          <Button asChild variant="gradient" className="w-full">
            <Link href="/auth/login">{copy.backToLogin}</Link>
          </Button>
          <p className="qx-small text-fg-subtle text-pretty">{copy.errorPageHelp}</p>
        </CardContent>
      </Card>
    </div>
  );
}
