'use client';

import { useEffect, useState } from 'react';
import { Users2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

type Goal = {
  id: string;
  name: string;
  target: number;
  progress: number;
  percent: number;
  memberCount: number;
};

export function SquadWeeklyGoalBar({ squadId }: { squadId: string }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/customer/squads/weekly-goal');
        const j = await r.json();
        if (!cancelled && j.success && j.squad?.id === squadId) {
          setGoal({
            id: j.squad.id,
            name: j.squad.name,
            target: j.squad.target,
            progress: j.squad.progress,
            percent: j.squad.percent,
            memberCount: j.squad.memberCount,
          });
        } else if (!cancelled) {
          setGoal(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [squadId]);

  if (loading) {
    return (
      <Card className="border-primary/15">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!goal) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-cyan-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users2 className="h-5 w-5 text-primary" />
          Haftalık ekip hedefi
        </CardTitle>
        <CardDescription>
          Bu hafta klan üyelerinin toplam QR geri bildirimi — hedef: {goal.target} (üye: {goal.memberCount})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">İlerleme</span>
          <span className="font-medium tabular-nums">
            {goal.progress}/{goal.target}
          </span>
        </div>
        <Progress value={goal.percent} className="h-2" />
      </CardContent>
    </Card>
  );
}
