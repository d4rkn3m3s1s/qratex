import { permanentRedirect } from 'next/navigation';
import { legacyStudioHref } from '@/lib/ai-studio/contract';

/** Emekli: /admin/ai-learning → Prompt ve Model Stüdyosu (sorgu parametreleri korunur). */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(legacyStudioHref('ogrenme', await searchParams));
}
