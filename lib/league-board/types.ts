/**
 * Lig sıralaması yanıt sözleşmesi (sunucu ↔ istemci). Saf tipler; istemciden de içe aktarılabilir.
 * Ham kullanıcı id'si, e-posta, fraud sinyali (`needsReview`/`fraudStatus`) ASLA yoktur.
 */
import type { LeagueCategory, LeaguePeriod } from './periods';

export type LeagueRowDTO = {
  /** Opak, kararlı anahtar (HMAC). Liste anahtarı olarak kullanılır; geri çevrilemez. */
  key: string;
  rank: number;
  /** Başkaları için maskeli ad ("Ayşe K."); izleyicinin kendisi için kendi adı. */
  name: string;
  image: string | null;
  level: number;
  leagueKey: string;
  leagueName: string;
  score: number;
  isMe: boolean;
  /** Yalnız izleyicinin kendi satırında: başkalarına görünmüyor (gizlilik tercihi). */
  hiddenFromOthers?: boolean;
};

export type LeagueTierDTO = { key: string; name: string; minPoints: number };

export type LeagueMeDTO = {
  key: string;
  name: string;
  image: string | null;
  level: number;
  /** Güncel bakiye (oturumdaki bayat değer değil, DB). Lig bu puandan hesaplanır. */
  points: number;
  league: LeagueTierDTO & { maxPoints: number | null };
  nextLeague: (LeagueTierDTO & { pointsNeeded: number }) | null;
  /** Mevcut lig içindeki ilerleme 0–100 (son ligde 100). */
  leagueProgress: number;
  /** Seçili kategori + dönemdeki skor. */
  score: number;
  /** Sıra; skor yoksa ya da önbellek sınırının dışındaysa null. */
  rank: number | null;
  /** Sınır dışındaysa "en az bu sıra" (ör. 15001 → "15.000+"). */
  rankFloor: number | null;
  /** Kendi satırının bulunduğu sayfa (1 tabanlı). */
  page: number | null;
  /** Bir üstteki oyuncuyu geçmek için gereken fark. */
  gapToNext: number | null;
  /** İlk 10'a girmek için gereken fark (zaten içerideyse null). */
  gapToTop10: number | null;
  /** Gizlilik tercihi: başkaları seni listede görüyor mu? */
  visibleToOthers: boolean;
};

export type LeagueBoardDTO = {
  category: LeagueCategory;
  period: LeaguePeriod;
  window: {
    key: string;
    startsAt: string | null;
    endsAt: string | null;
    seasonNumber: number | null;
  };
  /** İzleyicinin görünümünde ilk 3 (her sayfada aynı). */
  podium: LeagueRowDTO[];
  /** İstenen sayfanın satırları (sayfa 1'de 1–3 de dahildir; istemci podyumda gösterir). */
  rows: LeagueRowDTO[];
  page: number;
  pageSize: number;
  pageCount: number;
  /** Bu dönemde skoru olan (görünür) oyuncu sayısı. */
  total: number;
  /** Liste üst sınırda kesildi: `total` en az bu kadar. */
  truncated: boolean;
  me: LeagueMeDTO;
  /** Yalnız `week`: geçen haftanın (tamamlanmış) ilk 3'ü. */
  lastWeekPodium: LeagueRowDTO[] | null;
  generatedAt: string;
};
