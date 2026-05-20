'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAppT } from '@/lib/app-locale';

export function TableSignalClient() {
  const t = useAppT();
  const sp = useSearchParams();
  const dealerId = sp.get('dealerId') || '';
  const qrCodeId = sp.get('qrCodeId') || '';
  const initialTable = sp.get('table') || '';

  const [tableCode, setTableCode] = useState(initialTable);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<'OK' | 'CONCERN' | null>(null);

  async function send(mood: 'OK' | 'CONCERN') {
    if (!dealerId.trim()) {
      toast.error(t('tableSignal.invalidConnection'));
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
        toast.error(data.error || t('common.failedToSubmit'));
        return;
      }
      toast.success(mood === 'OK' ? t('tableSignal.okMessage') : t('tableSignal.concernMessage'));
      setNote('');
    } catch {
      toast.error(t('tableSignal.connectionError'));
    } finally {
      setSending(null);
    }
  }

  if (!dealerId) {
    return (
      <Card className="w-full max-w-lg mx-auto mt-4 sm:mt-8">
        <CardHeader>
          <CardTitle>{t('tableSignal.missingConnection')}</CardTitle>
          <CardDescription>
            {t('tableSignal.missingConnectionDesc')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-start p-3 sm:p-4 pt-6 sm:pt-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('tableSignal.title')}</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('tableSignal.heading')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground text-pretty">
            {t('tableSignal.description')}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="table">{t('tableSignal.tableLabel')}</Label>
              <Input
                id="table"
                placeholder={t('tableSignal.tableExample')}
                value={tableCode}
                onChange={(e) => setTableCode(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">{t('tableSignal.noteLabel')}</Label>
              <Input
                id="note"
                placeholder={t('tableSignal.noteExample')}
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
                {t('tableSignal.okButton')}
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
                {t('tableSignal.concernButton')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-[10px] sm:text-[11px] text-center text-muted-foreground px-2">
          {t('tableSignal.footer')}
        </p>
      </div>
    </div>
  );
}
