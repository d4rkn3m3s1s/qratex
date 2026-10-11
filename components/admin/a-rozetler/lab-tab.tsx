'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Beaker, Box, CheckCircle2, ExternalLink, FlaskConical, Lock, Play, ShieldAlert, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionCard, useUrlState } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, InlineError, QueryState } from '@/components/states';
import type { LabCatalog, LabCharacterOption, LabClassifyResult, LabRevealCharacter, LabStatus } from '@/lib/admin-badges/contract';
import type { Moment } from '@/lib/moments/types';
import { badgeKeys, errorText, fetchBadges, fetchLabCatalog, fetchLabStatus, fetchLabTargets, labClassify, labPreview, labSandbox } from './api';
import { fmtAgo, fmtNumber } from './format';
import { ProgressBar } from './parts';
import { useSourceT } from '@/components/ds/page/source-dict';
import { BADGES_DICT, useBadgesAdminCopy } from './copy';

// Müşterinin gördüğü 3B/canvas içerik yalnız istenince yüklenir (ana paket dışında).
const CharacterReveal = dynamic(() => import('@/components/customer/character-reveal').then((m) => m.CharacterReveal), { ssr: false });
const BadgeScene = dynamic(() => import('@/components/moments/scenes/badge-scene'), { ssr: false });

const SAMPLES: { label: string; text: string }[] = [
  { label: 'Dram / Suç', text: 'Mekan temiz, çalışanlar güler yüzlü, yemekler başarılı, fiyatlar makul. Tek eksik: tatlı menüsü kısa.' },
  { label: 'Komedi', text: 'Servis o kadar yavaştı ki beklerken sakalım uzadı, kuaför randevusu almam gerekecek.' },
  { label: 'Fantastik', text: 'Kapıdan girer girmez başka bir dünyaya adım atıyorsunuz; loş ışık, tarçın kokusu... Mutlaka keşfedin.' },
  { label: 'Gizem / Gerilim', text: 'Garsonun elleri titriyordu, hesabı getirirken gözünü kaçırdı. Bir şeyler ters ama çözemedim.' },
  {
    label: 'Gizemli',
    text: 'Kahvenin asitliği ilk yudumda keskin, sonra kakao notasına dönüşüyor; demleme süresini bilerek kısa tutmuşlar. Bu dengeyi kuran barista işinin felsefesini biliyor.',
  },
];

export default function LabTab() {
  return (
    <div className="space-y-6 pt-4">
      <SandboxSection />
      <div className="grid gap-6 xl:grid-cols-2">
        <ClassifierSection />
        <ScenePreviewSection />
      </div>
      <CharacterGallerySection />
    </div>
  );
}

// ───────────────────────────── Sandbox ─────────────────────────────

function SandboxSection() {
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const { get, set } = useUrlState();
  const user = get('user') ?? '';
  const [search, setSearch] = useState('');
  const searchId = useId();
  const targets = useQuery({ queryKey: badgeKeys.labTargets(search.trim()), queryFn: () => fetchLabTargets(search.trim()), staleTime: 30_000 });
  const status = useQuery({ queryKey: badgeKeys.labStatus(user), queryFn: () => fetchLabStatus(user), enabled: Boolean(user), staleTime: 5_000 });

  return (
    <SectionCard
      title={ux.testHesabindaUctanUca}
      description={ux.karakterBariniUretimdekiHesapla}
      icon={<Beaker />}
    >
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor={searchId}>{bx.searchTestAccount}</Label>
          <Input id={searchId} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ux.ePostaYaDa} className="min-h-11 sm:min-h-10" />
          <QueryState
            query={targets}
            skeleton="list"
            isEmpty={(d) => d.length === 0}
            empty={{ title: ux.testHesabiBulunamadi, description: ux.demoMusteriHesabiOlusturun, compact: true }}
          >
            {(items) => (
              <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label={ux.testHesaplari}>
                {items.map((t) => {
                  const key = t.email ?? t.id;
                  const active = user === key;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => set({ user: key })}
                        className={`flex min-h-11 w-full flex-col items-start rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-surface-2'}`}
                      >
                        <span className="font-medium text-fg">{t.name || ux.adsiz}</span>
                        <span className="text-xs text-fg-muted">
                          {t.email} · {t.isDemo ? 'demo' : 'izin listesi'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </div>
        <div>
          {!user ? (
            <EmptyState icon={FlaskConical} title={ux.birTestHesabiSecin} description={ux.secilenHesabinKategoriIlerlemesi} compact />
          ) : (
            <QueryState query={status} skeleton="detail">
              {(s) => <TargetPanel s={s} />}
            </QueryState>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function TargetPanel({ s }: { s: LabStatus }) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const qc = useQueryClient();
  const [category, setCategory] = useState(s.categories[0]?.key ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const userKey = s.target.email ?? s.target.id;
  const locked = !s.mutationsEnabled || !s.target.allowed;
  const lockReason = !s.mutationsEnabled
    ? ux.buOrtamdaVeriDegistiren
    : !s.target.allowed
      ? ux.buHesapTestHesabi
      : null;

  const run = async (action: 'fill' | 'reset' | 'clearCategories' | 'cleanupTest') => {
    setBusy(action);
    setMessage(null);
    try {
      const r = await labSandbox(action === 'fill' ? { action, user: userKey, category } : { action, user: userKey });
      qc.setQueryData(badgeKeys.labStatus(userKey), r.status);
      setMessage(r.message);
      toast.success(r.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">{s.target.name || ux.adsiz}</span>
        <span className="text-sm text-fg-muted">{s.target.email}</span>
        <StatusBadge size="sm" tone={s.target.allowed ? 'success' : 'danger'} label={s.target.allowed ? ux.testHesabi : ux.testHesabiDegil} />
        {s.target.allowed ? (
          <Button asChild variant="link" size="sm" className="ml-auto h-auto min-h-11 px-0 sm:min-h-0">
            <Link href="/customer/me/badges" target="_blank" rel="noopener noreferrer">
              {ux.musteriRozetSayfasi}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
      {lockReason ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {lockReason}
        </p>
      ) : null}

      <ul className="space-y-3" aria-label={ux.kategoriIlerlemesi}>
        {s.categories.map((c) => (
          <li key={c.key} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-fg">
                <span aria-hidden>{c.emoji} </span>
                {c.name}
              </span>
              <span className="tabular-nums text-fg-muted">
                {fz.progressLine(fmtNumber(c.current), fmtNumber(c.threshold), fmtNumber(c.counted))}
                {c.minReviewLength > 0 ? fz.minChars(c.minReviewLength) : ''}{fz.takenLeft(c.taken, c.available)}
              </span>
            </div>
            <ProgressBar value={c.current} max={c.threshold} ready={c.ready} label={fz.progressOf(c.name)} />
            {c.ready ? (
              <p className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {ux.hazirMusteriAcilisiBaslatabilir}
              </p>
            ) : c.available === 0 ? (
              <p className="text-xs text-fg-muted">{bx.exhausted}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="text-sm text-fg-muted">
        Sahip olunan karakterler:{' '}
        {s.ownedCharacters.length === 0
          ? 'yok'
          : s.ownedCharacters.map((o) => `${o.name} (${fmtAgo(o.earnedAt)})`).join(', ')}
        <br />
        {fz.synthetic(fmtNumber(s.synthetic.consumptions), fmtNumber(s.synthetic.cards))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="min-w-[12rem] space-y-1">
          <Label htmlFor="lab-fill-cat">Doldurulacak kategori</Label>
          <Select value={category} onValueChange={setCategory} disabled={locked}>
            <SelectTrigger id="lab-fill-cat" className="min-h-11 sm:min-h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {s.categories.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="min-h-11 sm:min-h-10" disabled={locked || busy !== null} onClick={() => run('fill').catch((e) => toast.error(errorText(e)))}>
          <Wand2 className="h-4 w-4" aria-hidden />
          {busy === 'fill' ? 'Dolduruluyor…' : ux.bariHazirYap}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <ConfirmAction
            tone="danger"
            title={ux.karakterRozetleriSifirlansinMi}
            description={ux.testHesabininTumKarakter}
            confirmPhrase="SIFIRLA"
            confirmLabel={ux.sifirla}
            disabled={locked || busy !== null}
            impact={[{ label: ux.kaldirilacakKarakterRozeti, value: fmtNumber(s.ownedCharacters.length), emphasis: true }]}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={locked || busy !== null}>
                {ux.rozetleriSifirla}
              </Button>
            }
            onConfirm={() => run('reset')}
          />
          <ConfirmAction
            tone="danger"
            title={ux.yorumKategorileriTemizlensinMi}
            description={ux.testHesabininTumYorumlarindaki}
            confirmPhrase={ux.temizle}
            confirmLabel={ux.temizle2}
            disabled={locked || busy !== null}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={locked || busy !== null}>
                Kategorileri temizle
              </Button>
            }
            onConfirm={() => run('clearCategories')}
          />
          <ConfirmAction
            tone="warning"
            title={ux.sentetikTestVerisiSilinsin}
            description={ux.yalnizKarakterTestIsaretli}
            irreversibleNote={false}
            confirmLabel={ux.sil}
            disabled={locked || busy !== null}
            impact={[
              { label: ux.sentetikTuketim, value: fmtNumber(s.synthetic.consumptions) },
              { label: ux.testKarti, value: fmtNumber(s.synthetic.cards) },
            ]}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={locked || busy !== null}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Test verisini sil
              </Button>
            }
            onConfirm={() => run('cleanupTest')}
          />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {message ?? ''}
      </p>
    </div>
  );
}

// ───────────────────────────── Sınıflandırıcı ─────────────────────────────

const AI_ERROR: Record<string, string> = {
  unavailable: 'AI yanıt vermedi; üretim de bu durumda ilk uygun karakteri gerekçesiz atar.',
  parse: 'AI yanıtı okunamadı; ilk uygun karakter seçildi.',
  invalid_choice: 'AI listede olmayan bir karakter önerdi; ilk uygun karakter seçildi.',
};

function ClassifierSection() {
  const fz = useBadgesAdminCopy().fx;
  const L = useSourceT(BADGES_DICT);
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LabClassifyResult | null>(null);
  return (
    <SectionCard title={ux.canliSiniflandirma} description={ux.uretimdekiSiniflandiriciVeKarakter} icon={<Sparkles />}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || text.trim().length < 3) return;
          setBusy(true);
          setError(null);
          try {
            setResult(await labClassify(text.trim()));
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-text`}>{bx.sampleReview}</Label>
          <Textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} aria-describedby={`${id}-count`} />
          <p id={`${id}-count`} className="text-xs text-fg-muted">
            {fz.shortNote(text.trim().length)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label={ux.ornekYorumlar}>
          {SAMPLES.map((s) => (
            <Button key={s.label} type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setText(s.text)}>
              {s.label}
            </Button>
          ))}
        </div>
        <Button type="submit" className="min-h-11 sm:min-h-10" disabled={busy || text.trim().length < 3} aria-busy={busy}>
          {busy ? ux.siniflandiriliyor : ux.siniflandir}
        </Button>
      </form>
      {error ? <InlineError variant="banner">{error}</InlineError> : null}
      <div role="status" aria-live="polite" className="mt-3">
        {result ? (
          <div className="space-y-1 rounded-lg border border-border bg-surface-2 p-3 text-sm">
            {result.reason === 'too_short' ? (
              <p>{bx.tooShort}</p>
            ) : result.reason === 'unclassified' ? (
              <p>{bx.unclassified}</p>
            ) : (
              <>
                <p>
                  Kategori: <strong>{result.category?.emoji} {result.category?.name}</strong> <span className="text-fg-muted">({result.category?.key})</span>
                </p>
                <p>
                  Karakter: <strong>{result.character?.name ?? '—'}</strong>{' '}
                  {result.character ? <span className="text-fg-muted">({result.character.source === 'ai' ? ux.aiSecimi : ux.yedekSecim})</span> : null}
                </p>
                {result.character?.why ? <p className="italic text-fg-muted">“{result.character.why}”</p> : null}
                {result.character?.aiError ? <p className="text-warning">{L(AI_ERROR[result.character.aiError] ?? result.character.aiError)}</p> : null}
              </>
            )}
            <p className="text-xs text-fg-muted">{fz.latency(fmtNumber(result.latencyMs))}</p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ───────────────────────────── 3B rozet sahnesi ─────────────────────────────

function ScenePreviewSection() {
  const uy = useBadgesAdminCopy().ui2;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const { get, set } = useUrlState();
  const sceneId = get('scene') ?? '';
  const pickerId = useId();
  const list = useQuery({
    queryKey: badgeKeys.list('lab-scene'),
    queryFn: () => fetchBadges('tab=normal&sort=name.asc&page=1&size=100'),
    staleTime: 60_000,
  });
  const [playing, setPlaying] = useState(false);
  const badge = list.data?.items.find((b) => b.id === sceneId) ?? null;
  const moment = useMemo<Moment | null>(
    () =>
      badge
        ? {
            id: `preview-${badge.id}`,
            kind: 'badge',
            createdAt: new Date().toISOString(),
            payload: { badgeId: badge.id, name: badge.name, icon: badge.icon, rarity: badge.rarity, color: badge.color, hidden: true },
          }
        : null,
    [badge]
  );
  return (
    <SectionCard title={ux.t3bRozetAniOnizlemesi} description={ux.musterininRozetKazanincaGordugu} icon={<Box />}>
      <QueryState query={list} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: ux.onizlenecekRozetYok, compact: true }}>
        {(d) => (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1">
              <Label htmlFor={pickerId}>{uy.rozet}</Label>
              <Select value={sceneId || undefined} onValueChange={(v) => set({ scene: v })}>
                <SelectTrigger id={pickerId} className="min-h-11 sm:min-h-10">
                  <SelectValue placeholder={ux.rozetSecin} />
                </SelectTrigger>
                <SelectContent>
                  {d.items.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="min-h-11 sm:min-h-10" disabled={!moment} onClick={() => setPlaying(true)}>
              <Play className="h-4 w-4" aria-hidden />
              Sahneyi oynat
            </Button>
          </div>
        )}
      </QueryState>
      {sceneId && list.data && !badge ? <p className="mt-2 text-sm text-fg-muted">{bx.notInList}</p> : null}
      {playing && moment ? <BadgeScene moment={moment} onDone={() => setPlaying(false)} /> : null}
    </SectionCard>
  );
}

// ───────────────────────────── Karakter galerisi + açılış ─────────────────────────────

function CharacterGallerySection() {
  const ux = useBadgesAdminCopy().ui;
  const q = useQuery({ queryKey: badgeKeys.labCatalog(), queryFn: fetchLabCatalog, staleTime: 60_000 });
  return (
    <SectionCard
      title={ux.karakterGalerisiVeAcilis}
      description={ux.herKarakterinKademesiOdulu}
      icon={<Sparkles />}
    >
      <QueryState query={q} skeleton="cards">
        {(cat) => <Gallery cat={cat} />}
      </QueryState>
    </SectionCard>
  );
}

const TIER_LABEL: Record<string, string> = { common: 'Yaygın', rare: 'Nadir', legendary: 'Efsanevi' };

function Gallery({ cat }: { cat: LabCatalog }) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const { get, set } = useUrlState();
  const selected = get('reveal') ?? '';
  const [variant, setVariant] = useState<'orb' | 'mascot'>('orb');
  const [why, setWhy] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [character, setCharacter] = useState<LabRevealCharacter | null>(null);
  const id = useId();
  const current: LabCharacterOption | undefined = cat.characters.find((c) => c.badgeId === selected);
  useEffect(() => {
    setCharacter(null);
    setError(null);
  }, [selected]);
  const missingText = cat.characters.filter((c) => !c.hasRevealText).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {fz.characterCount(fmtNumber(cat.characters.length), fmtNumber(missingText))}
        {cat.unassigned.length ? fz.uncategorized(cat.unassigned.join(', ')) : ''}
      </p>
      {cat.categories.map((g) => {
        const items = cat.characters.filter((c) => c.categoryKey === g.key);
        return (
          <section key={g.key} aria-labelledby={`${id}-${g.key}`} className="space-y-2">
            <h4 id={`${id}-${g.key}`} className="flex items-center gap-2 text-sm font-medium text-fg">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: g.accent }} />
              {g.emoji} {g.name}
            </h4>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((c) => {
                const active = c.badgeId === selected;
                return (
                  <li key={c.badgeId}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => set({ reveal: c.badgeId })}
                      className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-surface-2'}`}
                    >
                      <span className="font-medium text-fg">{c.name}</span>
                      <span className="text-xs text-fg-muted">
                        {fz.tierLine(c.tier ? (fz.tiers[c.tier] ?? TIER_LABEL[c.tier] ?? c.tier) : fz.noTier, fmtNumber(c.rewardPoints), fmtNumber(c.holders))}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {!c.hasRevealText ? <StatusBadge size="sm" tone="warning" label={ux.acilisMetniYok} /> : null}
                        {!c.isActive ? <StatusBadge size="sm" tone="neutral" icon={Lock} label={ux.pasif} /> : null}
                        {!c.hasRecord ? <StatusBadge size="sm" tone="info" label={ux.kayitIlkKazanimda} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {current ? (
        <form
          className="space-y-3 rounded-xl border border-border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const ratePct = rate.trim() === '' ? undefined : Math.max(0, Math.min(100, Number(rate.replace(',', '.'))));
              setCharacter(await labPreview({ badgeId: current.badgeId, why: why.trim() || undefined, ...(ratePct !== undefined && Number.isFinite(ratePct) ? { ratePct } : {}) }));
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="font-medium text-fg">{fz.revealPreview(current.name)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${id}-variant`}>{bx.appearance}</Label>
              <Select value={variant} onValueChange={(v) => setVariant(v as 'orb' | 'mascot')}>
                <SelectTrigger id={`${id}-variant`} className="min-h-11 sm:min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orb">{bx.fateOrb}</SelectItem>
                  <SelectItem value="mascot">Maskot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${id}-why`}>{bx.reasonOptional}</Label>
              <Input id={`${id}-why`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder={ux.bossaOrnekGerekceKullanilir} className="min-h-11 sm:min-h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-rate`}>{bx.ownerRate}</Label>
              <Input id={`${id}-rate`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={ux.gercekOran} className="min-h-11 sm:min-h-10" />
            </div>
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={busy} aria-busy={busy}>
            <Play className="h-4 w-4" aria-hidden />
            {busy ? ux.hazirlaniyor : ux.acilisiOynat}
          </Button>
        </form>
      ) : (
        <EmptyState icon={Sparkles} title={ux.birKarakterSecin} description={ux.acilisiOynatmakIcinGaleriden} compact />
      )}

      {character ? <CharacterReveal open onClose={() => setCharacter(null)} variant={variant} character={character} allowShare={false} /> : null}
    </div>
  );
}
