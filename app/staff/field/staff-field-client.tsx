'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Send, Loader2, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

export default function StaffFieldPage() {
  const t = useAppT();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [pings, setPings] = useState<Array<{ id: string; createdAt: string; data: unknown }>>([]);

  const load = async () => {
    try {
      const r = await fetch('/api/staff/field-ping');
      const j = await r.json();
      if (j.success) setPings(j.pings ?? []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    setSending(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (navigator.geolocation) {
        let geoDenied = false;
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              latitude = pos.coords.latitude;
              longitude = pos.coords.longitude;
              resolve();
            },
            (err) => {
              geoDenied = err.code === 1;
              resolve();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        });
        if (latitude === undefined && geoDenied) {
          toast.message('Konum izni yok; not konumsuz gönderildi.');
        } else if (latitude === undefined) {
          toast.message('Konum alınamadı; not konumsuz gönderildi.');
        }
      }
      const r = await fetch('/api/staff/field-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || undefined, latitude, longitude }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('common.failedToSubmit'));
      toast.success('Saha ping kaydedildi');
      setNote('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-10">
      <Button variant="ghost" size="sm" asChild className="w-fit -mb-2 touch-manipulation">
        <Link href="/staff">Panele dön</Link>
      </Button>
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-balance">
          <MapPin className="h-6 w-6 shrink-0 text-primary" />
          Saha modu
        </h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">
          QR / offline vardiya için kısa not ve isteğe bağlı konum gönderimi. Yönetici panellerinde analitik olarak
          görülür.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hızlı ping</CardTitle>
          <CardDescription>Örn. &quot;Kasa yoğun&quot;, &quot;Kısa kesinti&quot;</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Not</Label>
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} />
          </div>
          <Button className="w-full gap-2" onClick={() => void send()} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Gönder
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 shrink-0" />
            Son kayıtlar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm max-h-64 overflow-y-auto">
          {pings.length === 0 ? (
            <p className="text-muted-foreground">Henüz kayıt yok</p>
          ) : (
            pings.map((p) => (
              <div key={p.id} className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs">
                <span className="text-muted-foreground">{formatRelativeTime(p.createdAt)}</span>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">
                  {JSON.stringify(p.data, null, 0)}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
