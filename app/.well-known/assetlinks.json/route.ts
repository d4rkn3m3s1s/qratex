import { buildAssetLinks } from '@/lib/native/app-links';

export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(JSON.stringify(buildAssetLinks()), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
