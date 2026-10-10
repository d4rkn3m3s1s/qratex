import { firstParam, getAuthFeatures, getSignedInUser } from '@/components/auth/p-auth/server-data';
import { ForgotPasswordView } from './forgot-password-view';

/**
 * /auth/forgot-password — e-posta gönderimi kapalıysa form hiç gösterilmez (kullanıcı formu
 * doldurup gönderdikten sonra öğrenmiyor); bağlantıyla giriş açıksa şifresiz alternatif sunulur.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [features, user] = await Promise.all([getAuthFeatures(), getSignedInUser()]);
  return (
    <ForgotPasswordView
      rawCallback={firstParam(sp.callbackUrl)}
      mailConfigured={features.mailConfigured}
      magicLink={features.magicLink}
      signedInEmail={user?.email ?? null}
    />
  );
}
