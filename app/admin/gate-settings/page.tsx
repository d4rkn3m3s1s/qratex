'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Rocket, Save, Loader2, Info } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';

/**
 * ADMIN GİZLİ KAPI AYARI — admin panelinin "boyutlar arası geçit" sorusunu ve tek-rakam
 * cevabını düzenler. Cevap değişince tüm adminler bir sonraki oturumda yeniden sorulur.
 */
export default function GateSettingsPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [initialSig, setInitialSig] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/admin-gate');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setQuestion(data.question ?? '');
      setAnswer(String(data.answer ?? ''));
      setInitialSig(JSON.stringify({ q: data.question, a: data.answer }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = JSON.stringify({ q: question, a: answer }) !== initialSig;
  const answerValid = /^[0-9]$/.test(answer);

  const save = async () => {
    if (!answerValid) { toast.error('Cevap tek rakam (0-9) olmalı.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/admin-gate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kaydedilemedi');
      setQuestion(data.question);
      setAnswer(String(data.answer));
      setInitialSig(JSON.stringify({ q: data.question, a: data.answer }));
      toast.success('Gizli kapı güncellendi ✓ (adminler bir sonraki oturumda yeniden sorulur)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<Rocket className="text-white" />}
        title="Gizli Kapı (Boyutlar Arası Geçit)"
        description="Admin paneline girerken çıkan gizli sorunun ve tek-rakam cevabının ayarı. Sadece bilenler girer."
      />

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            ADMIN rolü tek başına yetmez — panele girmek için bu gizli soruya doğru <b>tek rakam</b>la
            yanıt vermek gerekir. Rolü yanlışlıkla admin yapılan biri (ör. stajyer) gizli rakamı
            bilmeden giremez. Cevabı değiştirirsen tüm adminler bir sonraki oturumda yeniden sorulur.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
      ) : (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-1.5">
              <Label>Gizli Soru</Label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Örn: Evrende bize göre kaç boyut gizlidir?"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">Havalı, ütopik, cevabı tek rakam olan bir soru yaz. 🛸</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cevap (tek rakam)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={answer}
                onChange={(e) => setAnswer(e.target.value.replace(/[^0-9]/g, '').slice(-1))}
                placeholder="7"
                className={`w-24 text-center text-2xl font-bold ${answer && !answerValid ? 'border-red-500' : ''}`}
              />
              {answer && !answerValid && <p className="text-xs text-red-500">Cevap 0-9 arası tek bir rakam olmalı.</p>}
            </div>

            {/* Canlı önizleme */}
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 to-black p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-purple-300/70">Önizleme</p>
              <p className="mt-2 text-sm text-white/80">{question || 'Sorunuz burada görünecek…'}</p>
              <div className="mx-auto mt-3 grid h-14 w-14 place-items-center rounded-xl border-2 border-purple-500/50 bg-white/5 text-2xl font-black text-white/40">?</div>
            </div>

            <Button onClick={save} disabled={saving || !dirty || !answerValid} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Kaydet
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
