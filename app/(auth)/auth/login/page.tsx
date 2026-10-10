import { SignedInPanel } from '@/components/auth/p-auth/signed-in-panel';
import {
  continueTargetFor,
  firstParam,
  getAuthFeatures,
  getQrContext,
  getRequestOrigin,
  getSignedInUser,
} from '@/components/auth/p-auth/server-data';
import { LoginView, type LoginNoticeKind } from './login-view';

/**
 * /auth/login — sunucu önce: sosyal giriş / bağlantıyla giriş bayrakları, oturum durumu ve QR
 * bağlamı ilk HTML ile gelir (eskiden mount sonrası fetch → butonlar sonradan beliriyordu).
 * Form, 2FA adımı ve demo bloğu küçük istemci adasıdır (`LoginView`).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawCallback = firstParam(sp.callbackUrl);
  const errorCode = firstParam(sp.error)?.slice(0, 64) ?? null;
  const [features, user, origin] = await Promise.all([getAuthFeatures(), getSignedInUser(), getRequestOrigin()]);

  if (user && !errorCode) {
    return <SignedInPanel email={user.email} continueHref={continueTargetFor(user, rawCallback, origin)} />;
  }

  const qr = await getQrContext(rawCallback, origin);
  const initialNotice: LoginNoticeKind =
    firstParam(sp.verified) === '1'
      ? 'verified'
      : firstParam(sp.reset) === '1'
        ? 'reset'
        : null;

  return (
    <LoginView
      rawCallback={rawCallback}
      errorCode={errorCode}
      initialNotice={initialNotice}
      features={{ google: features.google, github: features.github, magicLink: features.magicLink }}
      qrPlace={qr?.placeName ?? null}
    />
  );
}
