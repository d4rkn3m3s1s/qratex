/**
 * Klan yüzeyinin veri sözleşmesi (sunucu → istemci). Yalnız tipler; çalışma zamanı kodu yok.
 * Tarihler ISO metin olarak taşınır (SSR → istemci adası ve JSON uçları aynı şekli kullanır).
 */
import type { WeeklyGoalTier } from './rules';

export type SquadLeagueRow = {
  id: string;
  name: string;
  totalPoints: number;
  level: number;
  memberCount: number;
  rank: number;
};

export type SquadLeague = {
  top: SquadLeagueRow[];
  /** Görünür (askıda olmayan) klan sayısı. */
  total: number;
  /** Kendi klanının sırası (top-10 dışındaysa da). Klansızsa null. */
  mine: SquadLeagueRow | null;
};

export type SquadMemberDto = {
  userId: string;
  name: string;
  image: string | null;
  isOwner: boolean;
  isMe: boolean;
  joinedAt: string;
  /** Bu hafta (İstanbul) klana katkı: geri bildirim sayısı (katıldığı andan itibaren). */
  weekContributions: number;
  /** Aktif savaştaki kişisel skor (katılımcı değilse null). */
  battleScore: number | null;
};

export type WeeklyGoalDto = {
  weekStart: string;
  endsAt: string;
  tier: WeeklyGoalTier;
  target: number;
  progress: number;
  percent: number;
  reward: number;
  completed: boolean;
  myContribution: number;
  /** Bu haftanın ödülünü aldı mı (defter kaydından). */
  claimed: boolean;
  /** Ödülü şu an alabilir mi (tamam + katkı verdi + alınmadı + klan askıda değil). */
  canClaim: boolean;
};

export type BattleSideDto = { id: string; name: string; score: number };

export type BattleContributorDto = {
  name: string;
  image: string | null;
  score: number;
  side: 'mine' | 'theirs';
  isMe: boolean;
};

export type CurrentBattleDto = {
  id: string;
  status: 'pending' | 'active';
  createdAt: string;
  startTime: string;
  endTime: string;
  acceptedAt: string | null;
  rewardPool: number;
  rewardFunded: boolean;
  /** Bizim klan meydan okuyan mı (squad1)? */
  isChallenger: boolean;
  canRespond: boolean;
  canWithdraw: boolean;
  /** Kabul anında kadroda mıydım (skor ve ödül payı yalnız kadroya). */
  amParticipant: boolean;
  myContribution: number | null;
  mine: BattleSideDto;
  opponent: BattleSideDto;
  topContributors: BattleContributorDto[];
};

export type BattleResultDto = {
  id: string;
  status: 'completed' | 'cancelled';
  outcome: 'won' | 'lost' | 'draw' | 'cancelled';
  endedAt: string;
  mine: BattleSideDto;
  opponent: BattleSideDto;
  rewardPool: number;
  rewardFunded: boolean;
  cancelReason: string | null;
  /** Bu savaştan bana yapılan ödeme (defterden; yoksa 0). */
  myPayout: number;
};

export type BattleState = {
  battle: CurrentBattleDto | null;
  /** Son 72 saatte biten savaş (sonuç kartı). */
  recentResult: BattleResultDto | null;
};

export type SquadActivityDto = {
  id: string;
  at: string;
  kind:
    | 'created'
    | 'joined'
    | 'left'
    | 'kicked'
    | 'leader'
    | 'renamed'
    | 'invite_rotated'
    | 'goal_changed'
    | 'challenge_sent'
    | 'challenge_received'
    | 'battle_started'
    | 'battle_won'
    | 'battle_lost'
    | 'battle_draw'
    | 'battle_cancelled';
  /** İlgili kişi (üye adı) ya da rakip klan adı. */
  actor: string | null;
  detail: string | null;
};

export type SquadDto = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  isFrozen: boolean;
  totalPoints: number;
  power: number;
  level: number;
  levelProgress: number;
  nextLevelAt: number;
  memberCount: number;
  maxMembers: number;
  ownerId: string;
  createdAt: string;
};

export type SquadOverviewMember = {
  state: 'member';
  viewer: { userId: string; balance: number; isOwner: boolean; joinedAt: string };
  squad: SquadDto;
  members: SquadMemberDto[];
  weeklyGoal: WeeklyGoalDto;
  battle: BattleState;
  league: SquadLeague;
  activity: SquadActivityDto[];
};

export type SquadOverviewNone = {
  state: 'none';
  viewer: { userId: string; balance: number };
  league: SquadLeague;
};

export type SquadOverview = SquadOverviewMember | SquadOverviewNone;

export type BattleHistoryPage = {
  items: BattleResultDto[];
  nextCursor: string | null;
};

export type SquadSearchResult = {
  id: string;
  name: string;
  totalPoints: number;
  level: number;
  memberCount: number;
  /** Şu an açık savaşı var mı (meydan okunamaz). */
  busy: boolean;
};
