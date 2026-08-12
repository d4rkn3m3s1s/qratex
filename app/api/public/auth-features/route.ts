import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getBooleanSiteSetting } from '@/lib/site-setting-bool';
import { isMailConfigured } from '@/lib/mail-sender';

export const dynamic = 'force-dynamic';

/** Giriş sayfası: magic link gösterimi vb. (hassas bilgi yok) */
export async function GET() {
  const magicLink = await getBooleanSiteSetting('enableMagicLink', false);
  // OAuth butonları YALNIZ yapılandırılmış provider için gösterilsin (aksi halde
  // buton görünür ama tıklayınca "provider yok" hatası → giriş/kayıt kırılır).
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const github = Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET);
  return NextResponse.json(
    {
      magicLink,
      mailConfigured: isMailConfigured(),
      google,
      github,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
