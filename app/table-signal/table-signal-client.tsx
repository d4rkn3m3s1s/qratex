'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function TableSignalClient() {
  const sp = useSearchParams();
  const dealerId = sp.get('dealerId') || '';
  const qrCodeId = sp.get('qrCodeId') || '';
  const initialTable = sp.get('table') || '';

  const [tableCode, setTableCode] = useState(initialTable);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<'OK' | 'CONCERN' | null>(null);

  async function send(mood: 'OK' | 'CONCERN') {
    if (!dealerId.trim()) {
      toast.error('Geçersiz bağlantı: dealerId eksik');
      return;
    }
    setSending(mood);
    try {
      const res = await fetch('/api/innovation/table-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealerId: dealerId.trim(),
          ...(qrCodeId ? { qrCodeId } : {}),
          ...(tableCode.trim() ? { tableCode: tableCode.trim() } : {}),
          mood,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gönderilemedi');
        return;
      }
      toast.success(mood === 'OK' ? 'Ekip bilgilendirildi — teşekkürler!' : 'Sinyal iletildi — ekip ilgilenecek.');
      setNote('');
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setSending(null);
    }
  }

  if (!dealerId) {
    return (
      <Card className="max-w-lg mx-auto mt-8">
        <CardHeader>
          <CardTitle>Bağlantı eksik</CardTitle>
          <CardDescription>
            Bu sayfa işletmenin QR koduyla açılmalıdır. Doğru QR&apos;ı taradığınızdan emin olun.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-start p-4 pt-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Masa sinyali</p>
          <h1 className="text-2xl font-semibold tracking-tight">Her şey yolunda mı?</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Şikâyet oluşturmadan ekibe tek dokunuşla haber verin. Kişisel veri toplanmaz; isterseniz masa
            kodunu girin.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="table">Masa / bölüm (isteğe bağlı)</Label>
              <Input
                id="table"
                placeholder="Örn. M7"
                value={tableCode}
                onChange={(e) => setTableCode(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Kısa not (isteğe bağlı)</Label>
              <Input
                id="note"
                placeholder="Örn. servis hızı"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={400}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button
                size="lg"
                className="h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => send('OK')}
                disabled={!!sending}
              >
                {sending === 'OK' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Her şey yolunda
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-base gap-2 border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => send('CONCERN')}
                disabled={!!sending}
              >
                {sending === 'CONCERN' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
                Bir şey var
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-center text-muted-foreground px-2">
          Oturum açmış müşteriler için isteğe bağlı hesap eşlemesi yapılabilir; zorunlu değildir.
        </p>
      </div>
    </div>
  );
}
