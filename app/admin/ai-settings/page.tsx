import { permanentRedirect } from 'next/navigation';
import { legacyStudioHref } from '@/lib/ai-studio/contract';

/** Emekli: /admin/ai-settings → Prompt ve Model Stüdyosu (sorgu parametreleri korunur). */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(legacyStudioHref('bayiler', await searchParams));
}
