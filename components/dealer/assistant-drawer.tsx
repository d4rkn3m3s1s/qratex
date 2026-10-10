'use client';

/**
 * Bayi AI asistan çekmecesi (⌘J) — YER TUTUCU.
 *
 * Kabuk (components/dashboard/header.tsx) bu dosyayı `next/dynamic` ile yükler ve
 * aşağıdaki sözleşmeyle açar/kapatır. Asıl sohbet deneyimini b-asistan yüzeyi bu
 * dosyanın ÜZERİNE yazar; sözleşme (adlandırılmış + varsayılan dışa aktarım,
 * `AssistantDrawerProps`) korunmalıdır.
 *
 * Yer tutucu sahte bir sohbet göstermez: yalnız tam ekran asistan sayfasına dürüst
 * bir geçiş sunar.
 */
import Link from 'next/link';
import { Bot, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export interface AssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tam sayfa asistan rotası (kayıttan; modül kapalıysa verilmez). */
  assistantHref?: string;
}

export function AssistantDrawer({ open, onOpenChange, assistantHref = '/dealer/assistant' }: AssistantDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(28rem,100vw)] flex-col gap-4 p-6">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand" aria-hidden />
            AI Asistan
          </SheetTitle>
          <SheetDescription>
            İşletmenin verisiyle ilgili sorularını asistan sayfasında sorabilirsin.
          </SheetDescription>
        </SheetHeader>
        <Button asChild className="min-h-11 justify-between">
          <Link href={assistantHref} onClick={() => onOpenChange(false)}>
            Asistanı aç
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export default AssistantDrawer;
