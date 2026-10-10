'use client';

import { VerifyPending } from '@/components/auth/p-auth/verify-pending';

/**
 * NextAuth `pages.verifyRequest` + kayıt sonrası "gelen kutunu kontrol et" ekranının
 * bağımsız adresi. E-posta URL'ye konmaz (kişisel veri adres çubuğunda/analitikte
 * dolaşmasın); kullanıcı yeniden gönderim için adresini burada yazar.
 */
export function VerifyRequestView() {
  return <VerifyPending />;
}
