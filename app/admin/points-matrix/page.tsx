'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { RefreshCw, Save, Plus, Trash2, RotateCcw, Grid3x3 } from 'lucide-react';

type RewardGrant = {
  points: number;
  xp: number;
};

type PointsMatrixForm = {
  feedback: {
    longTextThreshold: number;
    base: RewardGrant;
    detailed: RewardGrant;
  };
  consumptionReview: {
    longTextThreshold: number;
    base: RewardGrant;
    detailed: RewardGrant;
  };
  referral: {
    referredPoints: number;
    referrerPoints: number;
  };
  birthday: {
    points: number;
  };
  streak: {
    milestones: Array<{ days: number; points: number }>;
  };
  quest: {
    default: RewardGrant;
  };
  spin: {
    enabled: boolean;
    dailyLimit: number;
    prizes: Array<{
      id: string;
      label: string;
      type: 'points' | 'xp' | 'nothing';
      value: number;
      weight: number;
    }>;
  };
};

const EMPTY_MATRIX: PointsMatrixForm = {
  feedback: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } },
  consumptionReview: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } },
  referral: { referredPoints: 500, referrerPoints: 1000 },
  birthday: { points: 500 },
  streak: {
    milestones: [
      { days: 7, points: 100 },
      { days: 14, points: 250 },
      { days: 30, points: 500 },
    ],
  },
  quest: { default: { points: 100, xp: 50 } },
  spin: {
    enabled: true,
    dailyLimit: 1,
    prizes: [
      { id: 'spin_p_10', label: '10 Puan', type: 'points', value: 10, weight: 25 },
      { id: 'spin_p_25', label: '25 Puan', type: 'points', value: 25, weight: 20 },
      { id: 'spin_p_50', label: '50 Puan', type: 'points', value: 50, weight: 15 },
      { id: 'spin_p_100', label: '100 Puan', type: 'points', value: 100, weight: 10 },
      { id: 'spin_x_20', label: '20 XP', type: 'xp', value: 20, weight: 15 },
      { id: 'spin_x_50', label: '50 XP', type: 'xp', value: 50, weight: 8 },
      { id: 'spin_n_0', label: 'Tekrar Dene', type: 'nothing', value: 0, weight: 7 },
    ],
  },
};

const clampNonNegative = (value: number) => Math.max(0, Math.floor(value || 0));
const clampPositive = (value: number) => Math.max(1, Math.floor(value || 1));

function normalizeClientMatrix(input: unknown): PointsMatrixForm {
  if (!input || typeof input !== 'object') return EMPTY_MATRIX;
  const raw = input as Record<string, unknown>;
  const feedback = (raw.feedback as Record<string, unknown>) || {};
  const consumptionReview = (raw.consumptionReview as Record<string, unknown>) || {};
  const referral = (raw.referral as Record<string, unknown>) || {};
  const birthday = (raw.birthday as Record<string, unknown>) || {};
  const streak = (raw.streak as Record<string, unknown>) || {};
  const quest = (raw.quest as Record<string, unknown>) || {};
  const spin = (raw.spin as Record<string, unknown>) || {};

  const readGrant = (value: unknown, fallback: RewardGrant): RewardGrant => {
    const payload = (value as Record<string, unknown>) || {};
    return {
      points: clampNonNegative(Number(payload.points ?? fallback.points)),
      xp: clampNonNegative(Number(payload.xp ?? fallback.xp)),
    };
  };

  const milestonesInput = Array.isArray(streak.milestones) ? streak.milestones : EMPTY_MATRIX.streak.milestones;
  const milestones = milestonesInput
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        days: clampPositive(Number(row.days ?? 1)),
        points: clampNonNegative(Number(row.points ?? 0)),
      };
    })
    .filter((item): item is { days: number; points: number } => !!item)
    .sort((a, b) => a.days - b.days);

  const spinPrizesInput = Array.isArray(spin.prizes) ? spin.prizes : EMPTY_MATRIX.spin.prizes;
  const spinPrizes = spinPrizesInput
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const fallback = EMPTY_MATRIX.spin.prizes[index % EMPTY_MATRIX.spin.prizes.length];
      const type =
        row.type === 'points' || row.type === 'xp' || row.type === 'nothing'
          ? row.type
          : fallback.type;
      const value = type === 'nothing' ? 0 : clampNonNegative(Number(row.value ?? fallback.value));
      return {
        id: typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : `spin_${type}_${index + 1}`,
        label:
          typeof row.label === 'string' && row.label.trim().length > 0
            ? row.label.trim()
            : fallback.label,
        type,
        value,
        weight: clampPositive(Number(row.weight ?? fallback.weight)),
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        label: string;
        type: 'points' | 'xp' | 'nothing';
        value: number;
        weight: number;
      } => !!item
    );

  return {
    feedback: {
      longTextThreshold: clampPositive(
        Number(feedback.longTextThreshold ?? EMPTY_MATRIX.feedback.longTextThreshold)
      ),
      base: readGrant(feedback.base, EMPTY_MATRIX.feedback.base),
      detailed: readGrant(feedback.detailed, EMPTY_MATRIX.feedback.detailed),
    },
    consumptionReview: {
      longTextThreshold: clampPositive(
        Number(consumptionReview.longTextThreshold ?? EMPTY_MATRIX.consumptionReview.longTextThreshold)
      ),
      base: readGrant(consumptionReview.base, EMPTY_MATRIX.consumptionReview.base),
      detailed: readGrant(consumptionReview.detailed, EMPTY_MATRIX.consumptionReview.detailed),
    },
    referral: {
      referredPoints: clampNonNegative(Number(referral.referredPoints ?? EMPTY_MATRIX.referral.referredPoints)),
      referrerPoints: clampNonNegative(Number(referral.referrerPoints ?? EMPTY_MATRIX.referral.referrerPoints)),
    },
    birthday: {
      points: clampNonNegative(Number(birthday.points ?? EMPTY_MATRIX.birthday.points)),
    },
    streak: {
      milestones: milestones.length > 0 ? milestones : EMPTY_MATRIX.streak.milestones,
    },
    quest: {
      default: readGrant(quest.default, EMPTY_MATRIX.quest.default),
    },
    spin: {
      enabled: typeof spin.enabled === 'boolean' ? spin.enabled : EMPTY_MATRIX.spin.enabled,
      dailyLimit: clampPositive(Number(spin.dailyLimit ?? EMPTY_MATRIX.spin.dailyLimit)),
      prizes: spinPrizes.length > 0 ? spinPrizes : EMPTY_MATRIX.spin.prizes,
    },
  };
}

export default function AdminPointsMatrixPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matrix, setMatrix] = useState<PointsMatrixForm>(EMPTY_MATRIX);
  const [initialSignature, setInitialSignature] = useState('');
  const [sampleFeedbackLength, setSampleFeedbackLength] = useState(80);
  const [sampleReviewLength, setSampleReviewLength] = useState(30);
  const [sampleStreakDays, setSampleStreakDays] = useState(14);
  const [sampleTicket, setSampleTicket] = useState(45);

  const matrixSignature = useMemo(() => JSON.stringify(matrix), [matrix]);
  const isDirty = matrixSignature !== initialSignature;

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/settings/points-matrix', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Puan matrisi alınamadı');
      }

      const normalized = normalizeClientMatrix(data.matrix);
      setMatrix(normalized);
      setInitialSignature(JSON.stringify(normalized));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Puan matrisi alınamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, []);

  const handleReset = () => {
    setMatrix((previous) => {
      const original = initialSignature ? (JSON.parse(initialSignature) as PointsMatrixForm) : previous;
      return original;
    });
    toast.info('Değişiklikler geri alındı');
  };

  const updateNumber = (setter: () => void) => {
    setter();
  };

  const findClosestStreakBonus = (days: number) => {
    const exact = matrix.streak.milestones.find((m) => m.days === days);
    if (exact) return exact.points;
    const lower = [...matrix.streak.milestones].sort((a, b) => b.days - a.days).find((m) => m.days <= days);
    return lower?.points ?? 0;
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const response = await fetch('/api/admin/settings/points-matrix', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Kaydetme işlemi başarısız');
      }

      const normalized = normalizeClientMatrix(data.matrix);
      setMatrix(normalized);
      setInitialSignature(JSON.stringify(normalized));
      toast.success('Puan matrisi güncellendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kaydetme sırasında hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const addStreakMilestone = () => {
    setMatrix((prev) => ({
      ...prev,
      streak: {
        milestones: [...prev.streak.milestones, { days: 1, points: 0 }].sort((a, b) => a.days - b.days),
      },
    }));
  };

  const updateStreakMilestone = (index: number, key: 'days' | 'points', value: number) => {
    setMatrix((prev) => {
      const milestones = [...prev.streak.milestones];
      milestones[index] = {
        ...milestones[index],
        [key]: key === 'days' ? clampPositive(value) : clampNonNegative(value),
      };
      return {
        ...prev,
        streak: {
          milestones: milestones.sort((a, b) => a.days - b.days),
        },
      };
    });
  };

  const removeStreakMilestone = (index: number) => {
    setMatrix((prev) => {
      const milestones = prev.streak.milestones.filter((_, i) => i !== index);
      return {
        ...prev,
        streak: {
          milestones: milestones.length > 0 ? milestones : prev.streak.milestones,
        },
      };
    });
  };

  const addSpinPrize = () => {
    setMatrix((prev) => ({
      ...prev,
      spin: {
        ...prev.spin,
        prizes: [
          ...prev.spin.prizes,
          {
            id: `spin_custom_${prev.spin.prizes.length + 1}`,
            label: `Yeni Ödül ${prev.spin.prizes.length + 1}`,
            type: 'points',
            value: 10,
            weight: 1,
          },
        ],
      },
    }));
  };

  const updateSpinPrize = (
    index: number,
    key: 'label' | 'type' | 'value' | 'weight',
    value: string | number
  ) => {
    setMatrix((prev) => {
      const prizes = [...prev.spin.prizes];
      const current = prizes[index];
      if (!current) return prev;
      if (key === 'type') {
        const type = value as 'points' | 'xp' | 'nothing';
        prizes[index] = {
          ...current,
          type,
          value: type === 'nothing' ? 0 : current.value,
        };
      } else if (key === 'label') {
        prizes[index] = { ...current, label: String(value) };
      } else if (key === 'value') {
        prizes[index] = {
          ...current,
          value: current.type === 'nothing' ? 0 : clampNonNegative(Number(value)),
        };
      } else {
        prizes[index] = { ...current, weight: clampPositive(Number(value)) };
      }
      return {
        ...prev,
        spin: {
          ...prev.spin,
          prizes,
        },
      };
    });
  };

  const removeSpinPrize = (index: number) => {
    setMatrix((prev) => {
      const prizes = prev.spin.prizes.filter((_, i) => i !== index);
      return {
        ...prev,
        spin: {
          ...prev.spin,
          prizes: prizes.length > 0 ? prizes : prev.spin.prizes,
        },
      };
    });
  };

  const feedbackSample =
    sampleFeedbackLength >= matrix.feedback.longTextThreshold
      ? matrix.feedback.detailed
      : matrix.feedback.base;
  const reviewSample =
    sampleReviewLength >= matrix.consumptionReview.longTextThreshold
      ? matrix.consumptionReview.detailed
      : matrix.consumptionReview.base;
  const streakSampleBonus = findClosestStreakBonus(sampleStreakDays);
  const totalSpinWeight = matrix.spin.prizes.reduce((sum, prize) => sum + prize.weight, 0);
  const sampleCursor = Math.max(0, Math.min(99, sampleTicket)) / 100;
  let cumulative = 0;
  const sampleSpinPrize =
    matrix.spin.prizes.find((prize) => {
      cumulative += prize.weight / Math.max(totalSpinWeight, 1);
      return sampleCursor <= cumulative;
    }) || matrix.spin.prizes[matrix.spin.prizes.length - 1];

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        eyebrow="Ekonomi"
        title="Puan matrisi"
        description="Feedback, streak, referral, doğum günü ve görev puan kurallarını yönetin."
        icon={<Grid3x3 className="text-white" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchMatrix}
              disabled={loading || saving}
              className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || !isDirty} className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md">
              <Save className="h-4 w-4" />
              Kaydet
            </Button>
          </div>
        }
      />

      <Card className="border-primary/20 bg-muted/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Genel puan sistemi:</strong> Geri bildirim, tüketim incelemesi, referans, doğum günü, seri, görev ve çark puanları bu matris ile yönetilir. Ödül mağazasındaki ödül maliyetleri Ödül Yönetimi sayfasında, rozet puan maliyetleri ise rozet kataloğunda tanımlıdır.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Form Tabanlı Puan Yönetimi
            {isDirty ? <Badge variant="secondary">Değiştirildi</Badge> : <Badge variant="outline">Güncel</Badge>}
          </CardTitle>
          <CardDescription>
            Tüm alanlar gerçek API&apos;ye bağlıdır. Kaydettiğinizde backend normalize eder ve puan motoru anında bu kuralları kullanır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Feedback Puanları</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Detaylı Yorum Eşiği (karakter)</Label>
                  <Input
                    type="number"
                    value={matrix.feedback.longTextThreshold}
                    onChange={(event) =>
                      updateNumber(() =>
                        setMatrix((prev) => ({
                          ...prev,
                          feedback: {
                            ...prev.feedback,
                            longTextThreshold: clampPositive(Number(event.target.value)),
                          },
                        }))
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Temel Puan</Label>
                    <Input
                      type="number"
                      value={matrix.feedback.base.points}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          feedback: {
                            ...prev.feedback,
                            base: { ...prev.feedback.base, points: clampNonNegative(Number(event.target.value)) },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temel XP</Label>
                    <Input
                      type="number"
                      value={matrix.feedback.base.xp}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          feedback: {
                            ...prev.feedback,
                            base: { ...prev.feedback.base, xp: clampNonNegative(Number(event.target.value)) },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Detaylı Puan</Label>
                    <Input
                      type="number"
                      value={matrix.feedback.detailed.points}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          feedback: {
                            ...prev.feedback,
                            detailed: {
                              ...prev.feedback.detailed,
                              points: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Detaylı XP</Label>
                    <Input
                      type="number"
                      value={matrix.feedback.detailed.xp}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          feedback: {
                            ...prev.feedback,
                            detailed: {
                              ...prev.feedback.detailed,
                              xp: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tüketim Yorumu Puanları</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Detaylı Yorum Eşiği (karakter)</Label>
                  <Input
                    type="number"
                    value={matrix.consumptionReview.longTextThreshold}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        consumptionReview: {
                          ...prev.consumptionReview,
                          longTextThreshold: clampPositive(Number(event.target.value)),
                        },
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Temel Puan</Label>
                    <Input
                      type="number"
                      value={matrix.consumptionReview.base.points}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          consumptionReview: {
                            ...prev.consumptionReview,
                            base: {
                              ...prev.consumptionReview.base,
                              points: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temel XP</Label>
                    <Input
                      type="number"
                      value={matrix.consumptionReview.base.xp}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          consumptionReview: {
                            ...prev.consumptionReview,
                            base: {
                              ...prev.consumptionReview.base,
                              xp: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Detaylı Puan</Label>
                    <Input
                      type="number"
                      value={matrix.consumptionReview.detailed.points}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          consumptionReview: {
                            ...prev.consumptionReview,
                            detailed: {
                              ...prev.consumptionReview.detailed,
                              points: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Detaylı XP</Label>
                    <Input
                      type="number"
                      value={matrix.consumptionReview.detailed.xp}
                      onChange={(event) =>
                        setMatrix((prev) => ({
                          ...prev,
                          consumptionReview: {
                            ...prev.consumptionReview,
                            detailed: {
                              ...prev.consumptionReview.detailed,
                              xp: clampNonNegative(Number(event.target.value)),
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Referral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Kodu Giren Kullanıcı Puanı</Label>
                  <Input
                    type="number"
                    value={matrix.referral.referredPoints}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        referral: { ...prev.referral, referredPoints: clampNonNegative(Number(event.target.value)) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kodu Sahibi Kullanıcı Puanı</Label>
                  <Input
                    type="number"
                    value={matrix.referral.referrerPoints}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        referral: { ...prev.referral, referrerPoints: clampNonNegative(Number(event.target.value)) },
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Doğum Günü</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label>Doğum Günü Bonus Puanı</Label>
                <Input
                  type="number"
                  value={matrix.birthday.points}
                  onChange={(event) =>
                    setMatrix((prev) => ({
                      ...prev,
                      birthday: { points: clampNonNegative(Number(event.target.value)) },
                    }))
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Görev (Quest)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Varsayılan Puan</Label>
                  <Input
                    type="number"
                    value={matrix.quest.default.points}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        quest: {
                          default: {
                            ...prev.quest.default,
                            points: clampNonNegative(Number(event.target.value)),
                          },
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Varsayılan XP</Label>
                  <Input
                    type="number"
                    value={matrix.quest.default.xp}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        quest: {
                          default: {
                            ...prev.quest.default,
                            xp: clampNonNegative(Number(event.target.value)),
                          },
                        },
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Streak Milestones</CardTitle>
              <CardDescription>Belirli gün eşiklerinde verilecek bonus puanları tanımlayın.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {matrix.streak.milestones.map((milestone, index) => (
                <div key={`${milestone.days}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                  <div className="space-y-1">
                    <Label>Gün</Label>
                    <Input
                      type="number"
                      value={milestone.days}
                      onChange={(event) => updateStreakMilestone(index, 'days', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Bonus Puan</Label>
                    <Input
                      type="number"
                      value={milestone.points}
                      onChange={(event) => updateStreakMilestone(index, 'points', Number(event.target.value))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => removeStreakMilestone(index)}
                      disabled={matrix.streak.milestones.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="gap-2" onClick={addStreakMilestone}>
                <Plus className="h-4 w-4" />
                Milestone Ekle
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Günlük Çark Kuralları</CardTitle>
                  <CardDescription>
                    Çark ödül algoritması backend&apos;de ağırlıklı (weighted) seçimle çalışır. Buradaki değerler müşteri ve bayi paneline API ile yansır.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => {
                    setMatrix((prev) => ({
                      ...prev,
                      spin: {
                        enabled: EMPTY_MATRIX.spin.enabled,
                        dailyLimit: EMPTY_MATRIX.spin.dailyLimit,
                        prizes: EMPTY_MATRIX.spin.prizes.map((p) => ({ ...p })),
                      },
                    }));
                    toast.success('Çark kuralları varsayılana döndürüldü. Kaydetmeyi unutmayın.');
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Çark varsayılanına dön
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Çark Aktif</p>
                    <p className="text-xs text-muted-foreground">Kapatıldığında hiçbir kullanıcı çeviremez.</p>
                  </div>
                  <Switch
                    checked={matrix.spin.enabled}
                    onCheckedChange={(checked) =>
                      setMatrix((prev) => ({ ...prev, spin: { ...prev.spin, enabled: checked } }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Günlük Çevirme Limiti</Label>
                  <Input
                    type="number"
                    value={matrix.spin.dailyLimit}
                    onChange={(event) =>
                      setMatrix((prev) => ({
                        ...prev,
                        spin: { ...prev.spin, dailyLimit: clampPositive(Number(event.target.value)) },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                {matrix.spin.prizes.map((prize, index) => (
                  <div key={`${prize.id}-${index}`} className="grid grid-cols-12 gap-2 items-end rounded-lg border p-3">
                    <div className="col-span-12 md:col-span-3 space-y-1">
                      <Label>Ödül Etiketi</Label>
                      <Input
                        value={prize.label}
                        onChange={(event) => updateSpinPrize(index, 'label', event.target.value)}
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <Label>Tip</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={prize.type}
                        onChange={(event) => updateSpinPrize(index, 'type', event.target.value)}
                      >
                        <option value="points">points</option>
                        <option value="xp">xp</option>
                        <option value="nothing">nothing</option>
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <Label>Değer</Label>
                      <Input
                        type="number"
                        value={prize.value}
                        disabled={prize.type === 'nothing'}
                        onChange={(event) => updateSpinPrize(index, 'value', Number(event.target.value))}
                      />
                    </div>
                    <div className="col-span-9 md:col-span-2 space-y-1">
                      <Label>Ağırlık</Label>
                      <Input
                        type="number"
                        value={prize.weight}
                        onChange={(event) => updateSpinPrize(index, 'weight', Number(event.target.value))}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-1 text-right text-xs text-muted-foreground">
                      %{Math.round((prize.weight / Math.max(1, totalSpinWeight)) * 100)}
                    </div>
                    <div className="col-span-12 md:col-span-2 flex justify-end">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => removeSpinPrize(index)}
                        disabled={matrix.spin.prizes.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="gap-2" onClick={addSpinPrize}>
                  <Plus className="h-4 w-4" />
                  Çark Ödülü Ekle
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canlı Puan Mantığı Simülasyonu</CardTitle>
              <CardDescription>
                Buradaki örnekler kaydetmeden önce güncel kuralların nasıl işleyeceğini gerçek matrise göre gösterir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Örnek Feedback Uzunluğu</Label>
                  <Input
                    type="number"
                    value={sampleFeedbackLength}
                    onChange={(event) => setSampleFeedbackLength(clampNonNegative(Number(event.target.value)))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sonuç: +{feedbackSample.points} puan / +{feedbackSample.xp} XP
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Örnek Tüketim Yorumu Uzunluğu</Label>
                  <Input
                    type="number"
                    value={sampleReviewLength}
                    onChange={(event) => setSampleReviewLength(clampNonNegative(Number(event.target.value)))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sonuç: +{reviewSample.points} puan / +{reviewSample.xp} XP
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Örnek Streak Gün Sayısı</Label>
                  <Input
                    type="number"
                    value={sampleStreakDays}
                    onChange={(event) => setSampleStreakDays(clampPositive(Number(event.target.value)))}
                  />
                  <p className="text-xs text-muted-foreground">Yakın bonus: +{streakSampleBonus} puan</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Referral Mantığı</p>
                  <p className="text-muted-foreground">
                    Kodu giren kullanıcı +{matrix.referral.referredPoints}, kod sahibi +{matrix.referral.referrerPoints} puan alır.
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Doğum Günü Mantığı</p>
                  <p className="text-muted-foreground">Yıllık tek seferde +{matrix.birthday.points} puan verilir.</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 text-sm space-y-2">
                <p className="font-medium">Çark Algoritma Simülasyonu</p>
                <div className="grid md:grid-cols-[220px_1fr] gap-3 items-center">
                  <div className="space-y-2">
                    <Label>Örnek Çekiliş Bileti (0-99)</Label>
                    <Input
                      type="number"
                      value={sampleTicket}
                      onChange={(event) =>
                        setSampleTicket(Math.max(0, Math.min(99, clampNonNegative(Number(event.target.value)))))
                      }
                    />
                  </div>
                  <p className="text-muted-foreground">
                    Sonuç: <span className="font-medium text-foreground">{sampleSpinPrize?.label}</span>{' '}
                    ({sampleSpinPrize?.type} / {sampleSpinPrize?.value}) - günlük limit {matrix.spin.dailyLimit}, aktif:{' '}
                    {matrix.spin.enabled ? 'evet' : 'hayır'}.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleReset} disabled={!isDirty || saving}>
              Geri Al
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || !isDirty}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
