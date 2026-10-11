'use client';

import { useId, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { INTERN_EMAIL_KINDS, MAIL_VARIABLES, type InternEmailKind } from '@/lib/intern-email-kinds';
import {
  MAX_RECIPIENTS_PER_TEMPLATE,
  parseRecipientInput,
  splitRecipients,
  unknownVariables,
  type TemplateInput,
} from '@/lib/mail-center/templates-contract';
import { fmtDeadline, istanbulNowLocal } from '../format';
import { AdminIletisimText } from '../copy';

const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function TemplateEditor({ draft, onChange }: { draft: TemplateInput; onChange: (patch: Partial<TemplateInput>) => void }) {
  const uid = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const kind = draft.kind as InternEmailKind;
  const unknown = unknownVariables(`${draft.subject}\n${draft.body}`);
  const legacyDeadline = draft.deadline && !ISO_LOCAL.test(draft.deadline) ? draft.deadline : null;
  const pastDeadline = !!draft.deadline && ISO_LOCAL.test(draft.deadline) && draft.deadline < istanbulNowLocal();

  /** Değişkeni İMLECİN olduğu yere ekler (sona değil, Bulgu 11). */
  const insertToken = (token: string) => {
    const el = bodyRef.current;
    const body = draft.body;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    onChange({ body: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg"><AdminIletisimText k="templateType" /></legend>
        <ChoiceChips<InternEmailKind>
          aria-label="Şablon türü"
          size="sm"
          options={INTERN_EMAIL_KINDS.map((k) => ({ value: k.value, label: k.label, textLabel: `${k.label}: ${k.hint}` }))}
          value={kind}
          onChange={(v) => v && onChange({ kind: v })}
        />
        <p className="text-xs text-fg-muted">{INTERN_EMAIL_KINDS.find((k) => k.value === kind)?.hint}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-dept`}>Departman</Label>
          <Input id={`${uid}-dept`} value={draft.department} maxLength={60} onChange={(e) => onChange({ department: e.target.value })} className="min-h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-name`}><AdminIletisimText k="greetingName" /></Label>
          <Input id={`${uid}-name`} value={draft.recipientName} maxLength={80} onChange={(e) => onChange({ recipientName: e.target.value })} className="min-h-11" />
        </div>
      </div>

      <RecipientsField id={`${uid}-rcpt`} value={draft.email} onChange={(email) => onChange({ email })} />

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-subject`}>Konu</Label>
        <Input id={`${uid}-subject`} value={draft.subject} maxLength={200} onChange={(e) => onChange({ subject: e.target.value })} className="min-h-11" />
        <p className="text-right text-xs tabular-nums text-fg-muted">{draft.subject.length}/200</p>
      </div>

      {kind === 'task' && (
        <div className="space-y-3 rounded-control border border-border bg-surface-2 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-deadline`} className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" aria-hidden />
              Son teslim (İstanbul saati)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${uid}-deadline`}
                type="datetime-local"
                value={legacyDeadline ? '' : draft.deadline ?? ''}
                onChange={(e) => onChange({ deadline: e.target.value || undefined })}
                className="min-h-11 w-auto"
                aria-describedby={`${uid}-deadline-help`}
              />
              {draft.deadline && (
                <Button variant="ghost" className="min-h-11" onClick={() => onChange({ deadline: undefined })}>
                  Temizle
                </Button>
              )}
            </div>
            <p id={`${uid}-deadline-help`} className="text-xs text-fg-muted">
              {draft.deadline
                ? `Mailde "${fmtDeadline(draft.deadline)}" olarak görünür.`
                : 'Boş bırakırsanız mailde son teslim kartı GÖSTERİLMEZ ve hatırlatma gitmez.'}
            </p>
            {legacyDeadline && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Eski serbest metin biçimi: &quot;{legacyDeadline}&quot;. Yıl ve saat dilimi belirsiz; tarih seçerek güncelleyin.
              </p>
            )}
            {pastDeadline && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Bu tarih geçmişte kaldı. Alıcıya geçmiş bir son teslim tarihi gidecek.
              </p>
            )}
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <Switch id={`${uid}-reminder`} checked={draft.reminder !== false} onCheckedChange={(v) => onChange({ reminder: v })} />
            <Label htmlFor={`${uid}-reminder`} className="font-normal">
              Son teslim günü otomatik hatırlatma gönder
            </Label>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label htmlFor={`${uid}-body`}><AdminIletisimText k="content" /></Label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Değişken ekle (imlecin olduğu yere)">
            {MAIL_VARIABLES.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => insertToken(v.token)}
                title={v.label}
                className="min-h-9 rounded-chip border border-border bg-surface-1 px-2 font-mono text-xs text-fg hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {v.token}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          id={`${uid}-body`}
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={14}
          maxLength={20_000}
          className="font-mono text-sm leading-relaxed"
          aria-describedby={`${uid}-body-help`}
        />
        <p id={`${uid}-body-help`} className="text-xs text-fg-muted">
          <AdminIletisimText k="fmtLabel" /> <code><AdminIletisimText k="fmtHeading" /></code> <AdminIletisimText k="fmtNumbered" /> <code>• <AdminIletisimText k="fmtItem" /></code> <AdminIletisimText k="fmtOr" /> <code>- <AdminIletisimText k="fmtItem" /></code> <AdminIletisimText k="fmtListTail" />
        </p>
        {unknown.length > 0 && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Tanınmayan değişken: {unknown.map((u) => `{{${u}}}`).join(', ')} — mailde olduğu gibi görünür.
          </p>
        )}
      </div>
    </div>
  );
}

/** Çipli alıcı girişi: virgül/Enter ile ekle, CSV ya da liste yapıştır, anında doğrula. */
function RecipientsField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const list = splitRecipients(value);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const full = list.length >= MAX_RECIPIENTS_PER_TEMPLATE;

  const commit = (raw: string) => {
    const { valid, invalid: bad } = parseRecipientInput(raw);
    const merged = [...list];
    for (const e of valid) if (!merged.includes(e) && merged.length < MAX_RECIPIENTS_PER_TEMPLATE) merged.push(e);
    onChange(merged.join(', '));
    setInvalid(bad);
    setText(bad.join(', '));
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}><AdminIletisimText k="recipients" /></Label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border border-strong bg-surface-1 p-1.5 focus-within:ring-2 focus-within:ring-focus">
        {list.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-chip bg-surface-3 py-0.5 pl-2 pr-0.5 text-sm text-fg">
            {e}
            <button
              type="button"
              aria-label={`${e} alıcısını kaldır`}
              onClick={() => onChange(list.filter((x) => x !== e).join(', '))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          disabled={full}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\s]$/.test(v) && v.trim()) commit(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault();
              commit(text);
            } else if (e.key === 'Backspace' && !text && list.length) {
              onChange(list.slice(0, -1).join(', '));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
          onPaste={(e) => {
            const data = e.clipboardData.getData('text');
            if (/[,;\n\t]/.test(data)) {
              e.preventDefault();
              commit(`${text} ${data}`);
            }
          }}
          placeholder={list.length ? '' : 'ad@ornek.com — virgülle ayırın ya da CSV/liste yapıştırın'}
          className="min-h-9 min-w-[12rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-fg-subtle"
          aria-invalid={invalid.length > 0 || undefined}
          aria-describedby={`${id}-help`}
        />
      </div>
      <p id={`${id}-help`} className={invalid.length ? 'text-xs text-danger' : 'text-xs text-fg-muted'} role={invalid.length ? 'alert' : undefined}>
        {invalid.length
          ? `Geçersiz adres: ${invalid.slice(0, 4).join(', ')}`
          : `${list.length}/${MAX_RECIPIENTS_PER_TEMPLATE} alıcı · her alıcıya ayrı mail gider (birbirlerinin adresini görmezler).`}
      </p>
    </div>
  );
}
