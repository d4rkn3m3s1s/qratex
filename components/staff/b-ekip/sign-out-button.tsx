'use client';

import { useState } from 'react';
import { signOut } from '@/lib/native/sign-out';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Personel çıkışı — tek tıkla oturumu gerçekten kapatır (eski CSRF'siz form next-auth'un
 * İngilizce onay sayfasına düşüyor, ortak tablette oturum açık kalıyordu).
 */
export function StaffSignOutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-11 text-muted-foreground hover:text-foreground"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut({ redirect: false });
        } finally {
          window.location.assign('/auth/login');
        }
      }}
    >
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="mr-1.5 h-4 w-4" aria-hidden />}
      {label}
    </Button>
  );
}
