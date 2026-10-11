'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, Eye, EyeOff, FlagOff, ShieldAlert, Trash2, Undo2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, StatusBadge, Timeline } from '@/components/ds/data';
import { QueryState, SectionCard } from '@/components/states';
import {
  AUDIT_ACTION_LABEL,
  INTENT_LABEL,
  REMEDY_STATUS_LABEL,
  SOURCE_LABEL,
  emotionLabel,
  type BulkAction,
  type FeedDetail,
} from '@/lib/admin-feedbacks/contract';
import { feedbackKeys, fetchItem } from './api';
import { FlagBadges, SentimentBadge, Stars, fmtDateTime, fmtHours, fmtNumber, fmtPercent01 } from './parts';
import { AdminGeriBildirimlerText } from './copy';

/** Detay çekmecesinin gövdesi: kendi sorgusu + QueryState (hata boş içerik gibi görünmez). */
export function FeedbackDetail({ feedKey }: { feedKey: string }) {
  const q = useQuery({
    queryKey: feedbackKeys.item(feedKey),
    queryFn: ({ signal }) => fetchItem(feedKey, signal),
    staleTime: 15_000,
  });
  return (
    <QueryState query={q} skeleton="detail" error={{ title: 'Geri bildirim yüklenemedi' }}>
      {(d) => <DetailBody d={d} />}
    </QueryState>
  );
}

function DetailBody({ d }: { d: FeedDetail }) {
  const replyHours =
    d.dealerRepliedAt != null ? (new Date(d.dealerRepliedAt).getTime() - new Date(d.createdAt).getTime()) / 3_600_000 : null;
  const hasAi =
    d.ai.analyzedAt ||
    d.ai.intent ||
    d.ai.emotions.length ||
    d.ai.topics.length ||
    d.ai.dimensions.length ||
    d.ai.actionSuggestions.length ||
    d.ai.churnRisk != null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Stars rating={d.rating} size="md" />
          <SentimentBadge value={d.sentiment} size="md" />
          <StatusBadge size="sm" tone="neutral" icon={null} label={SOURCE_LABEL[d.source]} />
        </div>
        <FlagBadges
          isToxic={d.moderation.isToxic}
          trustFlagged={d.moderation.trustFlagged}
          fraudScore={d.moderation.fraudScore}
          isPublic={d.isPublic}
          deletedAt={d.deletedAt}
        />
        {d.text ? (
          <blockquote className="whitespace-pre-wrap break-words rounded-control border-l-4 border-border-strong bg-surface-2 p-3 text-fg">{d.text}</blockquote>
        ) : (
          <p className="text-sm text-fg-muted"><AdminGeriBildirimlerText k="ratingOnly" /></p>
        )}
        {d.mediaCount > 0 ? <p className="text-xs text-fg-muted">{fmtNumber(d.mediaCount)} medya eki var.</p> : null}
      </div>

      <SectionCard title="Bağlam">
        <KeyValueList
          layout="grid"
          columns={2}
          items={[
            { label: 'Tarih', value: fmtDateTime(d.createdAt) },
            {
              label: 'Bayi',
              value: (
                <Link href={`/admin/dealers-health?dealer=${encodeURIComponent(d.dealer.id)}`} className="text-brand-text underline-offset-4 hover:underline">
                  {d.dealer.name}
                </Link>
              ),
            },
            { label: d.source === 'qr' ? 'QR kodu' : 'Ürün', value: d.place },
            { label: 'Değerlendirilen personel', value: d.staffName, hidden: d.source !== 'qr' },
            {
              label: 'Müşteri',
              value: d.user ? (
                <Link href={`/admin/users/${d.user.id}`} className="text-brand-text underline-offset-4 hover:underline">
                  {d.user.name || d.user.email || 'Adsız müşteri'}
                </Link>
              ) : (
                'Anonim ziyaretçi'
              ),
              hint: d.user
                ? [
                    d.user.email,
                    d.userOtherReviews != null ? `${fmtNumber(d.userOtherReviews)} başka yorum` : null,
                    d.user.isDemo ? 'Demo hesabı' : null,
                    d.user.fraudStatus && d.user.fraudStatus !== 'clean' ? `Suistimal: ${d.user.fraudStatus === 'shadow_ban' ? 'gölge yasak' : 'işaretli'}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined,
            },
            { label: 'Kayıt kimliği', value: d.id, copyValue: d.id, mono: true },
          ]}
        />
      </SectionCard>

      <SectionCard title="Bayi yanıtı">
        {d.dealerReply ? (
          <div className="space-y-1">
            <p className="whitespace-pre-wrap break-words text-fg">{d.dealerReply}</p>
            <p className="text-xs text-fg-muted">
              {d.dealerRepliedAt ? `${fmtDateTime(d.dealerRepliedAt)} · yanıt süresi ${fmtHours(replyHours)}` : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            Bayi henüz yanıtlamadı.
            {d.dealerFirstViewedAt ? ` Bayi ${fmtDateTime(d.dealerFirstViewedAt)} tarihinde gördü.` : d.source === 'qr' ? ' Bayi henüz açıp görmedi.' : ''}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Moderasyon sinyalleri">
        <KeyValueList
          layout="grid"
          columns={2}
          items={[
            { label: 'Yayın durumu', value: d.deletedAt ? `Çöp kutusunda (${fmtDateTime(d.deletedAt)})` : d.isPublic ? 'Yayında' : 'Gizli' },
            { label: 'Toksik', value: d.source === 'qr' ? (d.moderation.isToxic ? 'Evet' : 'Hayır') : 'Bu kaynakta ölçülmüyor' },
            {
              label: 'Güven işareti',
              value: d.source === 'qr' ? (d.moderation.trustFlagged ? 'İşaretli' : 'Yok') : 'Bu kaynakta ölçülmüyor',
              hint: d.moderation.trustReason ?? undefined,
            },
            { label: 'Sahte yorum skoru', value: d.source === 'qr' ? fmtPercent01(d.moderation.fraudScore) : 'Bu kaynakta ölçülmüyor' },
          ]}
        />
      </SectionCard>

      <SectionCard title="Yapay zekâ analizi">
        {hasAi ? (
          <div className="space-y-3">
            <KeyValueList
              layout="grid"
              columns={2}
              items={[
                { label: 'Analiz', value: d.ai.analyzedAt ? fmtDateTime(d.ai.analyzedAt) : 'Henüz analiz edilmedi', hint: d.ai.model ?? undefined },
                {
                  label: 'Niyet',
                  value: d.ai.intent ? INTENT_LABEL[d.ai.intent] ?? d.ai.intent : null,
                  hint: d.ai.intentScore != null ? `Güven ${fmtPercent01(d.ai.intentScore)}` : undefined,
                  hidden: d.source !== 'qr',
                },
                { label: 'Aciliyet', value: fmtPercent01(d.ai.urgency), hidden: d.source !== 'qr' },
                { label: 'Kayıp riski', value: fmtPercent01(d.ai.churnRisk) },
                { label: 'NPS', value: d.ai.npsScore != null ? `${d.ai.npsScore} / 10` : null, hidden: d.source !== 'qr' },
              ]}
            />
            {d.ai.intentScore != null && d.ai.intentScore < 0.7 ? (
              <p className="text-xs text-fg-muted">
                Yapay zekâ güveni düşük.{' '}
                <Link href="/admin/ai/quality" className="text-brand-text underline-offset-4 hover:underline">
                  AI kalite kuyruğunda incele
                </Link>
              </p>
            ) : null}
            {d.ai.emotions.length ? <Chips label="Duygular" items={d.ai.emotions.map(emotionLabel)} /> : null}
            {d.ai.topics.length ? <Chips label="Konular" items={d.ai.topics} /> : null}
            {d.ai.dimensions.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted">Boyutlar</p>
                <ul className="grid grid-cols-2 gap-2">
                  {d.ai.dimensions.map((dim) => (
                    <li key={dim.key} className="flex items-center justify-between rounded-control bg-surface-2 px-2 py-1.5 text-sm">
                      <span>{dim.label}</span>
                      <span className="qx-num font-medium">{dim.value} / 5</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.ai.actionSuggestions.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted"><AdminGeriBildirimlerText k="suggestedActions" /></p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {d.ai.actionSuggestions.map((s, i) => (
                    <li key={i}>{s.action}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-fg-muted"><AdminGeriBildirimlerText k="noAi" /></p>
        )}
      </SectionCard>

      <SectionCard title="Telafi teklifleri">
        {d.remedies.length ? (
          <ul className="space-y-2">
            {d.remedies.map((r) => (
              <li key={r.id} className="rounded-control border border-border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge size="sm" tone={r.status === 'accepted' ? 'success' : r.status === 'pending' ? 'info' : 'neutral'} label={REMEDY_STATUS_LABEL[r.status] ?? r.status} />
                  <time className="text-xs text-fg-muted" dateTime={r.createdAt}>
                    {fmtDateTime(r.createdAt)}
                  </time>
                </div>
                <p className="mt-1 break-words text-fg">{r.message}</p>
                {r.selectedType ? (
                  <p className="text-xs text-fg-muted">
                    Müşterinin seçimi: {r.selectedType === 'points' ? 'puan' : r.selectedType === 'discount' ? 'indirim' : r.selectedType === 'free_item' ? 'ücretsiz ürün' : r.selectedType}
                    {r.selectedValue ? ` · ${r.selectedValue}` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted"><AdminGeriBildirimlerText k="noRemedy" /></p>
        )}
      </SectionCard>

      <SectionCard title="Moderasyon geçmişi">
        {d.audit.length ? (
          <Timeline
            events={d.audit.map((a) => ({
              id: a.id,
              at: a.createdAt,
              title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
              actor: a.actorName ?? undefined,
              description: a.reason ? `Gerekçe: ${a.reason}` : undefined,
              tone: a.action.includes('DELETE') || a.action.includes('FLAG') ? 'warning' : 'neutral',
            }))}
          />
        ) : (
          <p className="text-sm text-fg-muted"><AdminGeriBildirimlerText k="noModeration" /></p>
        )}
      </SectionCard>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-fg-muted">{label}</p>
      <ul className="flex flex-wrap gap-1">
        {items.map((t, i) => (
          <li key={`${t}-${i}`} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Çekmece altı aksiyonları — listede seçili olmasa da tek kayıt için. Durum bilinmeden
 * (detay yüklenmeden) yanlış aksiyon gösterilmesin diye aynı sorgu önbelleğinden okunur.
 */
export function DetailActions({ feedKey, onAction }: { feedKey: string; onAction: (action: BulkAction, keys: string[]) => void }) {
  const q = useQuery({ queryKey: feedbackKeys.item(feedKey), queryFn: ({ signal }) => fetchItem(feedKey, signal), staleTime: 15_000 });
  const d = q.data;
  if (!d) return null;
  const qr = d.source === 'qr';
  const btn = 'min-h-11 sm:min-h-9';
  const run = (a: BulkAction) => () => onAction(a, [d.key]);
  if (d.deletedAt) {
    return (
      <Button size="sm" className={btn} onClick={run('restore')}>
        <Undo2 className="h-4 w-4" aria-hidden />
        Geri yükle
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {!d.dealerReply ? (
        <Button size="sm" variant="outline" className={btn} onClick={run('remind')}>
          <Bell className="h-4 w-4" aria-hidden />
          Bayiye hatırlat
        </Button>
      ) : null}
      {qr && d.isPublic ? (
        <Button size="sm" variant="outline" className={btn} onClick={run('hide')}>
          <EyeOff className="h-4 w-4" aria-hidden />
          Gizle
        </Button>
      ) : null}
      {qr && !d.isPublic ? (
        <Button size="sm" variant="outline" className={btn} onClick={run('show')}>
          <Eye className="h-4 w-4" aria-hidden />
          Yayınla
        </Button>
      ) : null}
      {qr && !d.moderation.isToxic ? (
        <Button size="sm" variant="outline" className={btn} onClick={run('flag')}>
          <ShieldAlert className="h-4 w-4" aria-hidden />
          Toksik işaretle
        </Button>
      ) : null}
      {qr && (d.moderation.isToxic || d.moderation.trustFlagged) ? (
        <Button size="sm" variant="outline" className={btn} onClick={run('clearFlags')}>
          <FlagOff className="h-4 w-4" aria-hidden />
          İşaretleri temizle
        </Button>
      ) : null}
      <Button size="sm" variant="outline" className={`${btn} text-danger-text`} onClick={run('delete')}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Çöp kutusuna taşı
      </Button>
      {d.user ? (
        <Button size="sm" variant="ghost" className={btn} asChild>
          <Link href={`/admin/users/${d.user.id}`}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Müşteri 360
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
