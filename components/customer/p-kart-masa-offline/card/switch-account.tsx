'use client';

/** Yanlış rolde (personel/yönetici) "Farklı hesapla giriş yap" — çıkış yapıp bu karta döner (rapor B8). */
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SwitchAccountButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const back = `/c/${encodeURIComponent(token)}`;
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-12 w-full"
      loading={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ callbackUrl: `/auth/login?callbackUrl=${encodeURIComponent(back)}` });
      }}
    >
      <LogOut className="h-5 w-5" aria-hidden />
      {label}
    </Button>
  );
}
