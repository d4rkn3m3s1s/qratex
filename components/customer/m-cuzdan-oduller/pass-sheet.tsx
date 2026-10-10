'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, Copy, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, KeyValueList } from '@/components/ds/data';
import { RarityBadge } from '@/components/ds/play';
import { ConfirmAction, EmptyState } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { parsePassParam } from '@/lib/wallet-rewards/rules';
import type { OpenedBoxDTO, RemedyPassDTO, RewardPassDTO } from '@/lib/wallet-rewards/types';
import { errorText, walletPost } from './api';
import { useWalletCopy } from './copy';
import { formatDate, formatPoints } from './format';
import { QrCode } from './qr-code';
import { RewardVisual } from './reward-visual';
import { ShowAtCounter } from './show-at-counter';
import { useCopyCode } from './use-copy-code';
import { useShallowQuery } from './use-shallow-query';

export type AnyPass = RewardPassDTO | RemedyPassDTO | OpenedBoxDTO;

function CodeBlock({ code, label }: { code: string; label: string }) {
  const copy = useWalletCopy();
  const { copy: copyCode, copiedValue } = useCopyCode({ copied: copy.passes.copied, failed: copy.passes.copyFailed });
  const done = copiedValue === code;
  return (
    <div>
      <p className="qx-overline mb-1 text-fg-muted">{label}</p>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 select-all break-all rounded-control border border-dashed border-strong bg-surface-2 px-3 py-2 font-mono text-lg font-semibold tracking-wider text-fg">
          {code}
        </p>
        <Button variant="outline" size="icon" onClick={() => void copyCode(code)} aria-label={copy.passes.copy}>
          {done ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Pass detayı (`?pass=reward:<id> | remedy:<id> | box:<id>`): QR, kod (kopyala), durum,
 * "Kasada göster" tam ekranı ve "Kullandım" (tek yön, onaylı). Bildirim derin linkleri buraya iner.
 */
export function PassSheet({ find, onUsed }: { find: (kind: string, id: string) => AnyPass | null; onUsed: () => void }) {
  const copy = useWalletCopy();
  const url = useShallowQuery();
  const raw = url.get('pass');
  const parsed = parsePassParam(raw);
  const [showing, setShowing] = useState(false);
  const pass = parsed ? find(parsed.kind, parsed.id) : null;

  async function markUsed(p: RewardPassDTO) {
    try {
      await walletPost('/api/customer/wallet/passes/used', { userRewardId: p.id });
      announce(copy.passes.markUsedDone);
      onUsed();
    } catch (err) {
      throw new Error(errorText(err, copy.errors));
    }
  }

  const title = !pass
    ? copy.passes.notFoundTitle
    : pass.kind === 'reward'
      ? pass.rewardName
      : pass.kind === 'remedy'
        ? pass.label
        : pass.title;

  const counterCode = !pass ? null : pass.kind === 'reward' ? pass.code : pass.kind === 'remedy' ? pass.reference : pass.couponCode;
  const canShow = !!pass && !!counterCode && !(pass.kind === 'reward' && pass.usedAt);

  return (
    <>
      <DetailSheet
        open={!!raw}
        id={raw}
        onOpenChange={(next) => {
          if (!next) url.set({ pass: null });
        }}
        size="md"
        title={() => title}
        description={() =>
          !pass ? null : pass.kind === 'reward' ? copy.kind[pass.rewardKind] : pass.kind === 'remedy' ? pass.businessName : copy.boxes.source[pass.source]
        }
        footer={() =>
          !pass ? null : (
            <>
              {pass.kind === 'reward' && !pass.usedAt && (
                <ConfirmAction
                  tone="warning"
                  title={copy.passes.markUsedTitle}
                  description={copy.passes.markUsedBody}
                  confirmLabel={copy.passes.markUsed}
                  cancelLabel={copy.detail.cancel}
                  irreversibleNote={false}
                  onConfirm={() => markUsed(pass)}
                  trigger={
                    <Button variant="outline">
                      <CheckCheck aria-hidden className="size-4" />
                      {copy.passes.markUsed}
                    </Button>
                  }
                />
              )}
              {canShow && (
                <Button onClick={() => setShowing(true)}>
                  <MonitorSmartphone aria-hidden className="size-4" />
                  {copy.passes.show}
                </Button>
              )}
            </>
          )
        }
      >
        {() => {
          if (!pass) return <EmptyState variant="no-results" compact title={copy.passes.notFoundTitle} description={copy.passes.notFoundBody} />;

          if (pass.kind === 'reward') {
            const used = !!pass.usedAt;
            return (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-card bg-surface-muted">
                    <RewardVisual imageUrl={pass.imageUrl} glyph={pass.glyph} kind={pass.rewardKind} size="sm" />
                  </span>
                  <p className="qx-small text-fg">{pass.description}</p>
                </div>
                {!used && pass.code && (
                  <div className="flex justify-center">
                    <QrCode value={pass.code} alt={copy.passes.qrAlt(pass.code)} failedText={copy.passes.qrFailed} />
                  </div>
                )}
                {pass.code && <CodeBlock code={pass.code} label={copy.passes.code} />}
                <KeyValueList
                  divided
                  items={[
                    { id: 's', label: copy.passes.statusLabel, value: used ? copy.passes.statusUsed : copy.passes.statusActive },
                    { id: 'i', label: copy.passes.issuedLabel, value: formatDate(pass.issuedAt, copy.locale, true) },
                    ...(used ? [{ id: 'u', label: copy.passes.usedLabel, value: formatDate(pass.usedAt, copy.locale, true) }] : []),
                  ]}
                />
                <p className="qx-small text-fg-muted">{copy.detail.how[pass.rewardKind]}</p>
              </div>
            );
          }

          if (pass.kind === 'remedy') {
            return (
              <div className="flex flex-col gap-5">
                <div className="rounded-card border border-info-border bg-info-subtle p-4 text-center">
                  <p className="qx-h2 text-fg">{pass.label}</p>
                  <p className="qx-small mt-1 text-fg-muted">{pass.businessName}</p>
                </div>
                <CodeBlock code={pass.reference} label={copy.passes.reference} />
                <KeyValueList
                  divided
                  items={[
                    { id: 'b', label: copy.passes.business, value: pass.businessName },
                    { id: 's', label: copy.passes.statusLabel, value: copy.passes.statusRemedy },
                    ...(pass.acceptedAt ? [{ id: 'a', label: copy.passes.acceptedLabel, value: formatDate(pass.acceptedAt, copy.locale, true) }] : []),
                  ]}
                />
                <section>
                  <h3 className="qx-overline mb-1 text-fg-muted">{copy.passes.offerMessage}</h3>
                  <blockquote className="qx-small border-l-2 border-strong pl-3 italic text-fg">{pass.message}</blockquote>
                </section>
                <p className="qx-small text-fg-muted">{copy.passes.remedyHint}</p>
                <Link href="/customer/me/voices" className="qx-small font-medium text-brand underline-offset-4 hover:underline">
                  {copy.passes.seeInVoices}
                </Link>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <RarityBadge rarity={pass.tier} register="ops" />
                <span className="qx-caption text-fg-muted">{formatDate(pass.openedAt, copy.locale, true)}</span>
              </div>
              {pass.points > 0 && <p className="qx-h2 qx-num text-success">{copy.boxes.revealPoints(formatPoints(pass.points, copy.locale))}</p>}
              {pass.message && <p className="qx-body text-fg">{pass.message}</p>}
              {pass.couponCode && (
                <>
                  <div className="flex justify-center">
                    <QrCode value={pass.couponCode} alt={copy.passes.qrAlt(pass.couponCode)} failedText={copy.passes.qrFailed} />
                  </div>
                  <CodeBlock code={pass.couponCode} label={copy.boxes.revealCoupon} />
                </>
              )}
            </div>
          );
        }}
      </DetailSheet>
      {pass && counterCode && (
        <ShowAtCounter
          open={showing}
          onOpenChange={setShowing}
          title={title}
          code={counterCode}
          qrValue={pass.kind === 'remedy' ? null : counterCode}
        >
          {pass.kind === 'remedy' && <p className="qx-body text-fg">{pass.businessName}</p>}
        </ShowAtCounter>
      )}
    </>
  );
}
