import { z } from 'zod';
import { getOptionalSession } from '@/lib/api-auth';
import { authOptions } from '@/lib/auth';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getUserAgent } from '@/lib/request-metadata';
import { recordExperienceView } from '@/lib/experience-share/public';

export const dynamic = 'force-dynamic';

/**
 * Görüntülenme sayımı (denetim B5): sayfa yüklendikten sonra istemci bir kez çağırır.
 * Tekil: aynı cihaz 24 saatte bir kez; paylaşanın kendi açışı ve süresi dolmuş kart sayılmaz.
 * Metadata/OG/önizleme botları bu ucu çağırmadığı için sayaç şişmez.
 */
export const POST = defineRoute(
  {
    name: 'public.experience-share.view',
    roles: 'public',
    params: z.object({ token: z.string().min(1).max(64) }),
    rateLimit: { max: 30, windowMs: 60_000, by: 'ip' },
    module: 'experiences',
  },
  async ({ params, request, ip }) => {
    let viewerId: string | null = null;
    try {
      viewerId = (await getOptionalSession())?.user?.id ?? null;
    } catch {
      viewerId = null;
    }
    const result = await recordExperienceView(params.token, {
      viewerId,
      ip,
      userAgent: getUserAgent({ headers: request.headers }),
    });
    return ok({ counted: result.counted });
  }
);
