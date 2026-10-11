'use client';

import { useId, useState } from 'react';
import { m } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Eye, Filter, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyValueList, StatusBadge, statusBadgeProps } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { fadeIn, useMotionPolicy } from '@/lib/motion';
import { chatRoleLabel, type ChatDetail } from '@/lib/ai-quality/contract';
import { QualityApiError, errorText, fetchChat, qualityKeys, revealChat } from './api';
import { CHAT_OUTCOME, fmtDateTimeYear, fmtMs } from './format';
import { AdminAiKaliteText } from './copy';

type Props = { id: string; onPivot: (p: { user?: string | null; fp?: string | null }) => void };

export function ChatPanel({ id, onPivot }: Props) {
  // Her açılış sunucuda denetim kaydı yazar; aynı kaydı sık sık yeniden çekmeyelim.
  const q = useQuery({ queryKey: qualityKeys.chat(id), queryFn: ({ signal }) => fetchChat(id, signal), staleTime: 5 * 60_000 });
  return (
    <QueryState query={q} skeleton="detail" onRetry={() => q.refetch()} errorKind={q.error instanceof QualityApiError && q.error.status === 404 ? 'notFound' : undefined}>
      {(d) => <ChatBody key={d.id} d={d} onPivot={onPivot} />}
    </QueryState>
  );
}

function actorText(d: ChatDetail): string {
  const a = d.actor;
  if (a.kind === 'user') return a.name ?? a.email ?? 'Kullanıcı';
  if (a.kind === 'anon') return `Ziyaretçi #${(a.fingerprint ?? '').slice(0, 8)}`;
  return 'Silinmiş kullanıcı';
}

function ChatBody({ d, onPivot }: { d: ChatDetail; onPivot: Props['onPivot'] }) {
  const policy = useMotionPolicy();
  const uid = useId();
  const [raw, setRaw] = useState<{ userMessage: string; assistantMessage: string } | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      setRaw(await revealChat(d.id, reason.trim()));
      setRevealOpen(false);
      toast.message('Maskesiz metin gösteriliyor; bu erişim denetim kaydına yazıldı.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const currentRoleDiffers = d.actor.currentRole && d.roleSnapshot && d.actor.currentRole !== d.roleSnapshot;

  return (
    <m.div variants={policy.variants(fadeIn)} initial="hidden" animate="visible" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...statusBadgeProps(CHAT_OUTCOME, d.outcome)} size="sm" />
        {d.masked && !raw ? <StatusBadge label="Kişisel veriler maskeli" tone="info" icon={null} size="sm" /> : null}
        {raw ? <StatusBadge label="Maskesiz görünüm" tone="warning" size="sm" /> : null}
      </div>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: 'Zaman', value: fmtDateTimeYear(d.createdAt) },
          { label: 'Kimden', value: actorText(d) },
          {
            label: 'Rol',
            value: chatRoleLabel(d.roleSnapshot),
            hint: currentRoleDiffers ? `Şu anki rolü: ${chatRoleLabel(d.actor.currentRole)}` : 'Mesaj anındaki rol',
          },
          { label: 'Model', value: d.modelCalled ? d.model : 'Çağrılmadı', mono: d.modelCalled },
          { label: 'Gecikme', value: d.modelCalled ? fmtMs(d.latencyMs) : '—', hint: d.modelCalled ? undefined : 'Bakım ya da güvenlik engelinde model çağrılmaz' },
          { label: 'Kayıt no', value: d.id, mono: true, copyValue: d.id },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {d.actor.kind === 'user' && d.actor.userId ? (
          <Button variant="outline" className="min-h-11" onClick={() => onPivot({ user: d.actor.userId })}>
            <Filter className="h-4 w-4" aria-hidden />
            Bu kullanıcının tüm sohbetleri
          </Button>
        ) : null}
        {d.actor.kind === 'anon' && d.actor.fingerprint ? (
          <Button variant="outline" className="min-h-11" onClick={() => onPivot({ fp: d.actor.fingerprint })}>
            <Filter className="h-4 w-4" aria-hidden />
            Bu ziyaretçinin tüm sohbetleri
          </Button>
        ) : null}
        {!raw ? (
          <Button variant="ghost" className="min-h-11" aria-expanded={revealOpen} onClick={() => setRevealOpen((o) => !o)}>
            <Eye className="h-4 w-4" aria-hidden />
            Maskeyi kaldır
          </Button>
        ) : null}
      </div>

      {revealOpen && !raw ? (
        <div className="space-y-2 rounded-md border border-warning/40 p-3">
          <Label htmlFor={`${uid}-reason`}><AdminAiKaliteText k="revealReason" /></Label>
          <Input id={`${uid}-reason`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-h-11" />
          <p className="text-xs text-fg-muted"><AdminAiKaliteText k="revealNote" /></p>
          <Button className="min-h-11" disabled={reason.trim().length < 5 || busy} onClick={reveal}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Maskesiz göster
          </Button>
        </div>
      ) : null}

      <section aria-labelledby={`${uid}-conv`} className="space-y-3">
        <h3 id={`${uid}-conv`} className="text-sm font-semibold text-fg">
          Konuşma {d.conversation.length > 1 ? <span className="font-normal text-fg-muted">(aynı kişinin ±30 dk içindeki {d.conversation.length} turu)</span> : null}
        </h3>
        <ol className="space-y-4">
          {d.conversation.map((t) => {
            const userText = t.current && raw ? raw.userMessage : t.userMessage;
            const botText = t.current && raw ? raw.assistantMessage : t.assistantMessage;
            return (
              <li key={t.id} aria-current={t.current ? 'true' : undefined} className={t.current ? 'rounded-md ring-2 ring-focus ring-offset-2 ring-offset-surface-1' : undefined}>
                <p className="mb-1 text-xs text-fg-muted">
                  <time dateTime={t.createdAt}>{fmtDateTimeYear(t.createdAt)}</time>
                  {t.current ? ' · seçili kayıt' : ''}
                  {t.outcome !== 'ok' ? ` · ${CHAT_OUTCOME[t.outcome].label}` : ''}
                </p>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg rounded-br-sm bg-brand-subtle px-3 py-2 text-sm text-fg">
                    <span className="sr-only"><AdminAiKaliteText k="userPrefix" /> </span>
                    <User className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-fg-muted" aria-hidden />
                    <span className="whitespace-pre-wrap break-words">{userText}</span>
                  </div>
                </div>
                <div className="mt-2 flex">
                  <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-border bg-surface-muted px-3 py-2 text-sm text-fg">
                    <span className="sr-only">QRA: </span>
                    <Bot className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-fg-muted" aria-hidden />
                    <span className="whitespace-pre-wrap break-words">{botText}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </m.div>
  );
}
