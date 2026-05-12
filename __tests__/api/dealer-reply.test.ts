/**
 * API dealer feedback reply endpoint tests (TASK-11).
 * POST /api/dealer/feedbacks/[id]/reply: auth and validation with mocked requireAuth.
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFeedbackFindUnique = jest.fn();
const mockFeedbackUpdate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findUnique: (...args: unknown[]) => mockFeedbackFindUnique(...args),
      update: (...args: unknown[]) => mockFeedbackUpdate(...args),
    },
  },
}));

async function postDealerReply(id: string, body: unknown) {
  const { POST } = await import('@/app/api/dealer/feedbacks/[id]/reply/route');
  const req = new NextRequest('http://localhost/api/dealer/feedbacks/' + id + '/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe('POST /api/dealer/feedbacks/[id]/reply', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    mockFeedbackFindUnique.mockReset();
    mockFeedbackUpdate.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Giriş yapmalısınız' }, { status: 401 }),
    });
    const res = await postDealerReply('fb-1', { reply: 'Teşekkürler.' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when reply is empty', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      session: { user: { id: 'user-1', role: 'DEALER' } },
    });
    const res = await postDealerReply('fb-1', { reply: '' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 400 when reply is missing', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      session: { user: { id: 'user-1', role: 'DEALER' } },
    });
    const res = await postDealerReply('fb-1', {});
    expect(res.status).toBe(400);
  });

  it('returns 404 when feedback does not exist', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      session: { user: { id: 'user-1', role: 'DEALER' } },
    });
    mockFeedbackFindUnique.mockResolvedValueOnce(null);
    const res = await postDealerReply('non-existent', { reply: 'Teşekkürler.' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/bulunamadı/i);
  });
});
