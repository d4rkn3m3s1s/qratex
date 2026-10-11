import { buildAppleAppSiteAssociation } from '@/lib/native/app-links';

export const dynamic = 'force-dynamic';

// Apple uzantısız yolu ister ve Content-Type application/json olmalı.
export function GET() {
  return new Response(JSON.stringify(buildAppleAppSiteAssociation()), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
