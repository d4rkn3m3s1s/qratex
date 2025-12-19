import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import { Chatbot } from '@/components/chat/chatbot';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'QRATEX - QR Tabanlı Geri Bildirim Platformu',
    template: '%s | QRATEX',
  },
  description:
    'QRATEX ile müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin ve gamification ile müşteri bağlılığını artırın.',
  keywords: [
    'QR kod',
    'geri bildirim',
    'müşteri deneyimi',
    'gamification',
    'AI analizi',
    'işletme yönetimi',
  ],
  authors: [{ name: 'QRATEX Team' }],
  creator: 'QRATEX',
  publisher: 'QRATEX',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://qratex.netlify.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: '/',
    siteName: 'QRATEX',
    title: 'QRATEX - QR Tabanlı Geri Bildirim Platformu',
    description:
      'Müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin.',
    images: [
      {
        url: '/logo/logo.png',
        width: 512,
        height: 512,
        alt: 'QRATEX',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QRATEX - QR Tabanlı Geri Bildirim Platformu',
    description:
      'Müşteri geri bildirimlerini QR kodlar üzerinden toplayın, AI ile analiz edin.',
    images: ['/logo/logo.png'],
    creator: '@qratex',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo/logo.png', type: 'image/png' },
      { url: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    shortcut: '/logo/logo.png',
    apple: [
      { url: '/logo/logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QRATEX',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/png" href="/logo/logo.png" />
      </head>
      <body className="min-h-dvh bg-background font-sans antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster />
          <Chatbot />
        </Providers>
      </body>
    </html>
  );
}
