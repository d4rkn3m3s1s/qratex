import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';
import { publicDisplayName } from '@/lib/http/dto';

export const dynamic = 'force-dynamic';

const MIN_ADMIN_QUERY = 3;
const SEARCH_RATE_MAX = 30; // aktör başına / dakika

/**
 * GET: ekibe eklenebilecek aday (ekipte olmayan). ?q=
 *
 * P0-10: Eski kod boş `q` ile BÜTÜN kullanıcıların ad, e-posta ve rolünü (ekip yöneticisi
 * CUSTOMER bile olsa) listeliyordu; rate limit yoktu → kullanıcı tabanı e-posta listesi çıkarılabiliyordu.
 * Yeni sözleşme (davet modeli):
 *  - Boş/kısa sorgu → boş liste.
 *  - ADMIN olmayan ekip yöneticisi YALNIZ tam e-posta adresiyle birebir arama yapar ("davet":
 *    kişiyi zaten tanıyorsunuz). Yanıttaki e-posta, yöneticinin yazdığı adrestir — yeni bilgi sızmaz.
 *  - ADMIN ad/e-posta parçasıyla arayabilir (en fazla 10 sonuç).
 *  - Rol alanı dönmez; ad herkese açık biçimde kısaltılır (ADMIN hariç). Aktör başına rate limit.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const rawQ = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120);

  const rl = await checkRateLimitDb(`team-member-search:${auth.session.user.id}`, SEARCH_RATE_MAX, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla arama yaptınız. Lütfen biraz bekleyin.', users: [] },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
    );
  }

  const exactEmail = normalizeEmail(rawQ);
  const looksLikeEmail = z.string().email().safeParse(exactEmail).success;

  if (!auth.isAdmin) {
    if (!looksLikeEmail) {
      return NextResponse.json(
        { success: true, users: [], hint: 'Eklemek istediğiniz kişinin e-posta adresini tam olarak yazın.' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const match = await prisma.user.findFirst({
      where: { email: emailLookupFilter(exactEmail), adminTeamRole: null },
      select: { id: true, name: true, image: true },
    });
    const users = match
      ? [{ id: match.id, name: publicDisplayName(match.name, ''), email: exactEmail, image: match.image }]
      : [];
    return NextResponse.json({ success: true, users }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (rawQ.length < MIN_ADMIN_QUERY) {
    return NextResponse.json({ success: true, users: [] }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const users = await prisma.user.findMany({
    where: {
      OR: [{ name: { contains: rawQ, mode: 'insensitive' } }, { email: { contains: rawQ, mode: 'insensitive' } }],
      // Ekipte olma ölçütü = ekip rolü (adminTeamRole). Departmansız ama rollü üye de "ekipte" sayılır.
      adminTeamRole: null,
    },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: 'asc' },
    take: 10,
  });

  return NextResponse.json({ success: true, users }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const addSchema = z.object({
  email: z.string().email(),
  department: z.string().max(50).optional().nullable(), // birincil departman (geriye dönük)
  departments: z.array(z.string().max(50)).max(20).optional(), // çoklu departman (yeni)
  teamRole: z.enum(['yonetici', 'uye']).default('uye'),
});

/** userId için junction departmanları verilen slug listesine eşitle (replace-all). */
async function syncUserDepartments(userId: string, slugs: string[]): Promise<void> {
  const unique = [...new Set(slugs.filter(Boolean))];
  await prisma.userDepartment.deleteMany({ where: { userId } });
  if (unique.length > 0) {
    await prisma.userDepartment.createMany({
      data: unique.map((departmentSlug) => ({ userId, departmentSlug })),
      skipDuplicates: true,
    });
  }
}

/**
 * POST: e-posta ile mevcut kullanıcıyı ekibe ekle. Kullanıcı bulunursa ADMIN yapılır +
 * departman/rol atanır. Bulunamazsa 404 (davet için ayrı akış gerekir).
 */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  // P0-10: "bu e-posta kayıtlı mı?" sorusunun yanıtı (404) da bir numaralandırma kanalıdır;
  // aramayla AYNI kova paylaşılır → ekleme + arama toplamı aktör başına dakikada 30.
  const rl = await checkRateLimitDb(`team-member-search:${auth.session.user.id}`, SEARCH_RATE_MAX, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla deneme yaptınız. Lütfen biraz bekleyin.' },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz e-posta' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const { email, department, departments, teamRole } = parsed.data;

  const user = await prisma.user.findFirst({ where: { email: emailLookupFilter(email) }, select: { id: true, role: true } });
  if (!user) {
    return NextResponse.json({ success: false, error: 'Bu e-posta ile kayıtlı kullanıcı yok. Önce kullanıcı oluşturun.', notFound: true }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }

  // Çoklu departman listesi: departments verildiyse onu kullan, yoksa tekil department'tan türet.
  const depList = departments ?? (department ? [department] : []);
  const primary = depList[0] ?? null; // birincil = ilk departman (adminDepartment ile uyum)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      // Rol DEĞİŞTİRİLMEZ: üye normal panelinden (müşteri/bayi) girer, ekip kısmına
      // adminTeamRole ile erişir. ADMIN yapmak /customer/* middleware guard'ıyla çelişirdi.
      adminDepartment: primary,
      adminTeamRole: teamRole,
    },
    select: { id: true, name: true, email: true, image: true, adminDepartment: true, adminTeamRole: true },
  });
  await syncUserDepartments(user.id, depList);

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id, action: 'add_team_member', entity: 'admin_team_member', entityId: user.id,
      newData: { email, department, teamRole } as Prisma.InputJsonValue, ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true, member: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const updateSchema = z.object({
  id: z.string(),
  department: z.string().max(50).optional().nullable(),
  departments: z.array(z.string().max(50)).max(20).optional(), // çoklu departman (verilirse replace-all)
  teamRole: z.enum(['yonetici', 'uye']).optional(),
});

/** PUT: mevcut üyenin departman(lar)/ekip rolünü güncelle. Yönetici (ekip) yetkisiyle. */
export async function PUT(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz veri' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const { id, department, departments, teamRole } = parsed.data;

  // Yalnız MEVCUT ekip üyeleri güncellenir: id ile (e-posta/onay olmadan) ekip dışındaki birine
  // rol verilip ekibe sokulamasın.
  const member = await prisma.user.findFirst({ where: { id, adminTeamRole: { not: null } }, select: { id: true } });
  if (!member) return NextResponse.json({ success: false, error: 'Üye bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  const data: Prisma.UserUpdateInput = {};
  if (teamRole !== undefined) data.adminTeamRole = teamRole;
  // Çoklu departman verildiyse junction'ı eşitle + birincil = ilk. Yoksa tekil department davranışı.
  if (departments !== undefined) {
    await syncUserDepartments(id, departments);
    data.adminDepartment = departments[0] ?? null;
  } else if (department !== undefined) {
    data.adminDepartment = department;
    // tekil güncellemede junction'ı da tut (tek elemanlı)
    await syncUserDepartments(id, department ? [department] : []);
  }

  const updated = await prisma.user.update({
    where: { id }, data,
    select: { id: true, name: true, email: true, image: true, adminDepartment: true, adminTeamRole: true },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ success: false, error: 'Üye bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id, action: 'update_team_member', entity: 'admin_team_member', entityId: id,
      newData: { department, departments, teamRole } as Prisma.InputJsonValue, ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true, member: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?id=: kişiyi ekipten çıkar (departman/rol temizlenir). */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id || id.length > 191) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  // Yalnız MEVCUT ekip üyesi çıkarılır (id ile ekip dışındaki hesaplara yazılmaz, sahte audit
  // kaydı oluşmaz). Koşullu güncelleme: arada çıkarılmışsa 404.
  const removed = await prisma.user.updateMany({
    where: { id, adminTeamRole: { not: null } },
    data: { adminDepartment: null, adminTeamRole: null },
  });
  if (removed.count === 0) {
    return NextResponse.json({ success: false, error: 'Üye bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  await prisma.userDepartment.deleteMany({ where: { userId: id } }).catch(() => null); // çoklu departman temizle
  await prisma.auditLog.create({
    data: { userId: auth.session.user.id, action: 'remove_team_member', entity: 'admin_team_member', entityId: id, ...getAuditRequestMeta(req) },
  });
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
