/**
 * API feedbacks endpoint tests (TASK-11).
 * POST /api/feedbacks: validation and QR-not-found with mocked prisma/session.
 */
import { NextRequest } from 'next/server';

const mockFindUnique = jest.fn();
const mockIdempotencyFindUnique = jest.fn().mockResolvedValue(null);
jest.mock('@/lib/prisma', () => ({
  prisma: {
    qRCode: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    idempotencyKey: { findUnique: (...args: unknown[]) => mockIdempotencyFindUnique(...args) },
    // DB-backed rate limiter: create başarılı → ilk istek "ok" (limit dolmaz).
    rateLimitCounter: {
      create: jest.fn().mockResolvedValue({ bucket: 'x', count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(() => Promise.resolve(null)),
}));

async function postFeedbacks(body: unknown) {
  const { POST } = await import('@/app/api/feedbacks/route');
  const req = new NextRequest('http://localhost/api/feedbacks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/feedbacks', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('returns 400 when qrCodeId is missing', async () => {
    const res = await postFeedbacks({ rating: 5 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 400 when rating is missing', async () => {
    const res = await postFeedbacks({ qrCodeId: 'some-id' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 400 when rating is out of range', async () => {
    const res = await postFeedbacks({ qrCodeId: 'some-id', rating: 0 });
    expect(res.status).toBe(400);
    const res2 = await postFeedbacks({ qrCodeId: 'some-id', rating: 6 });
    expect(res2.status).toBe(400);
  });

  it('returns 404 when QR code does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await postFeedbacks({ qrCodeId: 'non-existent-qr', rating: 5 });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toMatch(/bulunamadı/i);
  });

  it('returns 404 when QR code is inactive', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'qr1',
      isActive: false,
      expiresAt: null,
      revokedAt: null,
    });
    const res = await postFeedbacks({ qrCodeId: 'qr1', rating: 5 });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toMatch(/aktif değil/i);
  });
});
