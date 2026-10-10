'use client';

/**
 * Güvenli, küçük markdown alt kümesi (ai-chat Bulgu 12 / ask-analytics Bulgu 10): başlık, madde
 * ve numaralı liste, **kalın**, *italik*, `kod` ve `[K3]` atıfları. HTML YORUMLANMAZ (React
 * metni kaçışlar); bağlantı üretmez (atıflar yalnız bilinen kaynaklara bağlanır).
 */
import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import type { AssistantSource } from '@/lib/dealer-assistant/types';
import { cn } from '@/lib/utils';

type Block = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d{1,2}[.)]\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ kind: 'h', text: h[1] });
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      const current = list as { kind: 'ul' | 'ol'; items: string[] } | null;
      if (!current || current.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      (list as unknown as { items: string[] }).items.push((ul ?? ol)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[K\d{1,3}\]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function Inline({ text, sources, onCite }: { text: string; sources: Map<string, AssistantSource>; onCite?: (ref: string) => void }) {
  const parts = text.split(INLINE_RE).filter((p) => p !== '');
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
        const cite = /^\[(K\d{1,3})\]$/.exec(part);
        if (cite) {
          const src = sources.get(cite[1]);
          if (!src) return null;
          return (
            <Link
              key={i}
              href={src.href}
              onClick={(e) => {
                if (onCite && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                  e.preventDefault();
                  onCite(cite[1]);
                }
              }}
              className="mx-0.5 inline-flex min-h-6 items-center rounded-md border border-brand-border bg-brand-subtle px-1.5 align-baseline text-[0.75rem] font-semibold text-brand no-underline hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label={`${cite[1]}: ${src.excerpt.slice(0, 80)}`}
            >
              {cite[1]}
            </Link>
          );
        }
        if (/^\*[^*\s][^*]*\*$/.test(part) || /^_[^_\s][^_]*_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function Markdown({
  content,
  sources = [],
  onCite,
  className,
}: {
  content: string;
  sources?: AssistantSource[];
  onCite?: (ref: string) => void;
  className?: string;
}): ReactNode {
  const map = new Map(sources.map((s) => [s.ref, s]));
  const blocks = parseBlocks(content);
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-fg', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'h') return <p key={i} className="pt-1 font-semibold text-fg"><Inline text={b.text} sources={map} onCite={onCite} /></p>;
        if (b.kind === 'p') return <p key={i}><Inline text={b.text} sources={map} onCite={onCite} /></p>;
        const List = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List key={i} className={cn('space-y-1 ps-5', b.kind === 'ul' ? 'list-disc' : 'list-decimal')}>
            {b.items.map((item, j) => (
              <li key={j}><Inline text={item} sources={map} onCite={onCite} /></li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
