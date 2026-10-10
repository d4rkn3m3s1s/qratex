import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { INITIATIVE_SOURCE } from './constants';
import type { TeamRole, TeamViewer } from './permissions';

/**
 * Ekip modülü erişimi — yetki kararı YALNIZ DB'den (P0-10 / denetim K1). JWT yalnız kimliği taşır.
 * ADMIN her zaman yönetici sayılır; diğer platform rolleri (CUSTOMER/DEALER/STAFF) yalnız
 * `adminTeamRole` atanmışsa erişir.
 */
export async function resolveTeamViewer(userId: string): Promise<TeamViewer | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      role: true,
      adminTeamRole: true,
      adminDepartment: true,
      teamDepartments: { select: { departmentSlug: true } },
    },
  });
  if (!user) return null;
  const isAdmin = user.role === 'ADMIN';
  const teamRole: TeamRole | null =
    user.adminTeamRole === 'yonetici' || user.adminTeamRole === 'uye' ? user.adminTeamRole : null;
  if (!isAdmin && !teamRole) return null;
  const junction = (user.teamDepartments ?? []).map((d) => d.departmentSlug);
  const departments = junction.length > 0 ? junction : user.adminDepartment ? [user.adminDepartment] : [];
  return {
    userId,
    name: user.name ?? null,
    role: String(user.role),
    isAdmin,
    isManager: isAdmin || teamRole === 'yonetici',
    teamRole,
    departments,
    primaryDepartment: user.adminDepartment ?? departments[0] ?? null,
  };
}

/** Route içinde: ekip erişimi yoksa 403, yönetici isteniyorsa ve değilse 403. */
export async function requireTeamViewer(userId: string, opts: { manager?: boolean } = {}): Promise<TeamViewer> {
  const viewer = await resolveTeamViewer(userId);
  if (!viewer) throw new ApiError('FORBIDDEN', 'Ekip erişiminiz yok.');
  if (opts.manager && !viewer.isManager) throw new ApiError('FORBIDDEN', 'Bu işlem için ekip yöneticisi olmalısınız.');
  return viewer;
}

/** Girişim satırlarını görev sorgularından dışlar (`sourceType` null olanlar dahil kalır). */
export const NOT_INITIATIVE: Prisma.CompanyTaskWhereInput = {
  OR: [{ sourceType: null }, { sourceType: { not: INITIATIVE_SOURCE } }],
};

/**
 * Görünürlük kapsamı (denetim Y4/Bulgu 3 — ürün kararı burada, sunucuda):
 *  - Yönetici (ADMIN veya ekip yöneticisi): bütün görevler.
 *  - Üye: kendine atanan, kendi oluşturduğu, alt görevi kendisine atanan, kendi
 *    departmanlarındaki ve departmansız (genel) görevler. Başka departmanın (ör. Finans ve
 *    Hukuk) görevleri, dosyaları ve AI bağlamı üyeye kapalıdır.
 */
export function taskVisibilityWhere(viewer: TeamViewer): Prisma.CompanyTaskWhereInput {
  if (viewer.isManager) return {};
  const or: Prisma.CompanyTaskWhereInput[] = [
    { assignedToId: viewer.userId },
    { createdById: viewer.userId },
    { checklist: { some: { assignedToId: viewer.userId } } },
    { department: null },
  ];
  if (viewer.departments.length > 0) or.push({ department: { in: viewer.departments } });
  return { OR: or };
}

/** Görev listesi için birleşik `where`: kapsam + girişim dışlama + ek filtreler (AND). */
export function scopedTaskWhere(
  viewer: TeamViewer,
  ...extra: Array<Prisma.CompanyTaskWhereInput | null | undefined | false>
): Prisma.CompanyTaskWhereInput {
  const and: Prisma.CompanyTaskWhereInput[] = [NOT_INITIATIVE];
  const scope = taskVisibilityWhere(viewer);
  if (Object.keys(scope).length > 0) and.push(scope);
  for (const e of extra) if (e && Object.keys(e).length > 0) and.push(e);
  return { AND: and };
}

/** Tek görevi kapsam içinde bulur; görünmüyorsa (ya da girişimse) 404 — varlığı sızdırmaz. */
export async function findVisibleTask<T extends Prisma.CompanyTaskSelect>(
  viewer: TeamViewer,
  id: string,
  select: T
): Promise<Prisma.CompanyTaskGetPayload<{ select: T }>> {
  const task = await prisma.companyTask.findFirst({ where: scopedTaskWhere(viewer, { id }), select });
  if (!task) throw new ApiError('NOT_FOUND', 'Görev bulunamadı ya da erişimin yok.');
  return task as Prisma.CompanyTaskGetPayload<{ select: T }>;
}

/** Atanacak kişi gerçekten ekip üyesi mi? (ekip dışına görev/e-posta sızmasın) */
export async function assertTeamMember(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const u = await prisma.user.findFirst({
    where: { id: userId, OR: [{ adminTeamRole: { not: null } }, { role: 'ADMIN' }] },
    select: { id: true },
  });
  if (!u) throw new ApiError('VALIDATION', 'Seçilen kişi ekip üyesi değil.');
}

/** Departman slug'ı mevcut ve aktif mi? */
export async function assertDepartment(slug: string | null | undefined): Promise<void> {
  if (!slug) return;
  const d = await prisma.department.findUnique({ where: { slug }, select: { isActive: true } });
  if (!d) throw new ApiError('VALIDATION', 'Seçilen departman bulunamadı.');
  if (!d.isActive) throw new ApiError('VALIDATION', 'Seçilen departman arşivlenmiş.');
}

/** Ekip uçlarının kabul ettiği platform rolleri; asıl karar `requireTeamViewer` ile DB'den. */
export const TEAM_ROUTE_ROLES = ['ADMIN', 'CUSTOMER', 'DEALER', 'STAFF'] as const;
