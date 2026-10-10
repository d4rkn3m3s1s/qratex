import {
  continueTargetFor,
  firstParam,
  getAuthFeatures,
  getRequestOrigin,
  getSignedInUser,
} from '@/components/auth/p-auth/server-data';
import { MagicView } from './magic-view';

/**
 * /auth/magic — bağlantıyla giriş ve 2FA'lı OAuth girişinin ikinci adımı. Token burada
 * tüketilmez (GET yan etkisiz; e-posta tarayıcılarının ön-yüklemesi bağlantıyı yakmaz);
 * istemci tek seferlik POST (`signIn`) ile dener.
 */
export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const via = firstParam(sp.via) === 'oauth' ? 'oauth' : 'email';
  const rawCallback = firstParam(sp.callbackUrl);
  const [features, user, origin] = await Promise.all([getAuthFeatures(), getSignedInUser(), getRequestOrigin()]);
  // Paylaşılan cihazda açık oturum bağlantıyla SESSİZCE değiştirilmesin: önce sorulur.
  const signedIn =
    user && via === 'email' ? { email: user.email, continueHref: continueTargetFor(user, rawCallback, origin) } : null;
  return (
    <MagicView
      signedIn={signedIn}
      token={(firstParam(sp.token) ?? '').trim().slice(0, 512)}
      via={via}
      rawCallback={rawCallback}
      canRequestNewLink={features.magicLink}
    />
  );
}
