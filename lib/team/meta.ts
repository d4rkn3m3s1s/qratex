import { prisma } from '@/lib/prisma';
import { NOT_INITIATIVE } from './access';
import { capabilitiesFor, type TeamViewer } from './permissions';

const MEMBER_LIMIT = 500;

/**
 * Departmanlar + ekip üyeleri + görüntüleyici yetenekleri. Hem `/api/admin/team/departments`
 * GET hem sunucu sayfası (ilk boyama) kullanır. Üyeler yalnız ad/avatar görür; e-posta yalnız
 * yöneticiye döner. Silinmiş departmanın bayat slug'ı üyede gösterilmez.
 */
export async function loadTeamMeta(viewer: TeamViewer) {
  const [departments, memberCounts, openCounts, members] = await Promise.all([
    prisma.department.findMany({
      where: viewer.isManager ? {} : { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, slug: true, name: true, description: true, color: true, order: true, isActive: true },
    }),
    prisma.userDepartment.groupBy({ by: ['departmentSlug'], _count: { _all: true } }),
    prisma.companyTask.groupBy({
      by: ['department'],
      where: { AND: [NOT_INITIATIVE, { archivedAt: null, status: { not: 'done' }, department: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { OR: [{ adminTeamRole: { not: null } }, { role: 'ADMIN' }] },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        adminDepartment: true,
        adminTeamRole: true,
        teamDepartments: { select: { departmentSlug: true } },
      },
      orderBy: { name: 'asc' },
      take: MEMBER_LIMIT + 1,
    }),
  ]);

  const known = new Set(departments.map((d) => d.slug));
  const memberCount = new Map(memberCounts.map((r) => [r.departmentSlug, r._count._all]));
  const openCount = new Map(openCounts.map((r) => [r.department ?? '', r._count._all]));

  return {
    viewer: {
      userId: viewer.userId,
      isAdmin: viewer.isAdmin,
      isManager: viewer.isManager,
      teamRole: viewer.teamRole,
      departments: viewer.departments.filter((s) => known.has(s)),
    },
    can: capabilitiesFor(viewer),
    departments: departments.map((d) => ({
      ...d,
      memberCount: memberCount.get(d.slug) ?? 0,
      openTaskCount: openCount.get(d.slug) ?? 0,
    })),
    members: members.slice(0, MEMBER_LIMIT).map((m) => {
      const junction = m.teamDepartments.map((d) => d.departmentSlug);
      const raw = junction.length > 0 ? junction : m.adminDepartment ? [m.adminDepartment] : [];
      return {
        id: m.id,
        name: m.name,
        email: viewer.isManager ? m.email : null,
        image: m.image,
        isAdmin: m.role === 'ADMIN',
        inTeam: !!m.adminTeamRole,
        teamRole: m.adminTeamRole === 'yonetici' || m.adminTeamRole === 'uye' ? (m.adminTeamRole as 'yonetici' | 'uye') : null,
        departmentSlugs: raw.filter((s) => known.has(s)),
        isSelf: m.id === viewer.userId,
      };
    }),
    membersTruncated: members.length > MEMBER_LIMIT,
  };
}
