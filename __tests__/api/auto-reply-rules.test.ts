/**
 * API dealer auto-reply rules tests.
 * GET/POST /api/dealer/auto-reply-rules
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/prisma', () => ({
    prisma: {
        autoReplyRule: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
            count: (...args: unknown[]) => mockCount(...args),
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            delete: (...args: unknown[]) => mockDelete(...args),
        },
    },
}));

const SESSION = { session: { user: { id: 'dealer-1', role: 'DEALER' } } };
const AUTH_ERROR = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

async function getAutoReplyRules() {
    const { GET } = await import('@/app/api/dealer/auto-reply-rules/route');
    return GET();
}

async function postAutoReplyRule(body: unknown) {
    const { POST } = await import('@/app/api/dealer/auto-reply-rules/route');
    const req = new NextRequest('http://localhost/api/dealer/auto-reply-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return POST(req);
}

describe('GET /api/dealer/auto-reply-rules', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('returns 401 when not authenticated', async () => {
        mockRequireAuth.mockResolvedValueOnce(AUTH_ERROR);
        const res = await getAutoReplyRules();
        expect(res.status).toBe(401);
    });

    it('returns rules for authenticated dealer', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockFindMany.mockResolvedValueOnce([
            { id: 'r1', name: 'Low rating', isActive: true, priority: 0 },
        ]);
        const res = await getAutoReplyRules();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.rules).toHaveLength(1);
    });
});

describe('POST /api/dealer/auto-reply-rules', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('returns 400 for invalid body', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        const res = await postAutoReplyRule({ name: '' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when 20-rule limit reached', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockCount.mockResolvedValueOnce(20);
        const res = await postAutoReplyRule({
            name: 'Test',
            condition: { field: 'rating', op: 'lte', value: 2 },
            template: 'Thanks',
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/20/);
    });

    it('creates rule successfully', async () => {
        mockRequireAuth.mockResolvedValueOnce(SESSION);
        mockCount.mockResolvedValueOnce(0);
        mockCreate.mockResolvedValueOnce({ id: 'r1', name: 'Test' });
        const res = await postAutoReplyRule({
            name: 'Test',
            condition: { field: 'rating', op: 'lte', value: 2 },
            template: 'Thanks for your feedback',
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
    });
});
