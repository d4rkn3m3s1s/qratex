import { SignedInPanel } from '@/components/auth/p-auth/signed-in-panel';
import {
  continueTargetFor,
  firstParam,
  getAuthFeatures,
  getReferralPreview,
  getRequestOrigin,
  getSignedInUser,
} from '@/components/auth/p-auth/server-data';
import { RegisterView } from './register-view';

/**
 * /auth/register — sunucu önce: sosyal kayıt bayrakları, oturum durumu ve `?ref=` davet
 * önizlemesi (geçerli mi, kim davet etti, kaç puan) ilk HTML ile gelir. Geçersiz kodda bonus
 * vaadi hiç gösterilmez.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawCallback = firstParam(sp.callbackUrl);
  const refRaw = firstParam(sp.ref);
  const [features, user, origin, referral] = await Promise.all([
    getAuthFeatures(),
    getSignedInUser(),
    getRequestOrigin(),
    getReferralPreview(refRaw),
  ]);

  if (user) {
    return <SignedInPanel email={user.email} continueHref={continueTargetFor(user, rawCallback, origin)} />;
  }

  const initialRole = firstParam(sp.role)?.toUpperCase() === 'DEALER' ? 'DEALER' : 'CUSTOMER';

  return (
    <RegisterView
      rawCallback={rawCallback}
      refCode={refRaw ? refRaw.trim().toUpperCase().slice(0, 32) : null}
      referral={referral}
      features={{ google: features.google, github: features.github, registrationOpen: features.registrationOpen }}
      initialRole={initialRole}
    />
  );
}
