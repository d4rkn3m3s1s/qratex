/**
 * API notifications endpoint tests.
 * GET/PATCH/DELETE /api/notifications
 */
import { NextRequest, NextResponse } from 'next/server';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
    __esModule: true,
    getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
    authOptions: {},
}));

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockUpdateMany = jest.fn();
const mockDeleteMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
    prisma: {
        notification: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
            count: (...args: unknown[]) => mockCount(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
            deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
        },
    },
    isPrismaConnectivityError: () => false,
}));

const SESSION = { user: { id: 'user-1', role: 'CUSTOMER' } };

async function getNotifications(limit = 10) {
    const { GET } = await import('@/app/api/notifications/route');
    const req = new NextRequest(`http://localhost/api/notifications?limit=${limit}`);
    return GET(req);
}

async function patchNotification(body: unknown) {
    const { PATCH } = await import('@/app/api/notifications/route');
    const req = new NextRequest('http://localhost/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return PATCH(req);
}

async function deleteNotification(id: string) {
    const { DELETE } = await import('@/app/api/notifications/route');
    const req = new NextRequest(`http://localhost/api/notifications?id=${id}`, {
        method: 'DELETE',
    });
    return DELETE(req);
}

describe('GET /api/notifications', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        mockGetServerSession.mockResolvedValueOnce(null);
        const res = await getNotifications();
        expect(res.status).toBe(401);
    });

    it('returns notifications and unread count', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockFindMany.mockResolvedValueOnce([
            {
                id: 'n1',
                title: 'Test',
                message: 'Hello',
                type: 'info',
                isRead: false,
                data: null,
                createdAt: new Date('2025-01-01T12:00:00.000Z'),
            },
        ]);
        mockCount.mockResolvedValueOnce(1);
        const res = await getNotifications();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.notifications).toHaveLength(1);
        expect(data.unreadCount).toBe(1);
        expect(data.notifications[0].createdAt).toBe('2025-01-01T12:00:00.000Z');
        expect(data.notifications[0].userId).toBeUndefined();
        expect(data.notifications[0].readAt).toBeUndefined();
        expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('sanitizes notification data and drops unknown keys', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockFindMany.mockResolvedValueOnce([
            {
                id: 'n2',
                title: 'Telafi',
                message: 'M',
                type: 'info',
                isRead: true,
                data: {
                    type: 'remedy_campaign',
                    remedyOfferId: 'offer-1',
                    feedbackId: 'fb-1',
                    internalSecret: 'should-not-appear',
                },
                createdAt: new Date('2025-01-02T12:00:00.000Z'),
            },
        ]);
        mockCount.mockResolvedValueOnce(0);
        const res = await getNotifications();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.notifications[0].data).toEqual({
            type: 'remedy_campaign',
            remedyOfferId: 'offer-1',
            feedbackId: 'fb-1',
        });
        expect(data.notifications[0].data.internalSecret).toBeUndefined();
    });

    it('clamps limit above max', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockFindMany.mockResolvedValueOnce([]);
        mockCount.mockResolvedValueOnce(0);
        await getNotifications(9999);
        expect(mockFindMany).toHaveBeenCalled();
        const arg = mockFindMany.mock.calls[0][0] as { take: number };
        expect(arg.take).toBe(50);
    });
});

describe('PATCH /api/notifications', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('marks single notification as read', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockUpdateMany.mockResolvedValueOnce({ count: 1 });
        const res = await patchNotification({ notificationId: 'n1' });
        expect(res.status).toBe(200);
    });

    it('marks all notifications as read', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockUpdateMany.mockResolvedValueOnce({ count: 5 });
        const res = await patchNotification({ markAllRead: true });
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/notifications', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        mockGetServerSession.mockResolvedValueOnce(null);
        const res = await deleteNotification('n1');
        expect(res.status).toBe(401);
    });

    it('deletes notification successfully', async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION);
        mockDeleteMany.mockResolvedValueOnce({ count: 1 });
        const res = await deleteNotification('n1');
        expect(res.status).toBe(200);
    });
});
