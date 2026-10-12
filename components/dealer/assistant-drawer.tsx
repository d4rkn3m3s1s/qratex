'use client';

/**
 * Bayi AI asistan çekmecesi (⌘J) — her bayi sayfasından açılan hızlı sohbet.
 *
 * Kabuk (components/dashboard/header.tsx) bu dosyayı `next/dynamic` ile yükler ve aşağıdaki
 * sözleşmeyle açar/kapatır (adlandırılmış + varsayılan dışa aktarım, `AssistantDrawerProps`).
 * Sohbet deneyimi tam sayfa ile AYNI bileşendir (`components/dealer/b-asistan`): aynı BFF,
 * aynı sohbet geçmişi; çekmecede başlatılan sohbet tam sayfada `?c=` ile sürer.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Bot, Maximize2, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { IconButton } from '@/components/ds/a11y';
import { AssistantChat } from '@/components/dealer/b-asistan/assistant-chat';
import { useAssistantCopy } from '@/components/dealer/b-asistan/copy';
import { useAssistantOverview } from '@/components/dealer/b-asistan/use-assistant';

export interface AssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tam sayfa asistan rotası (kayıttan; modül kapalıysa verilmez). */
  assistantHref?: string;
}

export function AssistantDrawer({ open, onOpenChange, assistantHref = '/dealer/assistant' }: AssistantDrawerProps) {
  const copy = useAssistantCopy();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('drawer');
  const overview = useAssistantOverview(open);
  const fullHref = conversationId ? `${assistantHref}?c=${encodeURIComponent(conversationId)}` : assistantHref;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(30rem,100vw)] flex-col gap-0 p-0 sm:max-w-none">
        <SheetHeader className="flex-row items-center gap-2 space-y-0 border-b border-border px-3 py-2 pe-12 text-start">
          <Bot className="h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <SheetTitle className="qx-h3">{copy.drawerTitle}</SheetTitle>
            <SheetDescription className="truncate qx-caption">{copy.drawerDesc}</SheetDescription>
          </div>
          <IconButton
            aria-label={copy.newChat}
            icon={<Plus />}
            variant="ghost"
            onClick={() => {
              setConversationId(null);
              setNewKey(Math.random().toString(36).slice(2, 10));
            }}
          />
          <IconButton asChild aria-label={copy.openFullPage} icon={<Maximize2 />} variant="ghost">
            <Link href={fullHref} onClick={() => onOpenChange(false)} />
          </IconButton>
        </SheetHeader>
        <AssistantChat
          variant="drawer"
          className="min-h-0 flex-1"
          conversationId={conversationId}
          newKey={newKey}
          onConversationChange={setConversationId}
          overview={overview.data}
          overviewError={overview.isError}
          onRetryOverview={() => overview.refetch()}
        />
      </SheetContent>
    </Sheet>
  );
}

export default AssistantDrawer;
