'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Swords, Loader2, Trophy } from 'lucide-react';
import { toast } from 'sonner';

type CurrentBattle = {
  id: string;
  status: 'pending' | 'active';
  endTime: string;
  rewardPool: number;
  mySquadId: string;
  isChallenger: boolean;
  canRespond: boolean;
  myScore: number;
  opponentScore: number;
  opponentName: string;
};

type LeaderboardSquad = { id: string; name: string };

export function SquadBattlePanel({
  squadId,
  isOwner,
  leaderboard,
}: {
  squadId: string;
  isOwner: boolean;
  leaderboard: LeaderboardSquad[];
}) {
  const router = useRouter();
  const [battle, setBattle] = useState<CurrentBattle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [challengeOpen, setChallengeOpen] = useState(false);
  const [targetSquadId, setTargetSquadId] = useState('');
  const [rewardPool, setRewardPool] = useState('500');
  const [durationHours, setDurationHours] = useState('24');

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/squads/battles/current', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setBattle(json.battle);
    } catch {
      /* sessiz */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCurrent();
  }, [fetchCurrent]);

  // Aktif savaşta canlı skor için periyodik güncelleme (15 sn).
  useEffect(() => {
    if (battle?.status !== 'active') return;
    const t = setInterval(() => void fetchCurrent(), 15000);
    return () => clearInterval(t);
  }, [battle?.status, fetchCurrent]);

  const submitChallenge = async () => {
    if (!targetSquadId) {
      toast.error('Bir rakip klan seçin');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/customer/squads/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSquadId,
          rewardPool: Number(rewardPool) || 0,
          durationHours: Number(durationHours) || 24,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Meydan okuma başarısız');
      toast.success('Meydan okuma gönderildi! Rakip kabul edince savaş başlar.');
      setChallengeOpen(false);
      void fetchCurrent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (action: 'accept' | 'reject') => {
    if (!battle) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/squads/battles/${battle.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Yanıt başarısız');
      toast.success(action === 'accept' ? 'Savaş başladı! ⚔️' : 'Meydan okuma reddedildi');
      void fetchCurrent();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  // Aktif savaş yoksa: sahibe "Meydan oku" düğmesi.
  if (!battle) {
    if (!isOwner) return null;
    const targets = leaderboard.filter((s) => s.id !== squadId);
    return (
      <>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-6 shadow-sm">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Swords className="w-5 h-5 text-primary" /> Klan Savaşı
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Başka bir klana meydan oku; savaş süresince en çok puanı toplayan ödül havuzunu kazanır.
            </p>
          </div>
          <Button onClick={() => setChallengeOpen(true)} disabled={targets.length === 0}>
            <Swords className="w-4 h-4 mr-2" /> Meydan Oku
          </Button>
        </div>

        <Dialog open={challengeOpen} onOpenChange={setChallengeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Klan Savaşı Meydan Okuması</DialogTitle>
              <DialogDescription>
                Rakip klanı, ödül havuzunu ve süreyi seç. Rakip kabul edince savaş başlar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Rakip klan</Label>
                <Select value={targetSquadId} onValueChange={setTargetSquadId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Klan seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Ödül havuzu (puan)</Label>
                  <Input
                    type="number"
                    value={rewardPool}
                    onChange={(e) => setRewardPool(e.target.value)}
                    min={0}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Süre (saat)</Label>
                  <Input
                    type="number"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    min={1}
                    max={168}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setChallengeOpen(false)}>
                İptal
              </Button>
              <Button onClick={submitChallenge} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Meydan Oku'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Bekleyen meydan okuma — rakip sahibi kabul/ret edebilir.
  if (battle.status === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-6 shadow-sm">
        <h3 className="font-semibold flex items-center gap-2">
          <Swords className="w-5 h-5 text-amber-500" /> Bekleyen Meydan Okuma
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {battle.isChallenger
            ? `${battle.opponentName} klanına meydan okudunuz. Yanıt bekleniyor…`
            : `${battle.opponentName} size meydan okudu! Ödül havuzu: ${battle.rewardPool} puan.`}
        </p>
        {battle.canRespond && (
          <div className="mt-4 flex gap-2">
            <Button onClick={() => respond('accept')} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kabul Et ⚔️'}
            </Button>
            <Button variant="outline" onClick={() => respond('reject')} disabled={busy}>
              Reddet
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Aktif savaş — canlı skor.
  const winning = battle.myScore > battle.opponentScore;
  const tied = battle.myScore === battle.opponentScore;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white animate-pulse">
          <Swords className="w-3.5 h-3.5" /> CANLI SAVAŞ
        </span>
        <span className="text-xs text-muted-foreground">
          Ödül: <b className="text-amber-500">{battle.rewardPool}</b> puan
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 items-center gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Klanınız</p>
          <p className={`text-3xl font-black ${winning ? 'text-emerald-500' : ''}`}>{battle.myScore}</p>
        </div>
        <div className="text-muted-foreground font-bold italic">VS</div>
        <div>
          <p className="text-xs text-muted-foreground">{battle.opponentName}</p>
          <p className={`text-3xl font-black ${!winning && !tied ? 'text-red-500' : ''}`}>
            {battle.opponentScore}
          </p>
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-medium">
        {tied ? (
          'Berabere — daha çok puan topla!'
        ) : winning ? (
          <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <Trophy className="w-4 h-4" /> Öndesiniz!
          </span>
        ) : (
          'Geride kaldınız — hız verin!'
        )}
      </p>
    </div>
  );
}
