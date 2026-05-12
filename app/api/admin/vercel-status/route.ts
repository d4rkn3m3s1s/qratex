import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { trackRequest } from '@/lib/metrics';


export const dynamic = 'force-dynamic';

const VERCEL_STATUS_URL = 'https://www.vercel-status.com/api/v2/summary.json';
const TIMEOUT_MS = 8000;

export type VercelStatusSummary = {
  indicator: { description: string; status: string };
  components: Array<{
    id: string;
    name: string;
    status: string;
    description?: string;
    updated_at?: string;
  }>;
  incidents: Array<{
    id: string;
    name: string;
    status: string;
    created_at?: string;
    updated_at?: string;
    shortlink?: string;
  }>;
  updatedAt: string;
};

export async function GET() {
  const start = Date.now();
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(VERCEL_STATUS_URL, { signal: controller.signal });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    const ok = res.ok;

    if (!res.ok) {
      trackRequest('/api/admin/vercel-status', false, latencyMs);
      return NextResponse.json(
        { error: true, message: `Vercel Status API returned ${res.status}` },
        { status: 502 }
      );
    }

    const raw = await res.json();
    const status = raw.status ?? {};
    const indicator = {
      description: status.description ?? 'Unknown',
      status: (status.indicator ?? 'none').toLowerCase(),
    };
    const components = Array.isArray(raw.components)
      ? raw.components.map((c: { id?: string; name?: string; status?: string; description?: string; updated_at?: string }) => ({
          id: c.id ?? '',
          name: c.name ?? '',
          status: (c.status ?? 'unknown').toLowerCase(),
          description: c.description,
          updated_at: c.updated_at,
        }))
      : [];
    const incidents = Array.isArray(raw.incidents)
      ? raw.incidents.map((i: { id?: string; name?: string; status?: string; created_at?: string; updated_at?: string; shortlink?: string }) => ({
          id: i.id ?? '',
          name: i.name ?? '',
          status: (i.status ?? 'unknown').toLowerCase(),
          created_at: i.created_at,
          updated_at: i.updated_at,
          shortlink: i.shortlink,
        }))
      : [];

    const body: VercelStatusSummary = {
      indicator,
      components,
      incidents,
      updatedAt: new Date().toISOString(),
    };

    trackRequest('/api/admin/vercel-status', true, latencyMs);

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    trackRequest('/api/admin/vercel-status', false, latencyMs);
    const message = err instanceof Error ? err.message : 'Vercel Status fetch failed';
    return NextResponse.json(
      { error: true, message },
      { status: 502 }
    );
  }
}
