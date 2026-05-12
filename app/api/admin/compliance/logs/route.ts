import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { maskIpAddress } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

type LogSource = 'AUDIT' | 'CARD_AUDIT' | 'SUSPICIOUS' | 'RUNTIME_GUARD';

type UnifiedLog = {
  id: string;
  source: LogSource;
  action: string;
  entity: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  severity?: string;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || '20')));
    const source = searchParams.get('source'); // all | audit | card | suspicious
    const actionFilter = searchParams.get('action');
    const from = toDate(searchParams.get('from'));
    const to = toDate(searchParams.get('to'));
    const includeSensitive = searchParams.get('includeSensitive') === 'true';

    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const [auditLogs, cardAuditLogs, suspiciousLogs, runtimeGuardLogs] = await Promise.all([
      source === 'all' || source === 'audit' || !source
        ? prisma.auditLog.findMany({
            where: {
              ...createdAtFilter,
              ...(actionFilter ? { action: { contains: actionFilter, mode: 'insensitive' } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
              id: true,
              action: true,
              entity: true,
              userId: true,
              createdAt: true,
              ipAddress: true,
              userAgent: true,
            },
          })
        : Promise.resolve([]),
      source === 'all' || source === 'card' || !source
        ? prisma.cardAuditLog.findMany({
            where: {
              ...createdAtFilter,
              ...(actionFilter ? { action: { contains: actionFilter, mode: 'insensitive' } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
              id: true,
              action: true,
              userId: true,
              createdAt: true,
              ipAddress: true,
              userAgent: true,
            },
          })
        : Promise.resolve([]),
      source === 'all' || source === 'suspicious' || !source
        ? prisma.suspiciousActivity.findMany({
            where: {
              ...createdAtFilter,
              ...(actionFilter ? { type: { contains: actionFilter, mode: 'insensitive' } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
              id: true,
              type: true,
              userId: true,
              createdAt: true,
              ipAddress: true,
              userAgent: true,
              severity: true,
            },
          })
        : Promise.resolve([]),
      source === 'all' || source === 'runtime' || !source
        ? prisma.analyticsEvent.findMany({
            where: {
              ...createdAtFilter,
              AND: [
                { event: { in: ['module_gate_blocked', 'menu_visibility_blocked'] } },
                ...(actionFilter ? [{ event: { contains: actionFilter, mode: 'insensitive' as const } }] : []),
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
              id: true,
              event: true,
              category: true,
              userId: true,
              createdAt: true,
              data: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const userIds = Array.from(
      new Set(
        [...auditLogs, ...cardAuditLogs, ...suspiciousLogs, ...runtimeGuardLogs]
          .map((log) => log.userId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const merged: UnifiedLog[] = [
      ...auditLogs.map((log) => {
        const user = log.userId ? userMap.get(log.userId) : null;
        return {
        id: log.id,
        source: 'AUDIT' as const,
        action: log.action,
        entity: log.entity,
        userId: log.userId,
        userName: user?.name || null,
        userEmail: user?.email || null,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        };
      }),
      ...cardAuditLogs.map((log) => {
        const user = log.userId ? userMap.get(log.userId) : null;
        return {
        id: log.id,
        source: 'CARD_AUDIT' as const,
        action: log.action,
        entity: 'PhysicalCard',
        userId: log.userId || null,
        userName: user?.name || null,
        userEmail: user?.email || null,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        };
      }),
      ...suspiciousLogs.map((log) => {
        const user = log.userId ? userMap.get(log.userId) : null;
        return {
        id: log.id,
        source: 'SUSPICIOUS' as const,
        action: log.type,
        entity: 'Security',
        userId: log.userId || null,
        userName: user?.name || null,
        userEmail: user?.email || null,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        severity: log.severity,
        };
      }),
      ...runtimeGuardLogs.map((log) => {
        const user = log.userId ? userMap.get(log.userId) : null;
        const data = log.data && typeof log.data === 'object' ? (log.data as Record<string, unknown>) : {};
        return {
          id: log.id,
          source: 'RUNTIME_GUARD' as const,
          action: log.event,
          entity: String(data.routeKey ?? log.category),
          userId: log.userId || null,
          userName: user?.name || null,
          userEmail: user?.email || null,
          createdAt: log.createdAt,
          ipAddress: typeof data.ipAddress === 'string' ? data.ipAddress : null,
          userAgent: typeof data.userAgent === 'string' ? data.userAgent : null,
          severity: typeof data.reason === 'string' ? data.reason : 'policy',
        };
      }),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = merged.length;
    const start = (page - 1) * pageSize;
    const paginated = merged.slice(start, start + pageSize).map((log) => ({
      ...log,
      ipAddress: includeSensitive ? log.ipAddress : maskIpAddress(log.ipAddress),
    }));

    return NextResponse.json({
      success: true,
      data: paginated,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Compliance logs error:', error);
    return NextResponse.json({ error: 'Uyum loglari getirilemedi' }, { status: 500 });
  }
}

