'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Gamepad2,
  Loader2,
  Save,
  RotateCcw,
  Pencil,
  X,
  Users,
  Trophy,
  Coins,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Admin mini oyun kontrol paneli. /api/admin/games (ADMIN-gated) ile çalışır. */

interface GameDefaults {
  title: string;
  description: string;
  emoji: string;
  accent: string;
  maxScore: number;
  rewardThreshold: number;
  rewardPoints: number;
  rewardXp: number;
  minDurationSec: number;
}
interface GameOverride {
  enabled: boolean;
  title: string | null;
  description: string | null;
  emoji: string | null;
  accent: string | null;
  maxScore: number | null;
  rewardThreshold: number | null;
  rewardPoints: number | null;
  rewardXp: number | null;
  minDurationSec: number | null;
}
interface GameRow {
  gameType: string;
  defaults: GameDefaults;
  override: GameOverride | null;
  effective: GameDefaults & { enabled: boolean };
  stats: { playedToday: number; played30d: number; rewarded30d: number; pointsAwarded30d: number };
}

// Düzenleme formu state'i — boş string = "varsayılana dön".
interface EditState {
  enabled: boolean;
  title: string;
  description: string;
  emoji: string;
  accent: string;
  maxScore: string;
  rewardThreshold: string;
  rewardPoints: string;
  rewardXp: string;
  minDurationSec: string;
}

function toEdit(g: GameRow): EditState {
  const ov = g.override;
  const s = (v: string | null | undefined) => (v ?? '');
  const n = (v: number | null | undefined) => (v != null ? String(v) : '');
  return {
    enabled: g.effective.enabled,
    title: s(ov?.title),
    description: s(ov?.description),
    emoji: s(ov?.emoji),
    accent: s(ov?.accent),
    maxScore: n(ov?.maxScore),
    rewardThreshold: n(ov?.rewardThreshold),
    rewardPoints: n(ov?.rewardPoints),
    rewardXp: n(ov?.rewardXp),
    minDurationSec: n(ov?.minDurationSec),
  };
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingType, setSavingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/games');
      const data = await res.json();
      if (data.success) setGames(data.games);
      else toast.error(data.error || 'Yüklenemedi');
    } catch {
      toast.error('Oyun ayarları yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (g: GameRow) => {
    setEditing(g.gameType);
    setEdit(toEdit(g));
  };
  const cancelEdit = () => {
    setEditing(null);
    setEdit(null);
  };

  // Aktif/pasif anahtarı — kart üzerinden anında kaydeder (düzenleme modu gerekmez).
  const toggleEnabled = async (g: GameRow, enabled: boolean) => {
    setSavingType(g.gameType);
    try {
      const res = await fetch('/api/admin/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: g.gameType, enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Kaydedilemedi');
      toast.success(enabled ? `${g.effective.title} açıldı` : `${g.effective.title} kapatıldı`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingType(null);
    }
  };

  const save = async (gameType: string) => {
    if (!edit) return;
    setSavingType(gameType);
    try {
      // Boş string → null (varsayılana dön); sayısal alanları sayıya çevir.
      const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
      const strOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
      const body = {
        gameType,
        enabled: edit.enabled,
        title: strOrNull(edit.title),
        description: strOrNull(edit.description),
        emoji: strOrNull(edit.emoji),
        accent: strOrNull(edit.accent),
        maxScore: numOrNull(edit.maxScore),
        rewardThreshold: numOrNull(edit.rewardThreshold),
        rewardPoints: numOrNull(edit.rewardPoints),
        rewardXp: numOrNull(edit.rewardXp),
        minDurationSec: numOrNull(edit.minDurationSec),
      };
      const res = await fetch('/api/admin/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Kaydedilemedi');
      toast.success('Oyun ayarları kaydedildi');
      cancelEdit();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeCount = games.filter((g) => g.effective.enabled).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Gamepad2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mini Oyun Yönetimi</h1>
            <p className="text-muted-foreground">
              {activeCount}/{games.length} oyun aktif · ödül, eşik, süre ve görselleri buradan yönet
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {games.map((g, i) => {
          const isEditing = editing === g.gameType;
          const busy = savingType === g.gameType;
          const eff = g.effective;
          const hasOverride = !!g.override;
          return (
            <motion.div
              key={g.gameType}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
            >
              <Card
                className="overflow-hidden border-2 transition-colors"
                style={{
                  borderColor: eff.enabled ? `${eff.accent}55` : 'rgba(120,120,120,0.25)',
                  opacity: eff.enabled ? 1 : 0.72,
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl" style={{ filter: eff.enabled ? 'none' : 'grayscale(1)' }}>
                        {eff.emoji}
                      </span>
                      <div>
                        <CardTitle className="text-lg">{eff.title}</CardTitle>
                        <p className="font-mono text-[11px] text-muted-foreground">{g.gameType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasOverride && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                          özelleştirilmiş
                        </span>
                      )}
                      <Switch
                        checked={eff.enabled}
                        disabled={busy}
                        onCheckedChange={(c) => toggleEnabled(g, c)}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* İstatistik şeridi */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat icon={<Users className="h-3.5 w-3.5" />} label="Bugün" value={g.stats.playedToday} />
                    <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="30g oynanma" value={g.stats.played30d} />
                    <Stat icon={<Coins className="h-3.5 w-3.5" />} label="30g puan" value={g.stats.pointsAwarded30d} />
                  </div>

                  {/* Effective özet (düzenleme kapalıyken) */}
                  {!isEditing && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Pill>Ödül: {eff.rewardPoints}p / {eff.rewardXp}xp</Pill>
                      <Pill>Eşik: {eff.rewardThreshold}/{eff.maxScore}</Pill>
                      <Pill>Min süre: {eff.minDurationSec}sn</Pill>
                    </div>
                  )}

                  {/* Düzenleme formu */}
                  {isEditing && edit && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Boş bırakılan alan registry varsayılanını kullanır.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Başlık" placeholder={g.defaults.title} value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
                        <Field label="Emoji" placeholder={g.defaults.emoji} value={edit.emoji} onChange={(v) => setEdit({ ...edit, emoji: v })} />
                      </div>
                      <Field label="Açıklama" placeholder={g.defaults.description} value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} />
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Renk (hex)" placeholder={g.defaults.accent} value={edit.accent} onChange={(v) => setEdit({ ...edit, accent: v })} />
                        <Field label="Ödül puanı" type="number" placeholder={String(g.defaults.rewardPoints)} value={edit.rewardPoints} onChange={(v) => setEdit({ ...edit, rewardPoints: v })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Ödül XP" type="number" placeholder={String(g.defaults.rewardXp)} value={edit.rewardXp} onChange={(v) => setEdit({ ...edit, rewardXp: v })} />
                        <Field label="Maks. skor" type="number" placeholder={String(g.defaults.maxScore)} value={edit.maxScore} onChange={(v) => setEdit({ ...edit, maxScore: v })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Ödül eşiği" type="number" placeholder={String(g.defaults.rewardThreshold)} value={edit.rewardThreshold} onChange={(v) => setEdit({ ...edit, rewardThreshold: v })} />
                        <Field label="Min. süre (sn)" type="number" placeholder={String(g.defaults.minDurationSec)} value={edit.minDurationSec} onChange={(v) => setEdit({ ...edit, minDurationSec: v })} />
                      </div>
                    </div>
                  )}

                  {/* Aksiyonlar */}
                  <div className="flex items-center gap-2 pt-1">
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="gradient" disabled={busy} onClick={() => save(g.gameType)}>
                          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                          Kaydet
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={cancelEdit}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Vazgeç
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEdit(g)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Düzenle
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">{icon}</div>
      <div className="text-base font-bold tabular-nums">{value.toLocaleString('tr-TR')}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">{children}</span>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </div>
  );
}
