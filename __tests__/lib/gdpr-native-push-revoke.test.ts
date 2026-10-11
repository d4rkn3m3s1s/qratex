/** KVKK: anonimleştirme (tek silme yürütücüsü) native push jetonlarını da iptal eder. */
jest.mock('@/lib/prisma', () => ({
  prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock(),
  isPrismaConnectivityError: () => false,
}));
jest.mock('@/lib/r2-storage', () => ({ isR2Configured: () => false, keyFromPublicUrl: () => null, deleteFromR2: jest.fn() }));
const mockRevoke = jest.fn(async () => undefined);
jest.mock('@/lib/push-native-revoke', () => ({ revokeNativePushTokens: (id: string) => mockRevoke(id) }));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';
import { anonymizeUser } from '@/lib/gdpr-core';

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  db.__reset();
  mockRevoke.mockClear();
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('anonymizeUser → native push iptali', () => {
  it('anonimleştirmede kullanıcının native jetonları iptal edilir', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null });
    const res = await anonymizeUser('u-1', { reason: 'self_service' });
    expect(res.alreadyAnonymized).toBe(false);
    expect(mockRevoke).toHaveBeenCalledWith('u-1');
  });

  it('zaten anonim kullanıcıda tekrar çağrılmaz', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: new Date() });
    await anonymizeUser('u-1');
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('iptal hatası anonimleştirmeyi bozmaz', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null });
    mockRevoke.mockRejectedValueOnce(new Error('db'));
    await expect(anonymizeUser('u-1')).resolves.toMatchObject({ anonymized: true });
  });
});
