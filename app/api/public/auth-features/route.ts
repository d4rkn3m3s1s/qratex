import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getBooleanSiteSetting } from '@/lib/site-setting-bool';
import { isMailConfigured } from '@/lib/mail-sender';

export const dynamic = 'force-dynamic';

/** Giriş sayfası: magic link gösterimi vb. (hassas bilgi yok) */
export async function GET() {
  const magicLink = await getBooleanSiteSetting('enableMagicLink', false);
  return NextResponse.json(
    {
      magicLink,
      mailConfigured: isMailConfigured(),
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
