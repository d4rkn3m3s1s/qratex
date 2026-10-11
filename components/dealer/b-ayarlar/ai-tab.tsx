'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bot, GraduationCap, Power, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { DirtyBar, Form, FormRootError, TextareaField, useZodForm } from '@/components/ds/form';
import { ConfirmAction, EmptyState, InlineError } from '@/components/states';
import { AI_CONTEXT_MAX, type AiSection, type DealerSettingsSnapshot } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, errorText, fetchAi, retrainAi } from './api';
import { LEARNING_STATUS_LABEL, fmtDateTime } from './format';
import { InstantSwitchRow } from './ui';
import { useAiPatch } from './use-ai-patch';

const contextSchema = z.object({
  customPrompt: z
    .string()
    .trim()
    .max(AI_CONTEXT_MAX, `En çok ${AI_CONTEXT_MAX} karakter`)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
type ContextValues = z.input<typeof contextSchema>;

/**
 * AI — yalnız GERÇEKTEN uygulanan anahtarlar (denetim B3: 17 ayarın 14'ü hiçbir yerde
 * okunmuyordu; 9 "analiz modülü" ve aylık rapor kaldırıldı). Ana anahtar alt ayarları
 * sıfırlamaz, yalnız etkisiz kılar (B9). Okuyucu `lib/ai-policy` (fail-closed).
 */
export function AiTab({ section }: { section: AiSection }) {
  const queryClient = useQueryClient();
  const patch = useAiPatch();
  const s = section.settings;
  const locked = !section.moduleEnabled;
  const [refreshing, setRefreshing] = useState(false);

  const refreshStats = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchAi();
      // Yalnız istatistikler tazelenir; düzenlenmekte olan bağlam metnine dokunulmaz.
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, ai: { ...old.ai, stats: fresh.stats, moduleEnabled: fresh.moduleEnabled } } : old));
    } catch (e) {
      toast.error(errorText(e, 'Kullanım bilgisi yenilenemedi.'));
    } finally {
      setRefreshing(false);
    }
  };

  const setMaster = async (next: boolean) => {
    try {
      await patch({ isEnabled: next });
      toast.success(next ? 'AI motoru açıldı.' : 'AI motoru kapatıldı.');
    } catch (e) {
      toast.error(errorText(e, 'Ayar kaydedilemedi.'));
      throw e;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {locked && (
        <InlineError variant="banner" tone="warning">
          AI özellikleri yönetici tarafından bu hesap için kapatıldı. Ayarlarınız korunur ama şu an değiştirilemez ve uygulanmaz.
        </InlineError>
      )}

      <SectionCard
        title="AI motoru"
        icon={<Bot className="h-5 w-5" aria-hidden />}
        description="Yorumlarınızın duygu, konu, aciliyet ve kayıp riski analizini yapar; içgörü, sohbet ve yanıt önerilerini besler."
        actions={<StatusBadge label={s.isEnabled && !locked ? 'Açık' : 'Kapalı'} tone={s.isEnabled && !locked ? 'success' : 'neutral'} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-subtle p-4">
          <div className="min-w-0">
            <p className="qx-body font-medium text-fg">{s.isEnabled ? 'AI motoru çalışıyor' : 'AI motoru kapalı'}</p>
            <p className="qx-small text-fg-muted">
              {s.isEnabled
                ? 'Kapatırsanız müşteri yorumları hiçbir AI sağlayıcısına gönderilmez.'
                : 'Yorumlar analiz edilmiyor ve hiçbir AI sağlayıcısına gönderilmiyor.'}
            </p>
          </div>
          {s.isEnabled ? (
            <ConfirmAction
              trigger={
                <Button type="button" variant="outline" disabled={locked}>
                  <Power className="h-4 w-4" aria-hidden />
                  Kapat
                </Button>
              }
              title="AI motoru kapatılsın mı?"
              description="Açana kadar şunlar durur:"
              impact={[
                { label: 'Yeni yorumların analizi', value: 'Durur' },
                { label: 'AI uyarıları (toksik, acil, kayıp riski)', value: 'Durur' },
                { label: 'AI asistan, içgörü anlatımı, yanıt önerisi', value: 'Durur' },
                { label: 'Harici AI sağlayıcısına veri', value: 'Gönderilmez' },
              ]}
              tone="warning"
              confirmLabel="AI'ı kapat"
              irreversibleNote={false}
              onConfirm={() => setMaster(false)}
            />
          ) : (
            <Button type="button" onClick={() => void setMaster(true).catch(() => undefined)} disabled={locked}>
              <Power className="h-4 w-4" aria-hidden />
              AI&apos;ı aç
            </Button>
          )}
        </div>
        <div className="mt-2 divide-y divide-subtle">
          <InstantSwitchRow
            icon={<Zap />}
            label="Yorumları otomatik analiz et"
            description="Açıkken her yeni yorum arka planda analiz edilir. Kapalıyken yalnız sizin başlattığınız AI işlemleri çalışır."
            checked={s.autoAnalyze}
            muted={!s.isEnabled}
            disabled={locked}
            onSave={(v) => patch({ autoAnalyze: v })}
          />
        </div>
        {!s.isEnabled && (
          <p className="qx-caption mt-1 text-fg-muted">Motor kapalıyken alt ayarlar korunur; açtığınızda olduğu gibi geri gelir.</p>
        )}
      </SectionCard>

      <UsageCard section={section} onRefresh={() => void refreshStats()} refreshing={refreshing} />

      <ContextCard initial={s.customPrompt} version={s.version} locked={locked} />

      <LearningCard section={section} locked={locked || !s.isEnabled} />

      <SectionCard title="Otomasyon" description="AI'ın bulgularına göre çalışan kurallar.">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline">
            <Link href="/dealer/automation/replies">
              Otomatik yanıt kuralları
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dealer/settings?tab=notifications">
              AI uyarı tercihleri
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ───────────────────────────── Kullanım ─────────────────────────────

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(`${date}T12:00:00Z`));
}

function UsageCard({ section, onRefresh, refreshing }: { section: AiSection; onRefresh: () => void; refreshing: boolean }) {
  const st = section.stats;
  const max = Math.max(1, ...st.daily.map((d) => d.count));
  const total7 = st.daily.reduce((a, d) => a + d.count, 0);

  return (
    <SectionCard
      title="Kullanım"
      description="Sayılar canlı veriden; günler İstanbul saatine göre."
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          Yenile
        </Button>
      }
    >
      <MetricGrid cols={4}>
        <MetricTile label="Analiz edilen yorum" metric={{ value: st.analyzedTotal }} size="compact" />
        <MetricTile label="Son 24 saat" metric={{ value: st.analyzedLast24h }} size="compact" />
        <MetricTile
          label="Analiz bekleyen"
          metric={{ value: st.pendingLast30d }}
          hint={st.pendingLast30d > 0 && !section.settings.isEnabled ? 'AI kapalıyken gelenler' : 'Son 30 gün'}
          size="compact"
        />
        <MetricTile label="AI çağrısı (7 gün)" metric={{ value: st.usageLast7d }} hint="Analiz, asistan, içgörü" size="compact" />
      </MetricGrid>

      <h3 className="qx-small mt-6 font-semibold text-fg" id="ai-daily-title">
        Son 7 günde analiz edilen yorumlar
      </h3>
      {total7 === 0 ? (
        <EmptyState
          compact
          icon={Sparkles}
          title="Son 7 günde analiz yok"
          description={section.settings.isEnabled ? 'Yeni yorum geldiğinde burada görünür.' : 'AI motoru kapalı olduğu için analiz yapılmadı.'}
          headingLevel="p"
        />
      ) : (
        <figure aria-labelledby="ai-daily-title" className="mt-3">
          <div className="flex h-36 items-end gap-2" role="img" aria-label={`Son 7 günde toplam ${total7} analiz`}>
            {st.daily.map((d) => (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="qx-caption qx-num text-fg-muted">{d.count}</span>
                <div
                  className="w-full max-w-10 rounded-t-chip bg-brand transition-[height] duration-slow ease-standard motion-reduce:transition-none"
                  style={{ height: d.count > 0 ? `${Math.max(4, (d.count / max) * 100)}%` : '2px', opacity: d.count > 0 ? 1 : 0.35 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2" aria-hidden>
            {st.daily.map((d) => (
              <span key={d.date} className="qx-caption min-w-0 flex-1 truncate text-center text-fg-muted">
                {dayLabel(d.date)}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>Günlük analiz sayısı</caption>
            <thead>
              <tr>
                <th scope="col">Gün</th>
                <th scope="col">Analiz</th>
              </tr>
            </thead>
            <tbody>
              {st.daily.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── İşletme bağlamı ─────────────────────────────

function ContextCard({ initial, version, locked }: { initial: string | null; version: string; locked: boolean }) {
  const queryClient = useQueryClient();
  const patch = useAiPatch();
  const form = useZodForm(contextSchema, { defaultValues: { customPrompt: initial } });
  const baseRef = useRef(initial);

  useEffect(() => {
    if (initial === baseRef.current) return;
    baseRef.current = initial;
    if (!form.formState.isDirty) form.reset({ customPrompt: initial });
  }, [initial, version, form]);

  return (
    <SectionCard
      title="İşletme bağlamı"
      description="AI'ın yorumlarınızı doğru yorumlaması için işletmenizi anlatın: ne sunduğunuz, ürün/menü adları, şube adları, sık geçen yerel terimler."
    >
      <Form
        form={form}
        onSubmit={async (v: ContextValues) => {
          const next = v.customPrompt && v.customPrompt.trim() ? v.customPrompt.trim() : null;
          await patch({ customPrompt: next });
          baseRef.current = next;
          toast.success('İşletme bağlamı kaydedildi.');
        }}
        className="space-y-3"
      >
        <FormRootError />
        <TextareaField
          control={form.control}
          name="customPrompt"
          label="Bağlam metni"
          hideLabel
          rows={5}
          maxLength={AI_CONTEXT_MAX}
          placeholder="Ör. Kadıköy'de üçüncü nesil kahve dükkânıyız. “Flat white”, “V60” ve ev yapımı cheesecake en çok konuşulan ürünlerimiz. Moda ve Bahariye adında iki şubemiz var."
          optional
          emptyAsNull
          disabled={locked}
        />
        <p className="qx-caption text-fg-muted">
          Bu metin yalnız sizin yorumlarınızın analizinde, talimat değil <strong>bilgi</strong> olarak kullanılır. Komut, kod ya da bağlantı
          içeren metin kabul edilmez; puanları değiştirme isteği uygulanmaz.
        </p>
        <DirtyBar
          bottomOffset="var(--qx-tabbar-h, 0px)"
          message="İşletme bağlamında kaydedilmemiş değişiklik var"
          onReloadLatest={() => {
            const latest = queryClient.getQueryData<DealerSettingsSnapshot>(SETTINGS_KEY)?.ai.settings.customPrompt ?? null;
            baseRef.current = latest;
            form.reset({ customPrompt: latest });
          }}
        />
      </Form>
    </SectionCard>
  );
}

// ───────────────────────────── Öğrenme ─────────────────────────────

function LearningCard({ section, locked }: { section: AiSection; locked: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const l = section.stats.learning;

  const retrain = async () => {
    setBusy(true);
    try {
      const fresh = await retrainAi();
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, ai: fresh } : old));
      toast.success('Öğrenme profili güncellendi.');
    } catch (e) {
      toast.error(errorText(e, 'Öğrenme profili güncellenemedi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Öğrenme"
      icon={<GraduationCap className="h-5 w-5" aria-hidden />}
      description="Gelen kutusunda AI etiketlerini düzelttikçe motor işletmenize özel bir profil öğrenir ve sonraki analizlerde kullanır."
      actions={l ? <StatusBadge label={LEARNING_STATUS_LABEL[l.status] ?? l.status} tone={l.status === 'ready' ? 'success' : 'neutral'} size="sm" /> : null}
    >
      {!l ? (
        <EmptyState
          compact
          icon={GraduationCap}
          title="Henüz öğrenme verisi yok"
          description="Gelen kutusunda bir yorumun AI etiketini düzelttiğinizde öğrenme başlar."
          headingLevel="p"
        />
      ) : (
        <div className="space-y-4">
          <MetricGrid cols={3}>
            <MetricTile label="Düzeltme (toplam)" metric={{ value: l.correctionsTotal }} size="compact" />
            <MetricTile label="Profile işlenen düzeltme" metric={{ value: l.correctionsUsed }} size="compact" />
            <MetricTile label="Eğitimde kullanılan yorum" metric={{ value: l.trainingFeedbackCount }} size="compact" />
          </MetricGrid>
          <p className="qx-small text-fg-muted">Son eğitim: {l.lastTrainedAt ? fmtDateTime(l.lastTrainedAt) : 'henüz yapılmadı'}</p>
          {l.retrain?.shouldRetrain && (
            <InlineError variant="banner" tone="info">
              {l.retrain.reason ?? 'Son eğitimden bu yana yeni yorum ve düzeltmeler birikti.'} ({l.retrain.newFeedbackCount} yeni yorum,{' '}
              {l.retrain.newCorrectionsCount} yeni düzeltme)
            </InlineError>
          )}
          <Button type="button" variant={l.retrain?.shouldRetrain ? 'default' : 'outline'} onClick={() => void retrain()} disabled={busy || locked}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
            {busy ? 'Profil güncelleniyor…' : 'Profili şimdi güncelle'}
          </Button>
          {locked && <p className="qx-caption text-fg-muted">AI motoru kapalıyken profil güncellenemez.</p>}
        </div>
      )}
    </SectionCard>
  );
}
