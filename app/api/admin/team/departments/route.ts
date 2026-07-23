import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional().nullable(),
  color: z.string().max(20).optional(),
});

/** GET: departmanlar + her birindeki üye sayısı + ekip üyeleri (atama için). */
export async function GET() {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const [departments, members] = await Promise.all([
    prisma.department.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    // Ekip üyeleri = ekip rolü (adminTeamRole) atanmış herkes. Rol ADMIN olmak ZORUNDA DEĞİL:
    // üyeler CUSTOMER kalır, müşteri panelinden erişir. (Eskiden where role:'ADMIN' idi → yeni
    // eklenen CUSTOMER üyeler listede görünmüyordu.)
    prisma.user.findMany({
      where: { adminTeamRole: { not: null } },
      select: { id: true, name: true, email: true, image: true, adminDepartment: true, adminTeamRole: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ]);

  return NextResponse.json({ success: true, departments, members }, { headers: PRIVATE_NO_STORE_HEADERS });
}

// Şirketin gerçek departmanları (varsayılan seed).
const DEFAULT_DEPARTMENTS: { name: string; color: string }[] = [
  { name: 'Dizayn ve Kullanıcı Deneyimi', color: '#8b5cf6' },
  { name: 'İş Geliştirme, Strateji ve Büyüme', color: '#3b82f6' },
  { name: 'Üretim ve Geliştirme', color: '#10b981' },
  { name: 'Satış, Sponsorluk ve Pazarlama', color: '#f59e0b' },
  { name: 'Ar-Ge', color: '#06b6d4' },
  { name: 'Finans ve Hukuk', color: '#ef4444' },
  { name: 'Sosyal Medya Yönetimi', color: '#ec4899' },
  { name: 'Rehberlik danışmanlığı', color: '#a855f7' },
];

/** POST: yeni departman oluşturur. ?seed=1 → varsayılan 8 departmanı ekler (idempotent). */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  if (req.nextUrl.searchParams.get('seed') === '1') {
    let created = 0;
    for (let i = 0; i < DEFAULT_DEPARTMENTS.length; i++) {
      const dep = DEFAULT_DEPARTMENTS[i];
      const slug = slugify(dep.name);
      await prisma.department.upsert({
        where: { slug },
        update: {},
        create: { slug, name: dep.name, color: dep.color, order: i },
      });
      created++;
    }
    return NextResponse.json({ success: true, seeded: created }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz departman' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const slug = slugify(parsed.data.name);
  if (!slug) return NextResponse.json({ success: false, error: 'Geçersiz ad' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  const dep = await prisma.department.upsert({
    where: { slug },
    update: { name: parsed.data.name, description: parsed.data.description ?? null, ...(parsed.data.color ? { color: parsed.data.color } : {}) },
    create: { slug, name: parsed.data.name, description: parsed.data.description ?? null, color: parsed.data.color || '#8b5cf6' },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'upsert',
      entity: 'department',
      entityId: dep.id,
      newData: parsed.data as Prisma.InputJsonValue,
      ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true, department: dep }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?slug=: departman siler. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ success: false, error: 'slug gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  await prisma.department.delete({ where: { slug } }).catch(() => null);
  await prisma.auditLog.create({
    data: { userId: auth.session.user.id, action: 'delete', entity: 'department', entityId: slug, ...getAuditRequestMeta(req) },
  });
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
