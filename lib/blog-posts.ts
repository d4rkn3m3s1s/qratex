/**
 * Blog yazıları (şimdilik statik; ileride CMS/DB'den gelebilir).
 */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO
  dateModified: string;
  author: string;
  image?: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'qr-kod-ile-geri-bildirim-toplama',
    title: 'QR Kod ile Geri Bildirim Toplama: İşletmeler İçin Rehber',
    description: 'QR kodlar ile müşteri geri bildirimi toplamanın avantajları ve QRATEX ile nasıl başlayacağınız.',
    datePublished: '2025-01-15T10:00:00.000Z',
    dateModified: '2025-01-15T10:00:00.000Z',
    author: 'QRATEX Ekibi',
  },
  {
    slug: 'musteri-deneyimi-ve-gamification',
    title: 'Müşteri Deneyimini Gamification ile Güçlendirmek',
    description: 'Puan, rozet ve görevler ile müşteri bağlılığını artırmanın yolları.',
    datePublished: '2025-01-10T10:00:00.000Z',
    dateModified: '2025-01-10T10:00:00.000Z',
    author: 'QRATEX Ekibi',
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
