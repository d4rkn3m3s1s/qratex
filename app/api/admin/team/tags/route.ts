import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** Etiket label'ından slug üretir. Türkçe karakterleri normalize eder. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    // Türkçe karakter dönüşümü (küçük harfe çevrildikten sonra)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    // alfasayısal olmayanları tire yap
    .replace(/[^a-z0-9]+/g, '-')
    // baştaki/sondaki tireleri temizle
    .replace(/^-|-$/g, '');
}

const upsertSchema = z.object({
  label: z.string().min(1).max(40),
  color: z.string().optional(),
});

/** GET: yönetilen etiket havuzunun tamamı, label'a göre artan sırada. */
export async function GET() {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const tags = await prisma.teamTag.findMany({ orderBy: { label: 'asc' } });
  return NextResponse.json({ success: true, tags }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: etiket ekle/güncelle (slug'a göre upsert). Yönetici. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz etiket verisi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { label, color } = parsed.data;
  const slug = slugify(label);
  if (!slug) {
    return NextResponse.json({ success: false, error: 'Etiketten geçerli bir slug üretilemedi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const tag = await prisma.teamTag.upsert({
    where: { slug },
    create: { slug, label, color: color ?? '#8b5cf6' },
    update: { label, ...(color ? { color } : {}) },
  });

  return NextResponse.json({ success: true, tag }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?slug=: etiketi sil. Yönetici. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ success: false, error: 'slug gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  await prisma.teamTag.delete({ where: { slug } }).catch(() => null);
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
