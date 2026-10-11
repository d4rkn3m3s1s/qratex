'use client';

import { signOut as nextAuthSignOut } from 'next-auth/react';
import { releaseNativePush } from '@/lib/native/push-client';

/**
 * next-auth `signOut` sarmalayıcısı: önce native cihaz push jetonunu bırakır (oturum hâlâ geçerli),
 * sonra çıkış yapar. Uygulamadaki TÜM çıkış/hesap değiştirme noktaları bunu kullanmalı.
 */
export async function signOut(...args: Parameters<typeof nextAuthSignOut>): ReturnType<typeof nextAuthSignOut> {
  await releaseNativePush().catch(() => undefined);
  return nextAuthSignOut(...args);
}
