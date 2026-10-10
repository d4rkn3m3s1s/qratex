import { MonitorOff } from 'lucide-react';

/** Ekran bağlantısı durum ekranı (geçersiz / iptal / kapalı / hata) — koyu, büyük ve sakin. */
export function WallNotice({ title, description }: { title: string; description?: string }) {
  return (
    <div className="dark flex min-h-dvh items-center justify-center bg-background px-6 text-white">
      <div className="max-w-xl text-center" role="status">
        <MonitorOff aria-hidden className="mx-auto mb-6 h-12 w-12 text-white/60" />
        <h1 className="text-[clamp(1.5rem,3vw,2.5rem)] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-3 text-[clamp(1rem,1.5vw,1.25rem)] text-white/70">{description}</p>}
      </div>
    </div>
  );
}
