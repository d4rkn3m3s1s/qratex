'use client';

import { useEffect, useId, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { discoveryConfigSchema, issuePathLabel, summarize, type DiscoveryConfigValue } from '@/lib/admin-discovery/contract';
import { useDiscoveryDraft } from './discovery-center';
import { AdminKesifBagisText } from '../copy';

/**
 * JSON → taslak. Şemayla doğrulanır, mevcut taslakla fark özeti gösterilir; yayın yine bilinçli
 * "Yayınla" adımıdır (rapor #13: sessizce tüm ayarı değiştiriyordu, görseli düşürüyordu).
 */
export function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; onImport: (c: DiscoveryConfigValue) => void }) {
  const id = useId();
  const { draft } = useDiscoveryDraft();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<DiscoveryConfigValue | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setText('');
      setParsed(null);
      setErrors([]);
    }
  }, [open]);

  const check = (raw: string) => {
    setText(raw);
    setParsed(null);
    if (!raw.trim()) return setErrors([]);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return setErrors(['Geçerli bir JSON değil.']);
    }
    const r = discoveryConfigSchema.safeParse(json);
    if (!r.success) return setErrors(r.error.issues.slice(0, 6).map((i) => `${issuePathLabel(i.path)}: ${i.message}`));
    setErrors([]);
    setParsed(r.data);
  };

  const before = summarize(draft);
  const after = summarize(parsed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle><AdminKesifBagisText k="jsonToDraft" /></DialogTitle>
          <DialogDescription><AdminKesifBagisText k="jsonHint" /></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-file`}>Dosya</Label>
            <input
              id={`${id}-file`}
              type="file"
              accept="application/json,.json"
              className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) check(await f.text());
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-text`}><AdminKesifBagisText k="jsonContent" /></Label>
            <Textarea id={`${id}-text`} rows={8} value={text} onChange={(e) => check(e.target.value)} className="font-mono text-xs" aria-describedby={errors.length ? `${id}-err` : undefined} />
          </div>
          {errors.length ? (
            <div id={`${id}-err`}>
              <InlineError variant="banner">
                <ul className="list-disc pl-5">
                  {errors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </InlineError>
            </div>
          ) : null}
          {parsed ? (
            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-sm">
              <dt className="col-span-3 font-medium text-fg"><AdminKesifBagisText k="draftChange" /></dt>
              <dd>Yedek konum: {before.locations} → {after.locations}</dd>
              <dd>Duyuru: {before.sponsored} → {after.sponsored}</dd>
              <dd>Yayında: {before.liveSponsored} → {after.liveSponsored}</dd>
            </dl>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            className="min-h-11"
            disabled={!parsed}
            onClick={() => {
              if (!parsed) return;
              onImport(parsed);
              onOpenChange(false);
            }}
          >
            <FileUp className="h-4 w-4" aria-hidden />
            Taslağa al
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
