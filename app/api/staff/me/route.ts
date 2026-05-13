import { NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const session = auth.session;
  const dealerId = getStaffDealerId(session);
  if (dealerId instanceof NextResponse) return dealerId;
  const userId = session.user.id;

  const [profile, tasks, shifts, leaveRequests, modules, completions, checklists] = await Promise.all([
    prisma.dealerStaff.findUnique({
      where: { userId },
      select: { jobTitle: true, pinCode: true, dealer: { select: { name: true, businessName: true } } },
    }),
    prisma.staffTask.findMany({
      where: { assignedTo: userId, status: { not: 'cancelled' } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 20,
    }),
    prisma.staffShift.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 14,
    }),
    prisma.staffLeaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.trainingModule.findMany({
      where: { OR: [{ dealerId }, { dealerId: null }], isActive: true },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, title: true, description: true, orderIndex: true },
      take: 80,
    }),
    prisma.staffTrainingCompletion.findMany({
      where: { userId },
      select: { moduleId: true },
      take: 200,
    }),
    prisma.checklistTemplate.findMany({
      where: { dealerId, isActive: true },
      select: { id: true, type: true, title: true },
      take: 60,
    }),
  ]);

  const completedModuleIds = new Set(completions.map((c) => c.moduleId));

  return NextResponse.json({
    success: true,
    profile,
    tasks,
    shifts,
    leaveRequests,
    trainingModules: modules.map((m) => ({
      ...m,
      completed: completedModuleIds.has(m.id),
    })),
    checklistTemplates: checklists,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/me GET:', error);
    return NextResponse.json(
      { error: 'Profil yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
