'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Clock,
  Star,
  CheckCircle,
  Trophy,
  Zap,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface Quest {
  id: string;
  name: string;
  description: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'SPECIAL';
  target: number;
  reward: number;
  progress: number;
  completed: boolean;
  expiresAt: string | null;
}

const typeLabels = {
  DAILY: 'Günlük',
  WEEKLY: 'Haftalık',
  MONTHLY: 'Aylık',
  SPECIAL: 'Özel',
};

const typeColors = {
  DAILY: 'bg-green-500/10 text-green-500 border-green-500/20',
  WEEKLY: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  MONTHLY: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  SPECIAL: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export default function CustomerQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/quests?userId=me');
      const data = await res.json();

      if (data.success) {
        // Add progress simulation
        const questsWithProgress = data.data.map((quest: Quest, index: number) => ({
          ...quest,
          progress: index === 0 ? quest.target : Math.floor(Math.random() * quest.target),
          completed: index === 0,
        }));
        setQuests(questsWithProgress);
      }
    } catch (error) {
      toast.error('Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = (quest: Quest) => {
    toast.success(`${quest.reward} puan kazandınız!`, {
      description: `${quest.name} görevi tamamlandı`,
    });
  };

  const activeQuests = quests.filter((q) => !q.completed);
  const completedQuests = quests.filter((q) => q.completed);

  const stats = {
    active: activeQuests.length,
    completed: completedQuests.length,
    totalRewards: completedQuests.reduce((acc, q) => acc + q.reward, 0),
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Görevler"
        description="Görevleri tamamlayarak puan kazanın"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Tamamlanan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalRewards}</p>
                <p className="text-xs text-muted-foreground">Kazanılan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2 bg-muted rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Active Quests */}
          {activeQuests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Aktif Görevler
              </h2>
              {activeQuests.map((quest, index) => {
                const progressPercent = Math.min((quest.progress / quest.target) * 100, 100);
                return (
                  <motion.div
                    key={quest.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card glass hover>
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{quest.name}</h3>
                              <Badge className={typeColors[quest.type]}>
                                {typeLabels[quest.type]}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {quest.description}
                            </p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>
                                  {quest.progress} / {quest.target}
                                </span>
                                <span className="text-muted-foreground">
                                  %{Math.round(progressPercent)}
                                </span>
                              </div>
                              <Progress value={progressPercent} className="h-2" />
                            </div>
                            {quest.expiresAt && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  Bitiş: {new Date(quest.expiresAt).toLocaleDateString('tr-TR')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-center">
                              <div className="flex items-center gap-1 text-yellow-500">
                                <Star className="h-5 w-5 fill-yellow-500" />
                                <span className="text-xl font-bold">{quest.reward}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">Ödül</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Completed Quests */}
          {completedQuests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-500" />
                Tamamlanan Görevler
              </h2>
              {completedQuests.map((quest, index) => (
                <motion.div
                  key={quest.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card glass className="border-green-500/20">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-green-500/10">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{quest.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {quest.description}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => handleClaimReward(quest)}
                        >
                          <Star className="h-4 w-4 text-yellow-500" />
                          {quest.reward} Puan Al
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {quests.length === 0 && (
            <Card glass>
              <CardContent className="p-8 text-center">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Henüz aktif görev yok</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}



