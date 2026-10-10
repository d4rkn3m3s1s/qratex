jest.mock('@/lib/team/access', () => ({ NOT_INITIATIVE: { NOT: { kind: 'initiative' } } }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    department: { findMany: jest.fn() },
    userDepartment: { groupBy: jest.fn() },
    companyTask: { groupBy: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { loadTeamMeta } from '@/lib/team/meta';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;

function viewer(isManager: boolean) {
  return { userId: 'u1', name: 'A', role: 'ADMIN', isAdmin: isManager, isManager, teamRole: isManager ? 'yonetici' : 'uye', departments: ['ops', 'gone'], primaryDepartment: 'ops' } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  p.department.findMany.mockResolvedValue([{ id: 'd1', slug: 'ops', name: 'Ops', description: null, color: 'blue', order: 0, isActive: true }]);
  p.userDepartment.groupBy.mockResolvedValue([{ departmentSlug: 'ops', _count: { _all: 2 } }]);
  p.companyTask.groupBy.mockResolvedValue([{ department: 'ops', _count: { _all: 5 } }]);
  p.user.findMany.mockResolvedValue([
    { id: 'u1', name: 'A', email: 'a@x.co', image: null, role: 'ADMIN', adminDepartment: null, adminTeamRole: 'yonetici', teamDepartments: [{ departmentSlug: 'ops' }, { departmentSlug: 'gone' }] },
    { id: 'u2', name: 'B', email: 'b@x.co', image: null, role: 'STAFF', adminDepartment: 'gone', adminTeamRole: 'uye', teamDepartments: [] },
  ]);
});

describe('loadTeamMeta', () => {
  it('yönetici e-postaları görür; sayılar gerçek gruplamadan gelir', async () => {
    const r = await loadTeamMeta(viewer(true));
    expect(r.departments[0]).toMatchObject({ memberCount: 2, openTaskCount: 5 });
    expect(r.members[0].email).toBe('a@x.co');
    expect(r.members[0].isSelf).toBe(true);
    expect(r.membersTruncated).toBe(false);
  });

  it('üye e-posta görmez, pasif departmanlar filtrelenir, hayalet slug gizlenir', async () => {
    const r = await loadTeamMeta(viewer(false));
    expect(p.department.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    expect(r.members.every((m) => m.email === null)).toBe(true);
    expect(r.members[0].departmentSlugs).toEqual(['ops']);
    expect(r.members[1].departmentSlugs).toEqual([]);
    expect(r.viewer.departments).toEqual(['ops']);
  });
});
