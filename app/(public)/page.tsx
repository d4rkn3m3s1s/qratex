'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  QrCode,
  BarChart3,
  Trophy,
  Sparkles,
  Shield,
  Zap,
  Star,
  ArrowRight,
  Check,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DynamicBackground, type BackgroundVariant } from '@/components/ui/backgrounds';

const features = [
  {
    icon: QrCode,
    title: 'Akıllı QR Kodlar',
    description: 'Özelleştirilebilir QR kodlar ile müşteri geri bildirimlerini kolayca toplayın.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: BarChart3,
    title: 'AI Destekli Analitik',
    description: 'OpenAI ile duygu analizi, konu çıkarımı ve akıllı içgörüler elde edin.',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    icon: Trophy,
    title: 'Gamification',
    description: 'Puanlar, rozetler, görevler ve ödüllerle müşteri bağlılığını artırın.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: Sparkles,
    title: 'Gerçek Zamanlı',
    description: 'Anlık bildirimler ve canlı dashboard ile her şeyi takip edin.',
    color: 'from-pink-500 to-rose-600',
  },
  {
    icon: Shield,
    title: 'Güvenli & Uyumlu',
    description: 'KVKK uyumlu, şifreli veriler ve rol tabanlı erişim kontrolü.',
    color: 'from-emerald-500 to-green-600',
  },
  {
    icon: Zap,
    title: 'Hızlı Entegrasyon',
    description: 'Dakikalar içinde kurulum yapın, hemen kullanmaya başlayın.',
    color: 'from-yellow-500 to-amber-600',
  },
];

const pricingPlans = [
  {
    name: 'Ücretsiz',
    price: '₺0',
    description: 'Küçük işletmeler için ideal',
    features: ['3 QR Kod', 'Aylık 100 Geri Bildirim', 'Temel Analitik', 'E-posta Desteği'],
    cta: 'Ücretsiz Başla',
    popular: false,
  },
  {
    name: 'Başlangıç',
    price: '₺299',
    period: '/ay',
    description: 'Büyüyen işletmeler için',
    features: [
      '10 QR Kod',
      'Aylık 500 Geri Bildirim',
      'Gelişmiş Analitik',
      'AI Duygu Analizi',
      'Öncelikli Destek',
    ],
    cta: 'Planı Seç',
    popular: true,
  },
  {
    name: 'Profesyonel',
    price: '₺699',
    period: '/ay',
    description: 'Orta ölçekli işletmeler için',
    features: [
      'Sınırsız QR Kod',
      'Sınırsız Geri Bildirim',
      'Tam Analitik Paketi',
      'AI Asistan',
      'API Erişimi',
      '7/24 Destek',
    ],
    cta: 'Planı Seç',
    popular: false,
  },
];

const testimonials = [
  {
    name: 'Ahmet Yılmaz',
    role: 'Cafe Sahibi',
    image: '/testimonials/1.jpg',
    content:
      'QRATEX sayesinde müşteri memnuniyetimizi %40 artırdık. Gerçek zamanlı geri bildirimler işimizi dönüştürdü.',
  },
  {
    name: 'Elif Kaya',
    role: 'Restoran Müdürü',
    content:
      'Gamification sistemi müşterilerimizi çok heyecanlandırdı. Tekrar ziyaret oranımız ikiye katlandı.',
  },
  {
    name: 'Mehmet Demir',
    role: 'Otel Yöneticisi',
    content:
      'AI analizi sayesinde müşteri şikayetlerini önceden tespit edebiliyoruz. Harika bir araç!',
  },
];

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5 }
  },
};

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundVariant>('original');

  useEffect(() => {
    // Fetch background effect from API
    const fetchBackground = async () => {
      try {
        const res = await fetch('/api/settings/background');
        if (res.ok) {
          const data = await res.json();
          if (data.backgroundEffect) {
            setBackgroundEffect(data.backgroundEffect);
          }
        }
      } catch (error) {
        console.error('Failed to fetch background:', error);
      }
    };
    fetchBackground();
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role) {
      const roleRoutes: Record<string, string> = {
        ADMIN: '/admin',
        DEALER: '/dealer',
        CUSTOMER: '/customer',
      };
      const targetRoute = roleRoutes[session.user.role] || '/customer';
      router.push(targetRoute);
    }
  }, [session, status, router]);

  // Show loading while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden pt-16">
        {/* Dynamic Background from Admin Settings (not original or none) */}
        {backgroundEffect !== 'none' && backgroundEffect !== 'original' && (
          <div className="absolute inset-0 z-0">
            <DynamicBackground variant={backgroundEffect} fetchFromApi={false} className="absolute inset-0">
              <div />
            </DynamicBackground>
          </div>
        )}

        {/* Original/Default Background Effects */}
        {(backgroundEffect === 'original' || backgroundEffect === 'none') && (
          <>
            <div className="absolute inset-0 gradient-mesh opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/50 to-background" />
          </>
        )}
        
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/30 to-background z-[1]" />
        
        {/* Floating Orbs - Only show with original background */}
        {backgroundEffect === 'original' && [
          { size: 120, x: '10%', y: '20%', color: 'bg-purple-500/50', blur: 'blur-2xl', duration: 8 },
          { size: 100, x: '80%', y: '15%', color: 'bg-fuchsia-500/40', blur: 'blur-2xl', duration: 10 },
          { size: 150, x: '70%', y: '60%', color: 'bg-pink-500/50', blur: 'blur-3xl', duration: 12 },
          { size: 80, x: '20%', y: '70%', color: 'bg-violet-500/50', blur: 'blur-xl', duration: 7 },
          { size: 130, x: '50%', y: '80%', color: 'bg-fuchsia-600/40', blur: 'blur-2xl', duration: 9 },
          { size: 90, x: '85%', y: '45%', color: 'bg-purple-600/40', blur: 'blur-xl', duration: 11 },
          { size: 110, x: '5%', y: '50%', color: 'bg-pink-600/40', blur: 'blur-2xl', duration: 8 },
          { size: 70, x: '40%', y: '30%', color: 'bg-violet-600/30', blur: 'blur-xl', duration: 6 },
        ].map((orb, i) => (
          <motion.div
            key={`orb-${i}`}
            className={`absolute rounded-full ${orb.color} ${orb.blur}`}
            style={{
              width: orb.size,
              height: orb.size,
              left: orb.x,
              top: orb.y,
            }}
            animate={{
              x: [0, 30 * (i % 2 === 0 ? 1 : -1), -20 * (i % 2 === 0 ? 1 : -1), 0],
              y: [0, -25, 35, 0],
              scale: [1, 1.15, 0.9, 1],
              opacity: [0.5, 0.8, 0.4, 0.5],
            }}
            transition={{
              duration: orb.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.5,
            }}
          />
        ))}

        {/* Snowfall Effect - Pink/Purple Particles - Only show with original background */}
        {backgroundEffect === 'original' && [...Array(40)].map((_, i) => {
          const startX = Math.random() * 100;
          const size = 3 + Math.random() * 6;
          const duration = 8 + Math.random() * 8;
          const delay = Math.random() * 10;
          const drift = (Math.random() - 0.5) * 100;
          
          return (
            <motion.div
              key={`snow-${i}`}
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                left: `${startX}%`,
                top: '-5%',
                background: i % 4 === 0 
                  ? 'radial-gradient(circle, #f0abfc 0%, #d946ef 100%)'
                  : i % 4 === 1
                    ? 'radial-gradient(circle, #e879f9 0%, #a855f7 100%)'
                    : i % 4 === 2
                      ? 'radial-gradient(circle, #f472b6 0%, #ec4899 100%)'
                      : 'radial-gradient(circle, #c084fc 0%, #8b5cf6 100%)',
                boxShadow: i % 4 === 0 
                  ? '0 0 10px 3px rgba(240, 171, 252, 0.6)'
                  : i % 4 === 1
                    ? '0 0 10px 3px rgba(232, 121, 249, 0.6)'
                    : i % 4 === 2
                      ? '0 0 10px 3px rgba(244, 114, 182, 0.6)'
                      : '0 0 10px 3px rgba(192, 132, 252, 0.6)',
              }}
              animate={{
                y: ['0vh', '110vh'],
                x: [0, drift, drift * 0.5, drift * 1.2, 0],
                rotate: [0, 360],
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{
                duration: duration,
                repeat: Infinity,
                ease: 'linear',
                delay: delay,
              }}
            />
          );
        })}

        {/* Larger Snowflakes - Only show with original background */}
        {backgroundEffect === 'original' && [...Array(15)].map((_, i) => {
          const startX = 5 + Math.random() * 90;
          const size = 8 + Math.random() * 8;
          const duration = 12 + Math.random() * 8;
          const delay = Math.random() * 8;
          
          return (
            <motion.div
              key={`bigsnow-${i}`}
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                left: `${startX}%`,
                top: '-5%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, #f0abfc 50%, #d946ef 100%)',
                boxShadow: '0 0 20px 6px rgba(240, 171, 252, 0.7), 0 0 40px 10px rgba(217, 70, 239, 0.4)',
              }}
              animate={{
                y: ['0vh', '110vh'],
                x: [0, 50 * (i % 2 === 0 ? 1 : -1), -30 * (i % 2 === 0 ? 1 : -1), 40, 0],
                scale: [0.8, 1.2, 1, 1.1, 0.8],
                opacity: [0, 1, 0.9, 0.8, 0],
              }}
              transition={{
                duration: duration,
                repeat: Infinity,
                ease: 'linear',
                delay: delay,
              }}
            />
          );
        })}

        {/* Sparkle Stars - Only show with original background */}
        {backgroundEffect === 'original' && [...Array(12)].map((_, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute"
            style={{
              left: `${5 + Math.random() * 90}%`,
              top: `${5 + Math.random() * 90}%`,
            }}
          >
            <motion.div
              className="w-1 h-1 bg-white rounded-full"
              style={{
                boxShadow: '0 0 10px 4px rgba(255,255,255,0.8), 0 0 20px 8px rgba(240, 171, 252, 0.5)',
              }}
              animate={{
                scale: [0, 1.5, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: Math.random() * 4,
              }}
            />
          </motion.div>
        ))}

        <div className="container relative z-10 px-4 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Badge variant="secondary" className="mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              Yeni: AI Destekli Duygu Analizi
            </Badge>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Müşteri Deneyimini
              <br />
              <span className="text-gradient">Dönüştürün</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              QRATEX ile QR kodlar üzerinden geri bildirim toplayın, AI ile analiz edin
              ve gamification ile müşteri bağlılığını artırın.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="xl" variant="gradient">
                <Link href="/auth/register">
                  Ücretsiz Başla
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="#demo">
                  <Play className="w-5 h-5 mr-2" />
                  Demo İzle
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <motion.div
              className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-3xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {[
                { value: '10K+', label: 'Aktif Kullanıcı' },
                { value: '500+', label: 'İşletme' },
                { value: '1M+', label: 'Geri Bildirim' },
                { value: '4.9', label: 'Ortalama Puan' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-gradient">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ y: [0, 16, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 lg:py-32 relative">
        <div className="container px-4">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="secondary" className="mb-4">Özellikler</Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Her Şey Tek Platformda
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Müşteri deneyimini yönetmek için ihtiyacınız olan tüm araçlar
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
              >
                <Card hover className="h-full group">
                  <CardHeader>
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}
                    >
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 lg:py-32 bg-muted/30">
        <div className="container px-4">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="secondary" className="mb-4">Nasıl Çalışır</Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              3 Adımda Başlayın
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: '1',
                title: 'Kayıt Olun',
                description: 'Ücretsiz hesap oluşturun ve işletmenizi ekleyin.',
              },
              {
                step: '2',
                title: 'QR Kod Oluşturun',
                description: 'Özelleştirilmiş QR kodlarınızı dakikalar içinde oluşturun.',
              },
              {
                step: '3',
                title: 'Geri Bildirim Toplayın',
                description: 'Müşteriler QR kodu tarayarak kolayca geri bildirim verir.',
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                className="relative text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white shadow-lg shadow-purple-500/25">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
                {index < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-32">
        <div className="container px-4">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="secondary" className="mb-4">Fiyatlandırma</Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Size Uygun Plan
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Her bütçeye uygun esnek planlar. İstediğiniz zaman yükseltin veya iptal edin.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={`relative h-full ${
                    plan.popular
                      ? 'border-primary shadow-lg shadow-primary/20'
                      : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="default" className="shadow-lg">
                        <Star className="w-3 h-3 mr-1" />
                        En Popüler
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      {plan.period && (
                        <span className="text-muted-foreground">{plan.period}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className="w-full"
                      variant={plan.popular ? 'gradient' : 'outline'}
                    >
                      <Link href="/auth/register">{plan.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh opacity-30" />
        <div className="container relative z-10 px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
              Müşteri Deneyimini
              <br />
              <span className="text-gradient">Yeniden Tanımlayın</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              Bugün ücretsiz başlayın ve işletmenizin nasıl dönüştüğünü görün.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="xl" variant="gradient">
                <Link href="/auth/register">
                  Ücretsiz Deneyin
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <a href="mailto:info@qratex.com">Satış ile Görüşün</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

