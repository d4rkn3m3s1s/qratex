'use client';

/**
 * Modüller sekmesi — eski /admin/innovation'dan kalan, gerçekten uygulanan ayarlar:
 * modül anahtarları (etiket + açıklama, kapatmada etki onayı), davet limitleri (açık Kaydet +
 * kirli durum), partner özet webhook'u (https doğrulaması, gizli değer yalnız sunucuda üretilir
 * ve bir kez gösterilir). Her yazım iyimser kilitli (409 → güncel hâl yüklenir) ve denetimli.
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Copy, KeyRound, Loader2, Power, Users, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import type { SegmentsCopy } from '../copy';
import { MODULE_FEATURE_KEYS, isPublicHttpsUrl, type ModuleFeatureKey, type ModulesState } from '../domain';
import { ApiRequestError, fetchModules, patchFeatures, patchPartner, patchReferral, rotateSecret } from '../client/api';

const KEY = ['admin-segments', 'modules'] as const;

export function ModulesTab({ c }: { c: SegmentsCopy }) {
  const query = useQuery({ queryKey: KEY, queryFn: ({ signal }) => fetchModules(signal), staleTime: 30_000 });
  return (
    <div className="space-y-5">
      <p className="qx-small max-w-3xl text-fg-muted">{c.m.intro}</p>
      <QueryState query={query} skeleton="form" error={{ title: c.errors.modules }} onRetry={() => query.refetch()}>
        {(state) => (
          <div className="grid gap-5 xl:grid-cols-2">
            <FeaturesCard c={c} state={state} />
            <div className="space-y-5">
              <ReferralCard c={c} state={state} />
              <PartnerCard c={c} state={state} />
              <MovedCard c={c} />
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}

/** Ortak yazım: başarıda önbelleği günceller; 409'da güncel hâli yükler. */
function useWriter(c: SegmentsCopy) {
  const qc = useQueryClient();
  return async (fn: () => Promise<ModulesState>): Promise<boolean> => {
    try {
      const next = await fn();
      qc.setQueryData(KEY, next);
      toast.success(c.m.saved);
      announce(c.m.saved);
      return true;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        toast.error(c.m.conflict);
        await qc.invalidateQueries({ queryKey: KEY });
      } else {
        toast.error((e as Error).message);
      }
      return false;
    }
  };
}

function FeaturesCard({ c, state }: { c: SegmentsCopy; state: ModulesState }) {
  const write = useWriter(c);
  const [busy, setBusy] = useState<ModuleFeatureKey | null>(null);
  const [confirmKey, setConfirmKey] = useState<ModuleFeatureKey | null>(null);
  const baseId = useId();

  const apply = async (key: ModuleFeatureKey, value: boolean) => {
    setBusy(key);
    await write(() => patchFeatures(state.version, { [key]: value }));
    setBusy(null);
  };

  return (
    <SectionCard title={c.m.features} description={c.m.featuresHint} icon={<Power />} headingLevel="h2">
      <ul className="divide-y">
        {MODULE_FEATURE_KEYS.map((key) => {
          const on = state.features[key];
          const id = `${baseId}-${key}`;
          return (
            <li key={key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <Label htmlFor={id} className="qx-small font-medium text-fg">
                  {c.m.labels[key]}
                </Label>
                <p id={`${id}-d`} className="qx-caption mt-0.5 text-fg-muted">
                  {c.m.descriptions[key]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge size="sm" tone={on ? 'success' : 'neutral'} label={on ? c.m.on : c.m.off} />
                {busy === key ? (
                  <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin text-fg-muted" />
                ) : (
                  <Switch
                    id={id}
                    checked={on}
                    aria-describedby={`${id}-d`}
                    disabled={busy !== null}
                    onCheckedChange={(v) => (v ? void apply(key, true) : setConfirmKey(key))}
                    className="my-2.5"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {confirmKey && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setConfirmKey(null)}
          tone="warning"
          title={c.m.disableTitle(c.m.labels[confirmKey])}
          description={c.m.disableDesc}
          confirmLabel={c.m.disableConfirm}
          irreversibleNote={false}
          onConfirm={async () => {
            const k = confirmKey;
            setConfirmKey(null);
            await apply(k, false);
          }}
        />
      )}
    </SectionCard>
  );
}

function ReferralCard({ c, state }: { c: SegmentsCopy; state: ModulesState }) {
  const write = useWriter(c);
  const [invites, setInvites] = useState(String(state.referral.maxInvitesPerReferrerLifetime));
  const [redemptions, setRedemptions] = useState(String(state.referral.maxRedemptionsPerReferralCodePerMonth));
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    setInvites(String(state.referral.maxInvitesPerReferrerLifetime));
    setRedemptions(String(state.referral.maxRedemptionsPerReferralCodePerMonth));
  }, [state.referral.maxInvitesPerReferrerLifetime, state.referral.maxRedemptionsPerReferralCodePerMonth]);

  const parse = (v: string) => (/^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : null);
  const a = parse(invites);
  const b = parse(redemptions);
  const valid = a != null && b != null && a <= 10_000 && b <= 10_000;
  const dirty = a !== state.referral.maxInvitesPerReferrerLifetime || b !== state.referral.maxRedemptionsPerReferralCodePerMonth;

  return (
    <SectionCard title={c.m.referral} description={c.m.referralHint} icon={<Users />} headingLevel="h2">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || !dirty) return;
          setBusy(true);
          await write(() => patchReferral(state.version, { maxInvitesPerReferrerLifetime: a!, maxRedemptionsPerReferralCodePerMonth: b! }));
          setBusy(false);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-a`} className="qx-small">{c.m.maxInvites}</Label>
            <Input id={`${id}-a`} inputMode="numeric" value={invites} onChange={(e) => setInvites(e.target.value)} aria-invalid={a == null} className="min-h-11" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-b`} className="qx-small">{c.m.maxRedemptions}</Label>
            <Input id={`${id}-b`} inputMode="numeric" value={redemptions} onChange={(e) => setRedemptions(e.target.value)} aria-invalid={b == null} className="min-h-11" />
          </div>
        </div>
        {!valid && <InlineError>0–10.000 arası tam sayı girin.</InlineError>}
        <div className="flex gap-2">
          <Button type="submit" className="min-h-11" disabled={!valid || !dirty || busy}>
            {busy && <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" />}
            {busy ? c.m.saving : c.m.save}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setInvites(String(state.referral.maxInvitesPerReferrerLifetime));
                setRedemptions(String(state.referral.maxRedemptionsPerReferralCodePerMonth));
              }}
            >
              {c.m.reset}
            </Button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

function PartnerCard({ c, state }: { c: SegmentsCopy; state: ModulesState }) {
  const write = useWriter(c);
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(state.partnerDigest.enabled);
  const [url, setUrl] = useState(state.partnerDigest.url);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    setEnabled(state.partnerDigest.enabled);
    setUrl(state.partnerDigest.url);
  }, [state.partnerDigest.enabled, state.partnerDigest.url]);

  const trimmed = url.trim();
  const urlOk = !trimmed || isPublicHttpsUrl(trimmed);
  const needsUrl = enabled && !trimmed;
  const dirty = enabled !== state.partnerDigest.enabled || trimmed !== state.partnerDigest.url;

  return (
    <SectionCard title={c.m.partner} description={c.m.partnerHint} icon={<Webhook />} headingLevel="h2">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty || !urlOk || needsUrl) return;
          setBusy(true);
          await write(() => patchPartner(state.version, { enabled, url: trimmed }));
          setBusy(false);
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-en`} className="qx-small font-medium">{c.m.partnerEnabled}</Label>
          <Switch id={`${id}-en`} checked={enabled} onCheckedChange={setEnabled} className="my-2.5" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`} className="qx-small">{c.m.partnerUrl}</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={!urlOk || needsUrl}
            aria-describedby={`${id}-urlh`}
            className="min-h-11"
          />
          <p id={`${id}-urlh`} className="qx-caption text-fg-muted">{c.m.partnerUrlHint}</p>
          {(!urlOk || needsUrl) && <InlineError>{c.m.partnerUrlHint}</InlineError>}
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="min-h-11" disabled={!dirty || !urlOk || needsUrl || busy}>
            {busy && <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" />}
            {busy ? c.m.saving : c.m.save}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setEnabled(state.partnerDigest.enabled);
                setUrl(state.partnerDigest.url);
              }}
            >
              {c.m.reset}
            </Button>
          )}
        </div>
      </form>

      <div className="mt-4 space-y-2 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="qx-small font-medium text-fg">{c.m.secret}</p>
            <p className="qx-caption text-fg-muted">{state.partnerDigest.hasSecret ? c.m.secretSet(state.partnerDigest.secretLast4) : c.m.secretUnset}</p>
          </div>
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setRotateOpen(true)}>
            <KeyRound aria-hidden className="mr-1.5 h-4 w-4" />
            {c.m.rotate}
          </Button>
        </div>
        {secret && (
          <div role="status" className="space-y-2 rounded-control border border-warning-border bg-warning-subtle p-3">
            <p className="qx-caption text-fg">{c.m.secretOnce}</p>
            <div className="flex items-center gap-2">
              <code className="qx-caption min-w-0 flex-1 break-all rounded-chip bg-surface-1 px-2 py-1 font-mono text-fg">{secret}</code>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    toast.success(c.m.copied);
                  } catch {
                    /* pano izni yok: değer ekranda seçilebilir */
                  }
                }}
              >
                <Copy aria-hidden className="mr-1.5 h-4 w-4" />
                {c.m.copy}
              </Button>
            </div>
          </div>
        )}
      </div>

      {rotateOpen && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setRotateOpen(false)}
          tone="warning"
          title={c.m.rotateTitle}
          description={c.m.rotateDesc}
          confirmLabel={c.m.rotateConfirm}
          irreversibleNote={false}
          onConfirm={async () => {
            try {
              const res = await rotateSecret(state.version);
              qc.setQueryData(KEY, res.state);
              setSecret(res.secret);
              setRotateOpen(false);
            } catch (e) {
              if (e instanceof ApiRequestError && e.status === 409) {
                toast.error(c.m.conflict);
                await qc.invalidateQueries({ queryKey: KEY });
                setRotateOpen(false);
              } else {
                throw e;
              }
            }
          }}
        />
      )}
    </SectionCard>
  );
}

function MovedCard({ c }: { c: SegmentsCopy }) {
  return (
    <SectionCard title={c.m.moved} description={c.m.movedHint} icon={<ArrowRight />} density="compact" headingLevel="h2">
      <ul className="divide-y">
        {c.m.movedItems.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-fg hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="min-w-0">
                <span className="qx-small block font-medium">{it.label}</span>
                <span className="qx-caption block text-fg-muted">{it.note}</span>
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
