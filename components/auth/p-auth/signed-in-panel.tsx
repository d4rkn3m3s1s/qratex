'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/native/sign-out';
import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthCopy } from './copy';
import { AuthCard } from './auth-card';

/**
 * Oturumu zaten açık kullanıcı giriş/kayıt ekranına gelirse: sessiz yönlendirme yerine
 * açık seçim. (Sessiz yönlendirme, başka hesaba geçmek isteyen kullanıcıyı ekrandan
 * kilitliyordu; formun gösterilmesi de "hangi hesaptayım?" belirsizliği yaratıyordu.)
 */
export function SignedInPanel({
  email,
  continueHref,
  body,
}: {
  email: string;
  continueHref: string;
  body?: string;
}) {
  const copy = useAuthCopy();
  const [leaving, setLeaving] = useState(false);
  return (
    <AuthCard
      icon={<UserCheck className="h-6 w-6" aria-hidden />}
      title={copy.signedInTitle}
      description={body ?? copy.signedInBody(email)}
    >
      <div className="grid gap-2">
        <Button asChild className="w-full">
          <Link href={continueHref}>{copy.signedInContinue}</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          loading={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut({ callbackUrl: `${window.location.pathname}${window.location.search}` });
          }}
        >
          {copy.signedInSwitch}
        </Button>
      </div>
    </AuthCard>
  );
}
