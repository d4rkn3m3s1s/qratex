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
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">{t('landing.demo.placeholder')}</p>
                    <Button asChild variant="outline" size="sm" className="mt-4">
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
