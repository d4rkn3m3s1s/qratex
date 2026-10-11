import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { permanentRedirect, redirect } from 'next/navigation';
import { Gamepad2 } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { GAMES_HUB_PATH, resolveGameRoute } from '@/lib/games/registry';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { GameHost } from './game-host';

/**
 * Tek dinamik oyun sayfası (yol haritası F4.2: 21 kopya `page.tsx` → 1).
 *
 * Karar `lib/games/registry → resolveGameRoute`:
 *   canlı oyun            → GameHost (bileşen next/dynamic ile; kabuk + oturum + mod)
 *   yapım aşamasında      → Oyun Merkezi (geçici yönlendirme)
 *   birleşen eski kimlik  → yeni oyuna KALICI yönlendirme (sorgu parametreleri korunur)
 *   emekli                → halefi canlıysa ona, değilse Oyun Merkezi'ne
 *   bilinmeyen            → Oyun Merkezi
 *
 * Not: `/customer/games/<id>` için statik klasör varken (eski sayfalar) Next statik rotayı
 * seçer; eski sayfalar oyun ajanlarınca kaldırıldıkça bu rota devralır.
 */

type PageProps = {
  params: Promise<{ game: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = 'force-dynamic';

async function effectiveSafe(gameType: string) {
  try {
    return await getEffectiveMiniGame(gameType);
  } catch {
    // DB erişilemezse registry varsayılanıyla devam (sayfa düşmez; puan kararı zaten sunucuda).
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game } = await params;
  const decision = resolveGameRoute(game);
  if (decision.kind !== 'play') return { title: 'Oyunlar | QRateX', robots: { index: false } };
  const eff = await effectiveSafe(decision.entry.gameType);
  return {
    title: `${eff?.title ?? decision.entry.title} | QRateX`,
    description: eff?.description ?? decision.entry.tagline,
    robots: { index: false },
  };
}

function withQuery(path: string, sp: Record<string, string | string[] | undefined>): string {
  const [base, existing] = path.split('?');
  const q = new URLSearchParams(existing ?? '');
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || q.has(k)) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Hub'daki mod seçimi: `?kip=pratik` → pratik (oyun destekliyorsa GameHost uygular). */
function kipOf(v: string | string[] | undefined): 'practice' | 'ranked' | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === 'pratik' ? 'practice' : s === 'sirali' ? 'ranked' : undefined;
}

export default async function GamePage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login');
  }

  const { game } = await params;
  const decision = resolveGameRoute(game);

  if (decision.kind === 'redirect') {
    permanentRedirect(withQuery(decision.to, await searchParams));
  }
  if (decision.kind === 'hub') {
    redirect(GAMES_HUB_PATH);
  }

  const { entry } = decision;
  const eff = await effectiveSafe(entry.gameType);
  // Sunucu kuralı gizlediyse (emekli/yapım) oyun açılmaz.
  if (eff?.hidden) redirect(GAMES_HUB_PATH);

  const title = eff?.title ?? entry.title;
  const emoji = eff?.emoji ?? entry.emoji;
  const description = eff?.description ?? entry.tagline;

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading title={`${title} ${emoji}`} description={description} />
      {eff && !eff.enabled ? (
        <EmptyState
          variant="permission"
          icon={Gamepad2}
          title="Bu oyun şu anda kapalı"
          description="Oyun yönetici tarafından geçici olarak kapatıldı. Oyun Merkezi’nden başka bir oyun seçebilirsin."
          action={
            <Button asChild>
              <Link href={GAMES_HUB_PATH}>Oyun Merkezi’ne dön</Link>
            </Button>
          }
        />
      ) : (
        <GameHost id={entry.id} initialMode={kipOf((await searchParams).kip)} />
      )}
    </div>
  );
}
