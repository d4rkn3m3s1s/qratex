import { firstParam } from '@/components/auth/p-auth/server-data';
import { VerifyEmailView } from './verify-email-view';

/**
 * /auth/verify-email — doğrulama POST ile istemcide yapılır (GET yan etkisiz: e-posta
 * tarayıcılarının ön-yüklemesi bağlantıyı tüketmez). Token sunucudan prop olarak gelir;
 * istemci adres çubuğundan siler.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <VerifyEmailView token={(firstParam(sp.token) ?? '').trim().slice(0, 512)} />;
}
