'use client';

import { useState, useEffect, useRef, useMemo, type ElementType } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  Play,
  Trophy,
  Sparkles,
  Microscope,
  Brain,
  Lightbulb,
  Crown,
  MessageCircleMore,
  Radio,
  ListChecks,
  ScrollText,
  RadioTower,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentAudioVisualizerGrid } from '@/components/agents-ui/agent-audio-visualizer-grid';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { COUNCIL_AGENT_ORDER } from '@/lib/agent-dialogue';
import type { AgentName } from '@/lib/agent-personas';
import { mapAgentApiRunToCouncilUi, councilPersonasForUi } from '@/lib/council-run-mapper';

interface AgentMessage {
  id: string;
  agentName: string;
  stance: string;
  content: string;
  round: number;
}

interface AgentRun {
  topic: string;
  round: number;
  messages: AgentMessage[];
  decision?: {
    winner: string;
    summary: string;
    actions: Array<{ title: string; owner: string; priority: string }>;
  };
  personas?: Record<string, { codename: string; soulFile: string; thinkingStyle: string; grokRole?: string; sprite: { body: string; accent: string; speedMs: number } }>;
}

const AGENT_STYLES: Record<string, { label: string; bg: string; icon: ElementType }> = {
  Harper: { label: 'Harper · Veri', bg: 'bg-sky-500/10 dark:bg-sky-500/20', icon: Microscope },
  Benjamin: { label: 'Benjamin · Mantık', bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', icon: Brain },
  Lucas: { label: 'Lucas · Denge', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', icon: Lightbulb },
  Grok: { label: 'Grok · Kaptan', bg: 'bg-amber-500/10 dark:bg-amber-500/20', icon: Crown },
};

const STANCE_LABEL: Record<string, string> = {
  research: 'İnceleme',
  logic: 'Mantık',
  creative: 'Karşı senaryo',
  captain: 'Koordinasyon',
  consensus: 'Ana cevap',
};

export default function AgentCouncilPage() {
  const [goal, setGoal] = useState('Bu hafta churn sinyallerini azalt ve memnuniyeti ölçülebilir biçimde artır.');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [round, setRound] = useState(0);
  const streamRef = useRef<EventSource | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [dealers, setDealers] = useState<{ id: string; label: string }[]>([]);
  const [councilDealerId, setCouncilDealerId] = useState('');
  const [pushingCouncil, setPushingCouncil] = useState(false);
  /** URL'de ?runId= ile gelen kayıt görünümü */
  const [viewingHistoryRun, setViewingHistoryRun] = useState(false);

  const startFreshSession = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin/agent-council');
    }
    setViewingHistoryRun(false);
    setRun(null);
    setRound(0);
    setGoal('Bu hafta churn sinyallerini azalt ve memnuniyeti ölçülebilir biçimde artır.');
  };

  const sortedMessages = useMemo(() => {
    if (!run?.messages?.length) return [];
    const idx = (n: string) => {
      const i = COUNCIL_AGENT_ORDER.indexOf(n as AgentName);
      return i === -1 ? 99 : i;
    };
    return [...run.messages].sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return idx(a.agentName) - idx(b.agentName);
    });
  }, [run?.messages]);

  const captainAnswer = useMemo(() => {
    const m = sortedMessages.filter((x) => x.stance === 'consensus' && x.agentName === 'Grok').pop();
    return m?.content ?? null;
  }, [sortedMessages]);

  const liveCaption = useMemo(() => {
    if (!running || !run) return null;
    const maxR = run.messages.length ? Math.max(...run.messages.map((m) => m.round)) : 0;
    const inRound = run.messages.filter((m) => m.round === maxR);
    if (maxR === 0 && inRound.length === 0) return 'Uzmanlar yerlerini alıyor…';
    if (run.decision) return null;
    if (maxR >= 4) return 'Grok ana cevabı yazıyor…';
    const next = COUNCIL_AGENT_ORDER[inRound.length];
    if (next && inRound.length < 4) return `${next} düşünüyor — sıradaki konuşmacı`;
    return 'Tur kapanıyor…';
  }, [running, run]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages.length, run?.round]);

  useEffect(() => {
    const runId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('runId') : null;
    if (!runId) return;
    let cancelled = false;
    void fetch(`/api/admin/agents/run/${runId}`)
      .then((r) => r.json())
      .then((data: { success?: boolean; run?: Record<string, unknown> }) => {
        if (cancelled || !data.success || !data.run) return;
        const mapped = mapAgentApiRunToCouncilUi(data.run);
        setGoal(mapped.topic);
        setRound(mapped.round);
        setRun({ ...mapped, personas: councilPersonasForUi() });
        setViewingHistoryRun(true);
        toast.success('Kayıtlı konsey yüklendi');
      })
      .catch(() => toast.error('Konsey kaydı yüklenemedi'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/admin/users?role=DEALER&pageSize=50')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !Array.isArray(d.items)) return;
        setDealers(
          d.items.map((u: { id: string; businessName?: string | null; name?: string | null; email: string }) => ({
            id: u.id,
            label: u.businessName || u.name || u.email,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const pushCouncilToActions = async () => {
    if (!councilDealerId || !run?.decision?.actions?.length) {
      toast.error('Önce bayi seçin ve karar aksiyonları oluşsun');
      return;
    }
    setPushingCouncil(true);
    try {
      const res = await fetch('/api/admin/agents/council-to-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealerId: councilDealerId,
          topic: run.topic,
          actions: run.decision.actions.map((a) => ({
            title: a.title,
            owner: a.owner,
            priority: a.priority === 'high' || a.priority === 'low' ? a.priority : 'medium',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error && typeof data.error === 'object' && 'message' in data.error
              ? String((data.error as { message: string }).message)
              : 'Kayıt başarısız';
        throw new Error(msg);
      }
      toast.success(`${data.count} aksiyon bayi kuyruğuna yazıldı`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setPushingCouncil(false);
    }
  };

  const talk = async (newConversation: boolean) => {
    const topic = newConversation ? goal.trim() : (run?.topic ?? goal.trim());
    if (!topic) return;
    if (newConversation) setViewingHistoryRun(false);
    setRunning(true);
    try {
      const res = await fetch('/api/admin/agents/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          round: newConversation ? 0 : round,
          messages: newConversation ? [] : (run?.messages ?? []),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Konsey başlatılamadı');
      setRun({ ...data.state, personas: data.personas ?? councilPersonasForUi() });
      setRound(data.state.round);
      toast.success(newConversation ? 'Konsey tartışması başladı' : 'Yeni tur eklendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Konsey başlatılamadı');
    } finally {
      setRunning(false);
    }
  };

  const startLiveTalk = () => {
    const topic = goal.trim();
    if (!topic) return;
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setRun(null);
    setRound(0);
    setViewingHistoryRun(false);
    setRunning(true);

    const es = new EventSource(`/api/admin/agents/conversation/stream?topic=${encodeURIComponent(topic)}`);
    streamRef.current = es;

    es.addEventListener('meta', (evt) => {
      const data = JSON.parse((evt as MessageEvent).data);
      setRun({ topic: data.topic, round: 0, messages: [], personas: data.personas ?? councilPersonasForUi() });
    });

    es.addEventListener('round', (evt) => {
      const data = JSON.parse((evt as MessageEvent).data);
      setRound(data.round);
      setRun((prev) => {
        if (!prev) return { topic, round: data.round, messages: data.messages };
        return {
          ...prev,
          round: data.round,
          messages: [...prev.messages, ...data.messages],
          decision: data.decision ?? prev.decision,
        };
      });
    });

    es.addEventListener('done', (evt) => {
      const data = JSON.parse((evt as MessageEvent).data);
      setRun((prev) => ({
        ...(prev ?? { topic, round: data.round, messages: [] }),
        round: data.round,
        messages: data.messages,
        decision: data.decision,
      }));
      toast.success('Konsey tamamlandı — ana cevap hazır');
      setRunning(false);
      es.close();
      streamRef.current = null;
    });

    es.onerror = () => {
      toast.error('Canlı akış kesildi');
      setRunning(false);
      es.close();
      streamRef.current = null;
    };
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.close();
    };
  }, []);

  const stanceClass = (stance: string) => {
    if (stance === 'research') return 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200';
    if (stance === 'logic') return 'border-indigo-500/50 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200';
    if (stance === 'creative') return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    if (stance === 'captain') return 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100';
    if (stance === 'consensus') return 'border-primary bg-primary/15 text-primary';
    return 'border-muted bg-muted/40';
  };

  const personaState = (name: string): 'idle' | 'listening' | 'thinking' | 'speaking' => {
    if (!run) return 'idle';
    const messages = run.messages;
    if (messages.length === 0) return running ? 'thinking' : 'idle';

    const maxR = Math.max(...messages.map((m) => m.round));
    const inRound = messages.filter((m) => m.round === maxR);
    const lastMsg = inRound[inRound.length - 1];

    if (lastMsg?.stance === 'consensus') {
      return name === 'Grok' ? 'speaking' : 'listening';
    }

    if (lastMsg?.agentName === name) return 'speaking';

    const spoken = new Set(inRound.map((m) => m.agentName));
    if (spoken.has(name)) return 'listening';

    if (running && maxR >= 1 && maxR <= 4 && inRound.length < 4) {
      const nextSpeaker = COUNCIL_AGENT_ORDER[inRound.length];
      if (nextSpeaker === name) return 'thinking';
    }

    return 'listening';
  };

  return (
    <div className="relative space-y-6">
      <AdminPremiumHero
        eyebrow="Çoklu ajan konseyi"
        title="Grok tarzı konsey"
        description="Dört uzman (Harper veri, Benjamin mantık, Lucas karşı senaryo, Grok kaptan) soruya paralel yaklaşır; üç tur boyunca birbirlerinin argümanlarını yüzleştirir, ardından Grok tek parça ana cevabı ve aksiyon paketini sunar — xAI çoklu ajan düzenine paralel."
        icon={<Sparkles className="text-white" />}
        aside={
          <div className="rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:border-white/25 dark:bg-white/15 dark:text-white/95">
            {running ? 'TARTISMA / CANLI' : viewingHistoryRun ? 'GEÇMİŞ' : 'HAZIR'}
          </div>
        }
      />

      {viewingHistoryRun && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="text-amber-950 dark:text-amber-100">
            Geçmiş bir konsey kaydı açık. Yeni tartışma için oturumu sıfırlayın veya doğrudan yeni görev girin.
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={startFreshSession}>
            Yeni oturum
          </Button>
        </div>
      )}

      {running && liveCaption && (
        <div
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground shadow-sm"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
          </span>
          <RadioTower className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="font-medium">{liveCaption}</span>
        </div>
      )}

      <Card className="rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle id="agent-council-goal-heading" className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" aria-hidden />
            Görev / soru
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Konsey her turda Harper → Benjamin → Lucas → Grok sırasıyla konuşur; 4. turda yalnızca Grok ana cevabı yazar.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Stratejik hedef veya sorunuzu yazın…"
            className="text-base"
            aria-labelledby="agent-council-goal-heading"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void talk(true)}
              disabled={running}
              className="gap-2"
              aria-busy={running}
            >
              <Play className="h-4 w-4" aria-hidden />
              {running ? 'Çalışıyor…' : 'Konseyi başlat (tur tur)'}
            </Button>
            <Button onClick={startLiveTalk} disabled={running} variant="secondary" className="gap-2">
              <Radio className="h-4 w-4" aria-hidden />
              Canlı akış (SSE)
            </Button>
            <Button
              onClick={() => void talk(false)}
              disabled={running || !run || !!run.decision}
              variant="outline"
              className="gap-2"
            >
              <MessageCircleMore className="h-4 w-4" aria-hidden />
              Sonraki tur
            </Button>
          </div>
        </CardContent>
      </Card>

      {run && (
        <>
          <Card className="rounded-2xl border bg-card/90 backdrop-blur-xl shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Uzmanlar</CardTitle>
              <p className="text-xs text-muted-foreground">
                xAI Grok 4.20 çoklu ajan yapısına göre: araştırma (Harper), mantık (Benjamin), alternatif / denge (Lucas), koordinasyon ve ana cevap (Grok).
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(run.personas ?? {}).map(([name, persona]) => {
                  const ps = personaState(name);
                  return (
                  <motion.div
                    key={name}
                    layout
                    initial={false}
                    animate={{
                      scale: ps === 'speaking' ? 1.02 : 1,
                      transition: { type: 'spring', stiffness: 420, damping: 28 },
                    }}
                    className={`rounded-xl border bg-muted/30 p-3 transition-shadow duration-300 ${
                      ps === 'speaking'
                        ? 'shadow-lg ring-2 ring-primary/70 ring-offset-2 ring-offset-background'
                        : ps === 'thinking'
                          ? 'shadow-md ring-1 ring-amber-500/40'
                          : ''
                    }`}
                  >
                    <div
                      className="relative mb-2 h-16 overflow-hidden rounded-lg border bg-background"
                      style={{ imageRendering: 'pixelated' }}
                    >
                      <AgentAudioVisualizerGrid
                        size="xl"
                        color={persona.sprite.body}
                        rowCount={11}
                        columnCount={11}
                        radius={52}
                        state={personaState(name)}
                        className="mx-auto h-full w-full p-2"
                      />
                    </div>
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground">{persona.codename}</p>
                    <p className="mt-1 text-xs leading-snug">{persona.grokRole ?? persona.thinkingStyle}</p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {ps === 'speaking' && '● Konuşuyor'}
                      {ps === 'thinking' && '○ Düşünüyor'}
                      {ps === 'listening' && '◉ Dinliyor'}
                      {ps === 'idle' && '—'}
                    </p>
                  </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-primary/5 to-card shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle id="council-transcript-heading" className="flex items-center gap-2 text-lg">
                <ScrollText className="h-5 w-5 text-primary" aria-hidden />
                Tartışma transkripti
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Mesajlar kronolojik; her turda dört uzman sırayla konuşur. Son blok Grok’un ana cevabıdır.
              </p>
            </CardHeader>
            <CardContent>
              <div
                className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto rounded-lg border bg-background/80 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                role="region"
                aria-labelledby="council-transcript-heading"
                tabIndex={0}
              >
                {sortedMessages.map((message, mi) => {
                  const style = AGENT_STYLES[message.agentName] ?? AGENT_STYLES.Grok;
                  const Icon = style.icon;
                  const isFinal = message.stance === 'consensus';
                  return (
                    <motion.div
                      key={message.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(mi * 0.03, 0.24) }}
                      className={`rounded-xl border p-3 ${isFinal ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card/90'}`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className={`flex items-center gap-2 font-medium ${style.bg} rounded-md px-2 py-0.5`}>
                          <Icon className="h-4 w-4 shrink-0 opacity-80" />
                          {message.agentName}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Tur {message.round}
                          </Badge>
                          <Badge className={`border text-[10px] ${stanceClass(message.stance)}`}>
                            {STANCE_LABEL[message.stance] ?? message.stance}
                          </Badge>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-foreground/95">{message.content}</p>
                    </motion.div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            </CardContent>
          </Card>

          {captainAnswer && (
            <Card className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 shadow-xl dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                  <Crown className="h-6 w-6" />
                  Ana cevap (Grok · Kaptan)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{captainAnswer}</p>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border bg-card shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                {run.decision ? `Öne çıkan uzman: ${run.decision.winner}` : `Tur ${run.round} · devam ediyor`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {run.decision?.summary ?? 'Üç tartışma turu tamamlanınca Grok sentezler ve kazanan uzman çizgisi seçilir.'}
              </p>
            </CardContent>
          </Card>

          {run.decision?.actions?.length ? (
            <Card className="rounded-2xl border bg-card shadow-md">
              <CardHeader>
                <CardTitle className="text-base">Aksiyon paketi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {run.decision.actions.map((action) => (
                  <div key={`${action.owner}-${action.title}`} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Sahip: {action.owner} · Öncelik: {action.priority}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {run.decision?.actions?.length ? (
            <Card className="rounded-2xl border bg-card shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Bayi aksiyon kuyruğuna aktar
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Seçilen bayinin ActionItem listesine yazılır.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Bayi</label>
                  <Select value={councilDealerId} onValueChange={setCouncilDealerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Bayi seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" onClick={() => void pushCouncilToActions()} disabled={pushingCouncil || !councilDealerId} className="shrink-0">
                  {pushingCouncil ? 'Yazılıyor…' : 'Aksiyonları yaz'}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
