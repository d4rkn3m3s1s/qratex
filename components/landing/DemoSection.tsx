'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppT } from '@/lib/app-locale';

function getEmbedUrl(url: string): { type: 'iframe'; src: string } | { type: 'video'; src: string } {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
      if (id) return { type: 'iframe', src: `https://www.youtube.com/embed/${id}` };
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return { type: 'iframe', src: `https://player.vimeo.com/video/${id}` };
    }
  } catch {
    // fallback to direct video
  }
  return { type: 'video', src: url };
}

export default function DemoSection() {
  const t = useAppT();
  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  const embed = demoVideoUrl ? getEmbedUrl(demoVideoUrl) : null;

  return (
    <section id="demo" className="py-20 lg:py-32 scroll-mt-20 [content-visibility:auto]">
      <div className="container px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{t('landing.demo.badge')}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {t('landing.demo.heading')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10 text-balance leading-relaxed">
            {t('landing.demo.sub')}
          </p>
          <div className="max-w-2xl mx-auto rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 sm:p-8 shadow-lg">
            <div className="aspect-video rounded-xl overflow-hidden bg-muted">
              {embed ? (
                embed.type === 'iframe' ? (
                  <iframe
                    src={embed.src}
                    title={t('landing.demo.videoTitle')}
                    aria-label={t('landing.demo.videoAria')}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={embed.src}
                    controls
                    className="w-full h-full"
                    title={t('landing.demo.videoTitle')}
                    aria-label={t('landing.demo.videoAria')}
                  />
                )
              ) : (
                /* Video gelene kadar zengin ürün-önizleme poster'ı (QR tarama akışı) */
                <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-primary/10 via-background to-fuchsia-500/10">
                  {/* Izgara dokusu */}
                  <div
                    className="absolute inset-0 opacity-[0.15]"
                    style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '28px 28px' }}
                    aria-hidden
                  />
                  {/* Sahte QR + tarama çizgisi */}
                  <div className="absolute inset-0 flex items-center justify-center gap-6 sm:gap-10 px-6">
                    <div className="relative">
                      <div className="relative grid h-24 w-24 sm:h-32 sm:w-32 place-items-center rounded-2xl border border-border/60 bg-card shadow-xl">
                        <svg viewBox="0 0 100 100" className="h-16 w-16 sm:h-20 sm:w-20 text-foreground" aria-hidden>
                          <rect x="8" y="8" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6"/>
                          <rect x="66" y="8" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6"/>
                          <rect x="8" y="66" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6"/>
                          <rect x="16" y="16" width="10" height="10" fill="currentColor"/>
                          <rect x="74" y="16" width="10" height="10" fill="currentColor"/>
                          <rect x="16" y="74" width="10" height="10" fill="currentColor"/>
                          <rect x="46" y="8" width="8" height="8" fill="currentColor"/>
                          <rect x="46" y="24" width="8" height="8" fill="currentColor"/>
                          <rect x="62" y="46" width="8" height="8" fill="currentColor"/>
                          <rect x="46" y="46" width="8" height="8" fill="currentColor"/>
                          <rect x="78" y="62" width="8" height="8" fill="currentColor"/>
                          <rect x="46" y="78" width="8" height="8" fill="currentColor"/>
                          <rect x="62" y="78" width="8" height="8" fill="currentColor"/>
                          <rect x="78" y="78" width="14" height="14" fill="currentColor"/>
                        </svg>
                        <motion.div
                          className="absolute inset-x-2 h-0.5 rounded-full bg-primary shadow-[0_0_12px_2px_hsl(var(--primary))]"
                          initial={{ top: '10%' }}
                          animate={{ top: ['10%', '86%', '10%'] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                    </div>
                    {/* Sahte geri-bildirim kartı */}
                    <div className="hidden sm:flex w-44 flex-col gap-2 rounded-xl border border-border/60 bg-card/90 p-3 shadow-lg backdrop-blur">
                      <div className="flex items-center gap-1 text-amber-400">
                        {[0, 1, 2, 3, 4].map((s) => (
                          <svg key={s} viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/>
                          </svg>
                        ))}
                      </div>
                      <div className="h-2 w-full rounded bg-muted" />
                      <div className="h-2 w-4/5 rounded bg-muted" />
                      <div className="h-2 w-2/3 rounded bg-muted" />
                      <div className="mt-1 h-6 w-20 rounded-md bg-primary/80" />
                    </div>
                  </div>
                  {/* Alt bilgi + CTA */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-background/90 to-transparent p-4 text-center">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Play className="h-3.5 w-3.5" /> {t('landing.demo.placeholder')}
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/#features">{t('landing.demo.ctaFeatures')}</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
