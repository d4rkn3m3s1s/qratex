'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { QueryState } from '@/components/states';
import { VersionConflictBanner } from '@/components/settings/version-conflict-banner';
import { fetchResourceJson, requireVersion, saveVersioned } from '@/lib/versioned-resource';
import { useVersionedDraft, useVersionedResource } from '@/hooks/use-versioned-resource';
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

const clampNonNegative = (value: number) => Math.max(0, Math.floor(value || 0));
const clampPositive = (value: number) => Math.max(1, Math.floor(value || 1));

/**
 * Sunucudan gelen matrisi form biçimine çevirir. İstemcide varsayılan matris KOPYASI yoktur
 * (P0-28): eksik alanlar sunucunun GET'te döndürdüğü `defaults` ile doldurulur; girdi nesne
 * değilse hata fırlatılır (asla sessizce varsayılana dönülmez).
 */
function normalizeClientMatrix(input: unknown, fallback: PointsMatrixForm): PointsMatrixForm {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Puan matrisi beklenen biçimde gelmedi');
  }
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

  const milestonesInput = Array.isArray(streak.milestones) ? streak.milestones : fallback.streak.milestones;
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

  const spinPrizesInput = Array.isArray(spin.prizes) ? spin.prizes : fallback.spin.prizes;
  const spinPrizes = spinPrizesInput
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const prizeFallback = fallback.spin.prizes[index % fallback.spin.prizes.length];
      const type =
        row.type === 'points' || row.type === 'xp' || row.type === 'nothing'
          ? row.type
          : prizeFallback.type;
      const value = type === 'nothing' ? 0 : clampNonNegative(Number(row.value ?? prizeFallback.value));
      return {
        id: typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : `spin_${type}_${index + 1}`,
        label:
          typeof row.label === 'string' && row.label.trim().length > 0
            ? row.label.trim()
            : prizeFallback.label,
        type,
        value,
        weight: clampPositive(Number(row.weight ?? prizeFallback.weight)),
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
        Number(feedback.longTextThreshold ?? fallback.feedback.longTextThreshold)
      ),
      base: readGrant(feedback.base, fallback.feedback.base),
      detailed: readGrant(feedback.detailed, fallback.feedback.detailed),
    },
    consumptionReview: {
      longTextThreshold: clampPositive(
        Number(consumptionReview.longTextThreshold ?? fallback.consumptionReview.longTextThreshold)
      ),
      base: readGrant(consumptionReview.base, fallback.consumptionReview.base),
      detailed: readGrant(consumptionReview.detailed, fallback.consumptionReview.detailed),
    },
    referral: {
      referredPoints: clampNonNegative(Number(referral.referredPoints ?? fallback.referral.referredPoints)),
      referrerPoints: clampNonNegative(Number(referral.referrerPoints ?? fallback.referral.referrerPoints)),
    },
    birthday: {
      points: clampNonNegative(Number(birthday.points ?? fallback.birthday.points)),
    },
    streak: {
      milestones: milestones.length > 0 ? milestones : fallback.streak.milestones,
    },
    quest: {
      default: readGrant(quest.default, fallback.quest.default),
    },
    spin: {
      enabled: typeof spin.enabled === 'boolean' ? spin.enabled : fallback.spin.enabled,
      dailyLimit: clampPositive(Number(spin.dailyLimit ?? fallback.spin.dailyLimit)),
      prizes: spinPrizes.length > 0 ? spinPrizes : fallback.spin.prizes,
    },
  };
}

type PointsMatrixResource = { matrix: PointsMatrixForm; defaults: PointsMatrixForm };

function readDefaults(body: Record<string, unknown>): PointsMatrixForm {
  const d = body.defaults;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    throw new Error('Sunucu varsayılan matrisi döndürmedi');
  }
  return d as PointsMatrixForm;
}

async function loadPointsMatrix() {
  const body = await fetchResourceJson('/api/admin/settings/points-matrix', 'Puan matrisi alınamadı');
  const defaults = readDefaults(body);
  return {
    data: { matrix: normalizeClientMatrix(body.matrix, defaults), defaults },
    version: requireVersion(body),
  };
}

const HERO_PROPS = {
  eyebrow: 'Ekonomi',
  title: 'Puan matrisi',
  description: 'Feedback, streak, referral, doğum günü ve görev puan kurallarını yönetin.',
} as const;

const REFRESH_BUTTON_CLASS =
  'gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20';

/**
 * P0-28: matris YALNIZ sunucudan canlı değer + sürüm başarıyla okunduğunda düzenlenebilir.
 * Yükleme sürerken iskelet; hata olursa "Tekrar dene" ve Kaydet YOK (eskiden istemci
 * varsayılanları gerçekmiş gibi gösterilip tek Kaydet ile canlı ekonomiyi eziyordu).
 * Kaydetme `baseVersion` taşır; başka bir admin arada değiştirdiyse 409 + çakışma bandı.
 */
export default function AdminPointsMatrixPage() {
  const resource = useVersionedResource<PointsMatrixResource>(loadPointsMatrix);

  if (resource.status === 'ready' && resource.data && resource.version) {
    return (
      <PointsMatrixEditor
        key={resource.loadId}
        initial={resource.data.matrix}
        defaults={resource.data.defaults}
        initialVersion={resource.version}
        onReload={resource.reload}
        onCommitted={(matrix, version) => resource.commit({ matrix, defaults: resource.data!.defaults }, version)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        {...HERO_PROPS}
        icon={<Grid3x3 className="text-white" />}
        actions={
          <Button variant="outline" onClick={() => void resource.reload()} disabled={resource.status === 'loading'} className={REFRESH_BUTTON_CLASS}>
            <RefreshCw className={`h-4 w-4 ${resource.status === 'loading' ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />
      <QueryState
        query={resource.query}
        skeleton="form"
        isEmpty={() => false}
        loadingLabel="Puan matrisi yükleniyor…"
        error={{
          title: 'Puan matrisi yüklenemedi',
          description: 'Canlı ekonomi kuralları okunamadığı için düzenleme kilitlendi. Kayıtlı matris değişmedi; tekrar deneyin.',
        }}
      >
        {null}
      </QueryState>
    </div>
  );
}

function PointsMatrixEditor({
  initial,
  defaults,
  initialVersion,
  onReload,
  onCommitted,
}: {
  initial: PointsMatrixForm;
  defaults: PointsMatrixForm;
  initialVersion: string;
  onReload: () => unknown;
  onCommitted: (matrix: PointsMatrixForm, version: string) => void;
}) {
  const request = useCallback(
    (draft: PointsMatrixForm, baseVersion: string) =>
      saveVersioned('/api/admin/settings/points-matrix', 'PUT', { matrix: draft, baseVersion }, 'Kaydetme işlemi başarısız'),
    []
  );
  const parse = useCallback(
    (body: Record<string, unknown>) => ({ data: normalizeClientMatrix(body.matrix, defaults), version: requireVersion(body) }),
    [defaults]
  );
  const onSaved = useCallback(
    (next: PointsMatrixForm, version: string) => {
      onCommitted(next, version);
      toast.success('Puan matrisi güncellendi');
    },
    [onCommitted]
  );
  const onError = useCallback((error: unknown) => {
    toast.error(error instanceof Error ? error.message : 'Kaydetme sırasında hata oluştu');
  }, []);
  const form = useVersionedDraft<PointsMatrixForm>({ initial, initialVersion, request, parse, onSaved, onError });
  const matrix = form.draft;
  const setMatrix = form.setDraft;
  const saving = form.saving;
  const isDirty = form.dirty;
  const [sampleFeedbackLength, setSampleFeedbackLength] = useState(80);
  const [sampleReviewLength, setSampleReviewLength] = useState(30);
  const [sampleStreakDays, setSampleStreakDays] = useState(14);
  const [sampleTicket, setSampleTicket] = useState(45);


  const handleReset = () => {
    form.reset();
    toast.info('Değişiklikler geri alındı');
  };

  const updateNumber = (setter: () => void) => {
    setter();
  };

  // Sunucu yalnız TAM gün eşleşmesinde bonus verir (lib/points-rules.ts getStreakMilestoneBonus);
  // önizleme de aynı kuralı izler.
  const findClosestStreakBonus = (days: number) => {
    const exact = matrix.streak.milestones.find((m) => m.days === days);
    return exact?.points ?? 0;
  };

  const handleSave = () => {
    void form.save();
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
        {...HERO_PROPS}
        icon={<Grid3x3 className="text-white" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void onReload()} disabled={saving} className={REFRESH_BUTTON_CLASS}>
              <RefreshCw className="h-4 w-4" />
              Yenile
            </Button>
            <Button onClick={handleSave} disabled={saving || !isDirty} className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md">
              <Save className="h-4 w-4" />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        }
      />

      {form.conflict && (
        <VersionConflictBanner
          message={form.conflict.message}
          onReload={onReload}
          onOverwrite={form.conflict.currentVersion ? () => form.save({ overwrite: true }) : undefined}
        />
      )}

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
                      // Varsayılan sunucudan (GET `defaults`) gelir; istemci kopyası yok.
                      spin: {
                        enabled: defaults.spin.enabled,
                        dailyLimit: defaults.spin.dailyLimit,
                        prizes: defaults.spin.prizes.map((p) => ({ ...p })),
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
                  <p className="text-xs text-muted-foreground">{sampleStreakDays}. gün bonusu: +{streakSampleBonus} puan</p>
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
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
