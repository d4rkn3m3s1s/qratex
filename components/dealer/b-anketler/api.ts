/**
 * Anket stüdyosu istemci uçları. Kural: `!ok` her zaman FIRLATIR (hata asla "boş liste" ya da
 * "0 yanıt" gibi görünmez); hata kodu + HTTP durumu `QueryState`'in sınıflandırıcısına taşınır.
 */
import type {
  SurveyEditorData,
  SurveyListData,
  SurveyRange,
  SurveyResponsesPage,
  SurveyResultsData,
  SurveyTextsPage,
} from '@/lib/dealer-surveys/types';
import type { SurveyIssue } from '@/lib/survey-schema';

export class SurveyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown> | unknown[],
  ) {
    super(message);
    this.name = 'SurveyApiError';
  }
  /** Sunucu doğrulama hatasındaki soru/seçenek indeksli sorunlar. */
  get issues(): SurveyIssue[] {
    const d = this.details as { issues?: unknown } | undefined;
    return Array.isArray(d?.issues) ? (d!.issues as SurveyIssue[]) : [];
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init });
  } catch (e) {
    throw new SurveyApiError(e instanceof Error ? e.message : 'Failed to fetch', 0, 'NETWORK');
  }
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('application/json') ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  if (!res.ok || !body || body.success !== true) {
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new SurveyApiError(message, res.status, typeof body?.code === 'string' ? body.code : undefined, body?.details as Record<string, unknown> | undefined);
  }
  return (body.data ?? body) as T;
}

function json(method: string, payload: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

export const surveyKeys = {
  all: ['dealer', 'surveys'] as const,
  list: ['dealer', 'surveys', 'list'] as const,
  editor: (id: string) => ['dealer', 'surveys', id, 'editor'] as const,
  results: (id: string, range: SurveyRange) => ['dealer', 'surveys', id, 'results', range] as const,
  responses: (id: string, range: SurveyRange) => ['dealer', 'surveys', id, 'responses', range] as const,
  texts: (id: string, questionId: string, range: SurveyRange, q: string) => ['dealer', 'surveys', id, 'texts', questionId, range, q] as const,
};

export const fetchSurveyList = () => request<SurveyListData>('/api/dealer/surveys');
export const fetchSurveyEditor = (id: string) => request<SurveyEditorData>(`/api/dealer/surveys/${encodeURIComponent(id)}`);
export const fetchSurveyResults = (id: string, range: SurveyRange) =>
  request<SurveyResultsData>(`/api/dealer/surveys/${encodeURIComponent(id)}/results?range=${range}`);

export function fetchSurveyResponses(id: string, range: SurveyRange, cursor?: string | null) {
  const qs = new URLSearchParams({ range });
  if (cursor) qs.set('cursor', cursor);
  return request<SurveyResponsesPage>(`/api/dealer/surveys/${encodeURIComponent(id)}/responses?${qs}`);
}

export function fetchSurveyTexts(id: string, questionId: string, range: SurveyRange, q: string, cursor?: string | null) {
  const qs = new URLSearchParams({ range, questionId });
  if (q.trim()) qs.set('q', q.trim());
  if (cursor) qs.set('cursor', cursor);
  return request<SurveyTextsPage>(`/api/dealer/surveys/${encodeURIComponent(id)}/texts?${qs}`);
}

export type SurveyWritePayload = {
  title: string;
  description?: string;
  questions: { type: string; text: string; options?: string[]; required: boolean; order: number }[];
  publish?: boolean;
  questionIds?: (string | null)[];
};

export const createSurvey = (payload: SurveyWritePayload) =>
  request<{ survey: { id: string; title: string; isActive: boolean } }>('/api/dealer/surveys', json('POST', payload));

export const updateSurvey = (id: string, payload: SurveyWritePayload) =>
  request<{ survey: { id: string; updatedAt: string } }>(`/api/dealer/surveys/${encodeURIComponent(id)}`, json('PUT', payload));

export const patchSurvey = (id: string, patch: { isActive?: boolean; title?: string; description?: string | null }) =>
  request<{ survey: { id: string; isActive: boolean } }>(`/api/dealer/surveys/${encodeURIComponent(id)}`, json('PATCH', patch));

export const deleteSurvey = (id: string) => request<{ deleted: true }>(`/api/dealer/surveys/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const duplicateSurvey = (id: string) =>
  request<{ survey: { id: string; title: string } }>(`/api/dealer/surveys/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });

export function exportSurveyUrl(id: string, range: SurveyRange, lang: 'tr' | 'en'): string {
  return `/api/dealer/surveys/${encodeURIComponent(id)}/export?range=${range}&lang=${lang}`;
}

/** Herkese açık doldurma bağlantısı. */
export function publicSurveyUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, '')}/surveys/${encodeURIComponent(id)}`;
}
