/**
 * b-asistan — NDJSON akış kodlama/çözme (saf; sunucu ve istemci aynı sözleşmeyi kullanır).
 *
 * Her olay tek satır JSON'dur. SSE yerine NDJSON: `fetch` + `ReadableStream` ile POST gövdesi
 * gönderilebilir, `AbortController` ile durdurulabilir; EventSource yalnız GET destekler.
 */
import type { AssistantStreamEvent } from './types';

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

export function encodeEvent(event: AssistantStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** Parça parça gelen metni satırlara böler; yarım satırı bir sonraki parçaya taşır. */
export function createNdjsonParser(onEvent: (event: AssistantStreamEvent) => void): { push: (chunk: string) => void; flush: () => void } {
  let buffer = '';
  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as AssistantStreamEvent;
      if (parsed && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string') onEvent(parsed);
    } catch {
      /* bozuk satır yok sayılır (ör. ara katmanın eklediği boşluk) */
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        emitLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');
      }
    },
    flush() {
      if (buffer) emitLine(buffer);
      buffer = '';
    },
  };
}
