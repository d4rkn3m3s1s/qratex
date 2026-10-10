/**
 * Ben → Davet istemci adası — sunucu render dumanı (DOM yok), gerçek okuma modeli DTO'su ile:
 *  - tek h1; kod harf harf okunur etiketli; kademe ilerlemesi role=progressbar + aria-valuetext,
 *  - PENDING satırında adım göstergesi (Kaydoldu → E-posta → İlk QR) + "Hatırlat" eylemi,
 *  - kod uygulama yalnız pencere açıkken, limitler gerçek sayılarla,
 *  - modül kapalıyken sıfırlı içerik değil, "modül kapalı" durumu.
 */
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLocaleProvider } from '@/lib/app-locale';
import type { InviteOverview } from '@/lib/referral-invite';
import { InviteExperience } from '@/components/customer/m-davet/invite-experience';
import { InviteBlocked } from '@/components/customer/m-davet/invite-closed';

function overview(over: Partial<InviteOverview> = {}): InviteOverview {
  return {
    code: '7KQ2M9XA',
    codeActive: true,
    rewards: { referrerPoints: 1000, referredPoints: 500 },
    counts: { total: 4, completed: 3, pending: 1, expired: 0 },
    earnings: { perInvite: 3000, milestones: 0, total: 3000 },
    milestones: {
      stops: [
        { count: 3, points: 200, state: 'claimable', remaining: 0 },
        { count: 5, points: 400, state: 'locked', remaining: 2 },
        { count: 10, points: 1000, state: 'locked', remaining: 7 },
        { count: 25, points: 3000, state: 'locked', remaining: 22 },
      ],
      claimablePoints: 200,
      next: { count: 5, points: 400, remaining: 2 },
      completed: 3,
    },
    limits: {
      lifetime: { used: 4, max: 100 },
      monthly: { used: 2, max: 30, resetsAt: '2026-10-31T21:00:00.000Z' },
      codeUsage: null,
      pendingTtlDays: 30,
      applyWindowDays: 7,
      nudgeCooldownHours: 72,
    },
    referredBy: null,
    apply: { canApply: true, windowEndsAt: '2026-10-14T09:00:00.000Z', blockedBy: null },
    referrals: {
      rows: [
        {
          id: 'r1',
          name: 'Bora Y.',
          initials: 'BY',
          status: 'PENDING',
          createdAt: '2026-10-08T09:00:00.000Z',
          completedAt: null,
          expiresAt: '2026-11-07T09:00:00.000Z',
          pointsEarned: 0,
          steps: { verified: true, firstQr: false },
          action: 'nudge',
          nudgeBlockedBy: null,
          nudgeAvailableAt: null,
        },
        {
          id: 'r2',
          name: 'Ayşe K.',
          initials: 'AK',
          status: 'COMPLETED',
          createdAt: '2026-10-01T09:00:00.000Z',
          completedAt: '2026-10-02T09:00:00.000Z',
          expiresAt: null,
          pointsEarned: 1000,
          steps: { verified: true, firstQr: true },
          action: null,
          nudgeBlockedBy: null,
          nudgeAvailableAt: null,
        },
      ],
      nextCursor: 'abc',
    },
    generatedAt: '2026-10-10T09:00:00.000Z',
    ...over,
  };
}

function render(node: ReturnType<typeof createElement>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(createElement(QueryClientProvider, { client: qc }, createElement(AppLocaleProvider, null, node)));
}

describe('InviteExperience (SSR)', () => {
  it('tam sayfa: tek h1, kod etiketi, ilerleme ARIA, adımlar, eylemler, limitler', () => {
    const html = render(createElement(InviteExperience, { initial: overview(), siteName: 'QRateX' }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Arkadaşını davet et');
    expect(html).toContain('aria-label="Davet kodun: 7 K Q 2 M 9 X A"');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="3"/);
    expect(html).toContain('Kademe ödülünü al (+200)');
    expect(html).toContain('2 başarılı davet daha → +400 puan');
    // Bekleyen satır: adım göstergesi + hatırlat; tamamlanan satır: kazanç
    expect(html).toContain('E-postasını doğruladı');
    expect(html).toContain('İlk QR deneyimi');
    expect(html).toContain('Hatırlat');
    expect(html).toContain('+1.000 puan');
    expect(html).toContain('Daha fazla göster');
    // Kod uygulama penceresi açık; limitler gerçek sayılar
    expect(html).toContain('Arkadaşının davet kodu');
    expect(html).toContain('Kodunla bu ay 2/30 kayıt');
    expect(html).toContain('Toplam davet hakkın: 4/100 kullanıldı');
    // Gerçek kazanç
    expect(html).toContain('3.000');
    // Ham kişisel veri yok
    expect(html).not.toMatch(/@|<img/);
  });

  it('pencere kapalı → kod uygulama kartı yok; davet yoksa dürüst boş durum + paylaş', () => {
    const html = render(
      createElement(InviteExperience, {
        initial: overview({
          apply: { canApply: false, windowEndsAt: null, blockedBy: 'WINDOW_EXPIRED' },
          referrals: { rows: [], nextCursor: null },
          counts: { total: 0, completed: 0, pending: 0, expired: 0 },
        }),
        siteName: 'QRateX',
      })
    );
    expect(html).not.toContain('Arkadaşının davet kodu');
    expect(html).toContain('Henüz kimseyi davet etmedin');
  });

  it('beni davet eden (PENDING) → kendi adımlarım + QR okut', () => {
    const html = render(
      createElement(InviteExperience, {
        initial: overview({
          referredBy: {
            name: 'Ayşe K.',
            status: 'PENDING',
            expiresAt: '2026-11-07T09:00:00.000Z',
            bonusPoints: 500,
            steps: { verified: true, firstQr: false },
          },
          apply: { canApply: false, windowEndsAt: null, blockedBy: 'ALREADY_REFERRED' },
        }),
        siteName: 'QRateX',
      })
    );
    expect(html).toContain('Seni Ayşe K. davet etti.');
    expect(html).toContain('İlk QR deneyimini tamamla, +500 puan hesabına geçsin.');
    expect(html).toContain('href="/customer/scan"');
  });

  it('modül kapalı → sıfırlı içerik değil, kapalı durumu', () => {
    const html = render(createElement(InviteBlocked, { kind: 'moduleDisabled' }));
    expect(html).toContain('Davet programı şu anda kapalı.');
    expect(html).not.toContain('Davet kodun');
  });
});
