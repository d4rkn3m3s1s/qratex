/**
 * Segment Aksiyon Merkezi SÖZLEŞME testi (P0-39 bayi: "segment aksiyonlarının 4/5 butonu 400").
 *
 * Eski mantık testi yalnız endpoint ADRESİNİ doğruluyordu; sayfa her uca `{segment, source}`
 * gönderdiği için Uyuyan/VIP/Sadık/Yeni butonları her zaman 400 alıyordu. Burada istemcinin
 * kurduğu gövde (lib/dealer/segment-action-requests.ts) GERÇEK route handler'larına verilir:
 * önce eski gövdenin 400 aldığı yeniden üretilir, sonra yeni gövdenin kabul edildiği gösterilir.
 * Prisma/oturum mock'lanır; gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';
import { actionForSegment } from '@/lib/segment-action-center';
import {
  buildProposalRequest,
  buildRiskOfferRequest,
  buildWinBackRequests,
  describeSendResult,
  readRiskOfferResult,
  readWinBackCandidateIds,
  readWinBackSentCount,
  resolveActionKind,
  WIN_BACK_POST_CHUNK,
  type ActionRequest,
} from '@/lib/dealer/segment-action-requests';

const DEALER_SESSION = { user: { id: 'dealer-1', role: 'DEALER', name: 'Kafe' } };

const mockGetServerSession = jest.fn();
jest.mock('next-auth/next', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: DEALER_SESSION })),
  requireDealerResource: jest.fn(() => null),
}));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn(async () => ({ features: { segmentProposals: true } })),
}));

const mockConsumptionFindMany = jest.fn();
const mockNotificationCreateMany = jest.fn();
const mockNotificationCreate = jest.fn();
const mockProposalCreate = jest.fn();
const mockFeedbackFindMany = jest.fn();
const mockAnalyticsCreate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    consumption: { findMany: (...a: unknown[]) => mockConsumptionFindMany(...a) },
    notification: {
      createMany: (...a: unknown[]) => mockNotificationCreateMany(...a),
      create: (...a: unknown[]) => mockNotificationCreate(...a),
    },
    segmentCampaignProposal: { create: (...a: unknown[]) => mockProposalCreate(...a) },
    feedback: { findMany: (...a: unknown[]) => mockFeedbackFindMany(...a) },
    analyticsEvent: { create: (...a: unknown[]) => mockAnalyticsCreate(...a) },
  },
  isPrismaConnectivityError: () => false,
}));

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function call(req: ActionRequest | { url: string; body: unknown }) {
  if (req.url === '/api/dealer/win-back') {
    const { POST } = await import('@/app/api/dealer/win-back/route');
    return POST(post(req.url, req.body));
  }
  if (req.url === '/api/dealer/innovation/segment-proposals') {
    const { POST } = await import('@/app/api/dealer/innovation/segment-proposals/route');
    return POST(post(req.url, req.body));
  }
  if (req.url === '/api/dealer/campaigns/risk-segment') {
    const { POST } = await import('@/app/api/dealer/campaigns/risk-segment/route');
    return POST(post(req.url, req.body));
  }
  throw new Error(`bilinmeyen uç ${req.url}`);
}

const LEGACY_BODY = { segment: 'Uyuyan', source: 'segment-action-center' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue(DEALER_SESSION);
  mockConsumptionFindMany.mockImplementation(async ({ where }: { where: { customerId: { in: string[] } } }) =>
    where.customerId.in.map((customerId) => ({ customerId })),
  );
  mockNotificationCreateMany.mockResolvedValue({ count: 1 });
  mockProposalCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'p1', ...data }));
  mockFeedbackFindMany.mockResolvedValue([{ id: 'f1', userId: 'u1' }, { id: 'f2', userId: 'u1' }, { id: 'f3', userId: 'u2' }]);
  mockNotificationCreate.mockResolvedValue({});
  mockAnalyticsCreate.mockResolvedValue({});
});

describe('HATA SENARYOSU (yeniden üretim): eski {segment, source} gövdesi', () => {
  it('win-back → 400 "No users selected"', async () => {
    const res = await call({ url: '/api/dealer/win-back', body: LEGACY_BODY });
    expect(res.status).toBe(400);
  });

  it('segment-proposals (VIP/Sadık/Yeni) → 400', async () => {
    const res = await call({ url: '/api/dealer/innovation/segment-proposals', body: LEGACY_BODY });
    expect(res.status).toBe(400);
  });
});

describe('YENİ sözleşme: her segmentin aksiyonu kendi ucunda kabul edilir', () => {
  it('her segment aksiyonunun bir tipi var ve tip uca karşılık geliyor', () => {
    const expected: Record<string, string> = {
      'Risk Altında': 'risk_offer',
      Uyuyan: 'win_back',
      VIP: 'segment_proposal',
      'Sadık': 'segment_proposal',
      Yeni: 'segment_proposal',
    };
    for (const [name, kind] of Object.entries(expected)) {
      const a = actionForSegment(name, 3, 0.4)!;
      expect(a.kind).toBe(kind);
      expect(resolveActionKind(a)).toBe(kind);
      // tip ile eski endpoint alanı tutarlı (geriye uyum)
      expect(resolveActionKind({ endpoint: a.endpoint })).toBe(kind);
      if (kind === 'segment_proposal') expect(a.effect).toBe('draft');
      else expect(a.effect).toBe('send');
    }
  });

  it('Risk Altında → risk-segment 200 + gerçek gönderim sayısı', async () => {
    const res = await call(buildRiskOfferRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(readRiskOfferResult(data)).toEqual({ sent: 2, eligible: 3 });
    expect(mockFeedbackFindMany.mock.calls[0][0].take).toBe(50);
  });

  it('Uyuyan → win-back 200; 230 alıcı 100\'lük 3 isteğe bölünür, hepsi kabul edilir', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `c${i}`);
    const reqs = buildWinBackRequests([...ids, 'c1', ''], 'dessert_on_us');
    expect(reqs).toHaveLength(3);
    expect((reqs[0].body.userIds as string[]).length).toBe(WIN_BACK_POST_CHUNK);
    expect((reqs[2].body.userIds as string[]).length).toBe(30);
    let sent = 0;
    for (const r of reqs) {
      const res = await call(r);
      expect(res.status).toBe(200);
      sent += readWinBackSentCount(await res.json(), 0);
    }
    expect(sent).toBe(230);
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(3);
  });

  it('win-back: geçersiz teklif varsayılana düşer (400 yerine geçerli istek)', async () => {
    const [req] = buildWinBackRequests(['c1'], 'hack');
    expect(req.body.offerType).toBe('free_coffee');
    expect((await call(req)).status).toBe(200);
  });

  it.each(['VIP', 'Sadık', 'Yeni'])('%s → segment-proposals 200 ve PENDING taslak', async (name) => {
    const a = actionForSegment(name, 4, null)!;
    const res = await call(buildProposalRequest(a.proposalSegmentKey!));
    expect(res.status).toBe(200);
    expect(mockProposalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ dealerId: 'dealer-1', segmentKey: a.proposalSegmentKey, status: 'PENDING' }),
    });
  });
});

describe('yanıt okuma yardımcıları', () => {
  it('readWinBackSentCount: sent alanı > mesajdaki sayı > yedek', () => {
    expect(readWinBackSentCount({ sent: 7, message: '9 kullanıcı' }, 1)).toBe(7);
    expect(readWinBackSentCount({ message: '12 kullanıcıya win-back kampanyası gönderildi.' }, 1)).toBe(12);
    expect(readWinBackSentCount({}, 5)).toBe(5);
  });

  it('readWinBackCandidateIds yalnız string id alır', () => {
    expect(readWinBackCandidateIds({ data: [{ id: 'a' }, { id: 3 }, null, { id: 'b' }] })).toEqual(['a', 'b']);
    expect(readWinBackCandidateIds(null)).toEqual([]);
  });

  it('SAHTE BAŞARI biter: 0 gönderim "başarılı" görünmez', () => {
    expect(describeSendResult(0).tone).toBe('info');
    expect(describeSendResult(3)).toEqual({ tone: 'success', message: '3 müşteriye bildirim gönderildi.' });
  });

  it('buildProposalRequest geçersiz anahtarı reddeder', () => {
    expect(() => buildProposalRequest('vip' as never)).toThrow();
  });
});
