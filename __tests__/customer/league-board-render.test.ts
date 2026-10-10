/**
 * Oyna → Lig istemci adası — sunucu render dumanı (DOM yok). Gerçek DTO ile:
 *  - h1 tek, podyum DOM sırası 1-2-3 (görsel 2-1-3 CSS `order` ile),
 *  - "Sen" işareti, gizli mod rozeti, maskeli ad,
 *  - boş dönemde dürüst boş durum + gerçek CTA, 1-2 kişilik podyumda boş basamak.
 */
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LeagueBoardDTO, LeagueRowDTO } from '@/lib/league-board/types';
import { AppLocaleProvider } from '@/lib/app-locale';
import { LeagueBoard } from '@/components/customer/m-lig/league-board';

const row = (rank: number, name: string, isMe = false, extra: Partial<LeagueRowDTO> = {}): LeagueRowDTO => ({
  key: `lb_${rank}`,
  rank,
  name,
  image: null,
  level: 4,
  leagueKey: 'KOR',
  leagueName: 'Kor',
  score: 1000 - rank * 10,
  isMe,
  ...extra,
});

function board(over: Partial<LeagueBoardDTO> = {}): LeagueBoardDTO {
  const rows = [row(1, 'Ayşe K.'), row(2, 'Mehmet D.'), row(3, 'Zeynep A.'), row(4, 'Furkan Ulu', true, { hiddenFromOthers: true }), row(5, 'Can B.')];
  return {
    category: 'points',
    period: 'week',
    window: { key: 'W2026-10-05', startsAt: '2026-10-04T21:00:00.000Z', endsAt: '2026-10-11T21:00:00.000Z', seasonNumber: null },
    podium: rows.slice(0, 3),
    rows,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    total: 5,
    truncated: false,
    me: {
      key: 'lb_4',
      name: 'Furkan Ulu',
      image: null,
      level: 4,
      points: 4000,
      league: { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000 },
      nextLeague: { key: 'VEYRA', name: 'Veyra', minPoints: 5001, pointsNeeded: 1001 },
      leagueProgress: 49,
      score: 960,
      rank: 4,
      rankFloor: null,
      page: 1,
      gapToNext: 11,
      gapToTop10: null,
      visibleToOthers: false,
    },
    lastWeekPodium: [row(1, 'Ayşe K.')],
    generatedAt: '2026-10-10T09:00:00.000Z',
    ...over,
  };
}

function render(b: LeagueBoardDTO) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        AppLocaleProvider,
        null,
        createElement(LeagueBoard, { initial: b, initialParams: { category: b.category, period: b.period, page: b.page } })
      )
    )
  );
}

describe('LeagueBoard (SSR)', () => {
  it('kahraman, podyum, liste ve gizlilik', () => {
    const html = render(board());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Kor ligi');
    expect(html).toContain('Veyra ligine');
    expect(html).toContain('3. sıraya çıkmak için 11 puan');
    // Podyum DOM sırası 1-2-3
    const i1 = html.indexOf('1. sıra, Ayşe K.');
    const i2 = html.indexOf('2. sıra, Mehmet D.');
    const i3 = html.indexOf('3. sıra, Zeynep A.');
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
    // Listede podyum tekrarlanmaz; kendi satırın işaretli
    expect(html).toContain('4. sıra, Furkan Ulu (sen)');
    expect(html).toContain('id="lig-me"');
    expect(html).toContain('Gizli');
    expect(html).toContain('Sıralamada görün');
    expect(html).toContain('Geçen haftanın ilk üçü');
  });

  it('boş dönem: dürüst boş durum ve gerçek CTA', () => {
    const html = render(
      board({
        podium: [],
        rows: [],
        total: 0,
        me: { ...board().me, rank: null, page: null, gapToNext: null, score: 0 },
        lastWeekPodium: [],
      })
    );
    expect(html).toContain('Bu dönemde henüz kimse sıralamada değil');
    expect(html).toContain('href="/customer/games"');
    expect(html).toContain('Henüz sıralamada değilsin');
  });

  it('iki kişilik dönemde podyum görünür, boş basamak dürüst', () => {
    const two = [row(1, 'Ayşe K.'), row(2, 'Mehmet D.')];
    const html = render(board({ podium: two, rows: two, total: 2, me: { ...board().me, rank: null, page: null, gapToNext: null } }));
    expect(html).toContain('2. sıra, Mehmet D.');
    expect(html).toContain('Bu basamak boş');
  });
});
