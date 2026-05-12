/**
 * API notifications endpoint tests.
 * GET/PATCH/DELETE /api/notifications
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/prisma', () => ({
    prisma: {
        notification: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
            count: (...args: unknown[]) => mockCount(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
            delete: (...args: unknown[]) => mockDelete(...args),
        },
    },
}));

const SESSION = { session: { user: { id: 'user-1', role: 'CUSTOMER' } } };
const AUTH_ERROR = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

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
    beforeEach(() => { jest.clearAllMocks(); });

    it('returns 401 when not authenticated', async () => {
        mockRequireAuth.mockResolvedValueOnce(AUTH_ERROR);
        const res = await getNotifications();
        expect(res.status).toBe(401);
    });

    it('returns notifications and unread count', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockFindMany.mockResolvedValueOnce([
            { id: 'n1', title: 'Test', message: 'Hello', type: 'info', isRead: false },
        ]);
        mockCount.mockResolvedValueOnce(1);
        const res = await getNotifications();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.notifications).toHaveLength(1);
        expect(data.unreadCount).toBe(1);
    });
});

describe('PATCH /api/notifications', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('marks single notification as read', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockUpdate.mockResolvedValueOnce({ id: 'n1', isRead: true });
        const res = await patchNotification({ notificationId: 'n1' });
        expect(res.status).toBe(200);
    });

    it('marks all notifications as read', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockUpdateMany.mockResolvedValueOnce({ count: 5 });
        const res = await patchNotification({ markAllRead: true });
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/notifications', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('returns 401 when not authenticated', async () => {
        mockRequireAuth.mockResolvedValueOnce(AUTH_ERROR);
        const res = await deleteNotification('n1');
        expect(res.status).toBe(401);
    });

    it('deletes notification successfully', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockDelete.mockResolvedValueOnce({ id: 'n1' });
        const res = await deleteNotification('n1');
        expect(res.status).toBe(200);
    });
});
