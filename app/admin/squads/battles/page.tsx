'use client';

import { useState, useEffect } from 'react';
import { m as Motion } from 'framer-motion';
import { Sword, Plus, Calendar, Trophy, Users, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAppT, useAppLocale } from '@/lib/app-locale';

export default function SquadBattlesAdminPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'tr' ? tr : enUS;

  const [loading, setLoading] = useState(true);
  const [battles, setBattles] = useState<any[]>([]);
  const [squads, setSquads] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form State
  const [newBattle, setNewBattle] = useState({
    squad1Id: '',
    squad2Id: '',
    startTime: '',
    endTime: '',
    rewardPool: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [battlesRes, squadsRes] = await Promise.all([
        fetch('/api/admin/squads/battles'),
        fetch('/api/admin/squads')
      ]);
      
      const battlesData = await battlesRes.json();
      const squadsData = await squadsRes.json();

      if (battlesData.success) setBattles(battlesData.battles);
      if (squadsData.success) setSquads(squadsData.squads);
    } catch (error) {
      toast.error(t('adminSquadBattles.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBattle = async () => {
    if (newBattle.squad1Id === newBattle.squad2Id) {
      toast.error(t('adminSquadBattles.sameSquadError'));
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/squads/battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // datetime-local tarayıcının yerel saatidir → ISO'ya çevir (sunucu UTC'de kaymasın).
        body: JSON.stringify({
          ...newBattle,
          rewardPool: 0,
          startTime: newBattle.startTime ? new Date(newBattle.startTime).toISOString() : '',
          endTime: newBattle.endTime ? new Date(newBattle.endTime).toISOString() : '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('adminSquadBattles.battleCreated'));
        setIsCreateOpen(false);
        fetchData();
      } else {
        toast.error(data.error || t('adminSquadBattles.createFailed'));
      }
    } catch (error) {
      toast.error(t('adminSquadBattles.genericError'));
    } finally {
      setCreating(false);
    }
  };

  const handleFinishBattle = async (id: string) => {
    if (!confirm(t('adminSquadBattles.confirmFinish'))) return;
    try {
      const res = await fetch(`/api/admin/squads/battles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish' }),
      });
      const data = await res.json();
      if (data.success) {
        // Gerçek sonuç: ödül havuzu yoksa "ödüller dağıtıldı" denmez.
        const s = data.summary as { paidOut?: number; refunded?: number } | undefined;
        toast.success(
          s && (s.paidOut ?? 0) > 0
            ? `Savaş tamamlandı: ${s.paidOut!.toLocaleString('tr-TR')} puan kazananlara dağıtıldı${(s.refunded ?? 0) > 0 ? `, ${s.refunded!.toLocaleString('tr-TR')} puan iade edildi` : ''}`
            : s && (s.refunded ?? 0) > 0
              ? `Savaş tamamlandı; kazanan olmadığı için ${s.refunded!.toLocaleString('tr-TR')} puan iade edildi`
              : 'Savaş tamamlandı (ödül havuzu yok)'
        );
        fetchData();
      } else {
        toast.error(data.error || t('adminSquadBattles.finishFailed'));
      }
    } catch {
      toast.error(t('adminSquadBattles.genericError'));
    }
  };

  const handleDeleteBattle = async (id: string) => {
    if (!confirm(t('adminSquadBattles.cancel') + '?')) return;
    try {
      // Silmez: iadeli iptal (savaş kaydı ve denetim izi korunur).
      const res = await fetch(`/api/admin/squads/battles/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(
          data.refunded > 0
            ? `Savaş iptal edildi; ${Number(data.refunded).toLocaleString('tr-TR')} puan meydan okuyana iade edildi`
            : 'Savaş iptal edildi'
        );
        fetchData();
      } else {
        toast.error(data.error || t('adminSquadBattles.genericError'));
      }
    } catch {
      toast.error(t('adminSquadBattles.genericError'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('adminSquadBattles.title')}</h1>
          <p className="text-muted-foreground">{t('adminSquadBattles.description')}</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient">
              <Plus className="w-4 h-4 mr-2" />
              {t('adminSquadBattles.createBattle')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('adminSquadBattles.newBattle')}</DialogTitle>
              <DialogDescription>{t('adminSquadBattles.description')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('adminSquadBattles.squad1')}</Label>
                  <Select onValueChange={(val) => setNewBattle({...newBattle, squad1Id: val})}>
                    <SelectTrigger><SelectValue placeholder={t('adminSquadBattles.selectSquad')} /></SelectTrigger>
                    <SelectContent>
                      {squads.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('adminSquadBattles.squad2')}</Label>
                  <Select onValueChange={(val) => setNewBattle({...newBattle, squad2Id: val})}>
                    <SelectTrigger><SelectValue placeholder={t('adminSquadBattles.selectSquad')} /></SelectTrigger>
                    <SelectContent>
                      {squads.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('adminSquadBattles.startTime')}</Label>
                  <Input type="datetime-local" onChange={e => setNewBattle({...newBattle, startTime: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t('adminSquadBattles.endTime')}</Label>
                  <Input type="datetime-local" onChange={e => setNewBattle({...newBattle, endTime: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1 rounded-md border border-border p-3">
                <Label>{t('adminSquadBattles.rewardPool')}</Label>
                <p className="text-xs text-muted-foreground">
                  Yönetici savaşları ödülsüz onur savaşıdır. Ödül havuzu yalnız klan sahibinin meydan okumasında, kendi puanından
                  tahsil edilerek oluşur; iptalde ya da kazanan çıkmazsa ona iade edilir.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('adminSquadBattles.cancel')}</Button>
              <Button onClick={handleCreateBattle} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sword className="w-4 h-4 mr-2" />}
                {t('adminSquadBattles.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {battles.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <Sword className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">{t('adminSquadBattles.noActiveBattles')}</h3>
          </Card>
        ) : (
          battles.map((battle) => (
            <Motion.div
              key={battle.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-center p-6 gap-6">
                    {/* Status Badge */}
                    <div className="flex flex-col items-center gap-2 min-w-[120px]">
                      <Badge variant={battle.status === 'active' ? 'default' : 'outline'} className="capitalize">
                        {battle.status}
                      </Badge>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(battle.startTime), 'd MMM', { locale: dateLocale })}
                      </div>
                    </div>

                    {/* Squad vs Squad */}
                    <div className="flex-1 flex items-center justify-around gap-4 w-full">
                      <div className="text-center space-y-1">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                          <Users className="w-6 h-6 text-primary" />
                        </div>
                        <h4 className="font-bold">{battle.squad1.name}</h4>
                        <div className="text-2xl font-black">{battle.squad1Score}</div>
                      </div>

                      <div className="flex flex-col items-center">
                        <div className="text-sm font-bold text-muted-foreground mb-2 italic">VS</div>
                        <div className="px-4 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold border border-orange-500/20">
                          {battle.rewardPool > 0 ? `${battle.rewardPool.toLocaleString("tr-TR")} puan` : "Ödülsüz"}
                        </div>
                      </div>

                      <div className="text-center space-y-1">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                          <Users className="w-6 h-6 text-primary" />
                        </div>
                        <h4 className="font-bold">{battle.squad2.name}</h4>
                        <div className="text-2xl font-black">{battle.squad2Score}</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Kırık "Detaylar" linki kaldırıldı: /admin/squads/battles/[id] sayfası yok (404). */}
                      {battle.status === 'active' && (
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleFinishBattle(battle.id)}
                        >
                          <Trophy className="w-3 h-3 mr-1" />
                          {t('adminSquadBattles.finishBattle')}
                        </Button>
                      )}

                      {battle.status === 'pending' && (
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDeleteBattle(battle.id)}
                        >
                          {t('adminSquadBattles.cancel')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Motion.div>
          ))
        )}
      </div>
    </div>
  );
}
