'use client';

import { Card, CardContent } from '@/components/ui/card';
import { VerifyPending } from '../_components/verify-pending';

/**
 * NextAuth `pages.verifyRequest` + kayıt sonrası "gelen kutunu kontrol et" ekranının
 * bağımsız adresi. E-posta URL'ye konmaz (kişisel veri adres çubuğunda/analitikte
 * dolaşmasın); kullanıcı yeniden gönderim için adresini burada yazar.
 */
export function VerifyRequestView() {
  return (
    <div className="w-full max-w-md">
      <Card glass>
        <CardContent className="pt-6">
          <VerifyPending />
        </CardContent>
      </Card>
    </div>
  );
}
