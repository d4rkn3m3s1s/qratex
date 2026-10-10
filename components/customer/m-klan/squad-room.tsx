'use client';

import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/states';
import type { SquadOverview } from '@/lib/squads/dto';
import { squadApi, squadKeys, SquadApiError } from './api';
import { useKlanCopy } from './copy';
import { MemberRoom } from './member-room';
import { NoSquadView } from './no-squad-view';

/**
 * Klan yüzeyinin istemci adası. İlk veri sunucuda üretilir (SSR, `initial`); burada yalnız
 * yenilenir. Sunucu verisi gelmediyse (DB hatası) hata durumu + yeniden dene — "200 + boş"
 * gibi davranılmaz.
 */
export function SquadRoom({ initial, joinCode }: { initial: SquadOverview | null; joinCode?: string }) {
  const copy = useKlanCopy();
  const q = useQuery({
    queryKey: squadKeys.overview,
    queryFn: squadApi.overview,
    initialData: initial ?? undefined,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof SquadApiError && err.status > 0 && err.status < 500) && count < 2,
  });
  const forbidden = q.error instanceof SquadApiError && q.error.code === 'MODULE_DISABLED';
  return (
    <QueryState
      query={q}
      skeleton="cards"
      isEmpty={() => false}
      errorKind={forbidden ? 'moduleDisabled' : undefined}
      error={{ title: forbidden ? copy.moduleOff : copy.loadError }}
    >
      {(data) =>
        data.state === 'none' ? <NoSquadView data={data} joinCode={joinCode} /> : <MemberRoom data={data} joinCode={joinCode} />
      }
    </QueryState>
  );
}
