import {
  BLOG_CATEGORIES,
  BLOG_POSTS,
  countByCategory,
  countWords,
  formatBlogDate,
  getAdjacentPosts,
  getAllPosts,
  getLatestModified,
  getPostToc,
  getPostsByCategory,
  getReadingMinutes,
  getRelatedPosts,
  isBlogCategory,
  paginate,
  parseInline,
  parsePageParam,
  plainText,
  slugifyHeading,
  type BlogPost,
} from '@/lib/blog-posts';

function post(over: Partial<BlogPost>): BlogPost {
  return {
    slug: 'x',
    title: 'Başlık',
    description: 'Açıklama',
    datePublished: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-01-01T00:00:00.000Z',
    author: { name: 'QRateX Ekibi', kind: 'Organization' },
    category: 'gizlilik',
    audience: 'both',
    tags: [],
    content: [],
    ...over,
  };
}

describe('blog içerik bütünlüğü', () => {
  it('slug’lar tekil, kategoriler geçerli, tarihler ayrıştırılabilir ve değişiklik ≥ yayın', () => {
    const slugs = new Set<string>();
    for (const p of BLOG_POSTS) {
      expect(slugs.has(p.slug)).toBe(false);
      slugs.add(p.slug);
      expect(p.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(isBlogCategory(p.category)).toBe(true);
      expect(Number.isFinite(Date.parse(p.datePublished))).toBe(true);
      expect(Date.parse(p.dateModified)).toBeGreaterThanOrEqual(Date.parse(p.datePublished));
      expect(p.description.length).toBeLessThanOrEqual(200);
    }
  });

  it('içerikteki satır içi bağlantılar yalnız site içi yollara gider', () => {
    for (const p of BLOG_POSTS) {
      for (const b of p.content) {
        const texts = b.type === 'ul' || b.type === 'ol' ? b.items : 'text' in b ? [b.text] : [];
        for (const t of texts) {
          for (const seg of parseInline(t)) {
            if (seg.type === 'link') expect(seg.href.startsWith('/')).toBe(true);
          }
        }
      }
    }
  });
});

describe('sıralama, süzme, sayfalama', () => {
  const posts = [
    post({ slug: 'eski', datePublished: '2025-01-01T00:00:00.000Z', dateModified: '2025-01-01T00:00:00.000Z', category: 'oyunlastirma' }),
    post({ slug: 'yeni', datePublished: '2026-05-01T00:00:00.000Z', dateModified: '2026-06-01T00:00:00.000Z' }),
    post({ slug: 'orta', datePublished: '2025-06-01T00:00:00.000Z', dateModified: '2025-06-01T00:00:00.000Z' }),
  ];

  it('dizinin elle sırasından bağımsız, yeniden eskiye sıralar', () => {
    expect(getAllPosts(posts).map((p) => p.slug)).toEqual(['yeni', 'orta', 'eski']);
  });

  it('kategoriye göre süzer ve sayar', () => {
    expect(getPostsByCategory('oyunlastirma', posts).map((p) => p.slug)).toEqual(['eski']);
    expect(getPostsByCategory(null, posts)).toHaveLength(3);
    expect(countByCategory(posts)).toEqual({ 'isletme-rehberi': 0, oyunlastirma: 1, gizlilik: 2 });
  });

  it('komşu yazılar ve en son değişiklik', () => {
    expect(getAdjacentPosts('orta', posts)).toEqual({ newer: posts[1], older: posts[0] });
    expect(getAdjacentPosts('yeni', posts).newer).toBeUndefined();
    expect(getAdjacentPosts('yok', posts)).toEqual({});
    expect(getLatestModified(posts)).toBe('2026-06-01T00:00:00.000Z');
    expect(getLatestModified([])).toBeNull();
  });

  it('sayfalama sınırları kırpar', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(paginate(items, 1, 9)).toMatchObject({ page: 1, pageCount: 3, total: 20, items: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
    expect(paginate(items, 99, 9).page).toBe(3);
    expect(paginate(items, -4, 9).page).toBe(1);
    expect(paginate([], 1, 9)).toMatchObject({ page: 1, pageCount: 1, items: [] });
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(['2', '5'])).toBe(2);
    expect(parsePageParam('abc')).toBe(1);
    expect(parsePageParam('-1')).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
  });
});

describe('ilgili yazılar', () => {
  it('kendisini dışlar, aynı kategori ve ortak etiketi öne alır', () => {
    const a = post({ slug: 'a', category: 'gizlilik', tags: ['KVKK'] });
    const b = post({ slug: 'b', category: 'oyunlastirma', tags: [], datePublished: '2026-09-01T00:00:00.000Z' });
    const c = post({ slug: 'c', category: 'gizlilik', tags: ['kvkk'] });
    const d = post({ slug: 'd', category: 'isletme-rehberi', tags: ['kvkk'], audience: 'business' });
    const related = getRelatedPosts(a, 2, [a, b, c, d]);
    expect(related.map((p) => p.slug)).toEqual(['c', 'd']);
    expect(getRelatedPosts(a, 0, [a, b])).toEqual([]);
  });
});

describe('içerikten türetilenler', () => {
  it('satır içi bağlantı: yalnız kök-göreli yol, dış adres ve // düz metin kalır', () => {
    expect(parseInline('Bkz. [KVKK](/kvkk-aydinlatma-metni#kategoriler) metni.')).toEqual([
      { type: 'text', text: 'Bkz. ' },
      { type: 'link', text: 'KVKK', href: '/kvkk-aydinlatma-metni#kategoriler' },
      { type: 'text', text: ' metni.' },
    ]);
    expect(parseInline('[kötü](https://evil.example)')).toEqual([{ type: 'text', text: '[kötü](https://evil.example)' }]);
    expect(parseInline('[kötü](//evil.example)')).toEqual([{ type: 'text', text: '[kötü](//evil.example)' }]);
    expect(parseInline('[js](javascript:alert(1))')[0]?.type).toBe('text');
    expect(plainText('a [b](/c) d')).toBe('a b d');
    expect(parseInline('')).toEqual([{ type: 'text', text: '' }]);
  });

  it('okuma süresi kelime sayısından türetilir (≥ 1 dk, ~200 kelime/dk)', () => {
    const words = Array.from({ length: 401 }, () => 'kelime').join(' ');
    const p = post({ title: 'Bir', content: [{ type: 'p', text: words }] });
    expect(countWords(p)).toBe(402);
    expect(getReadingMinutes(p)).toBe(3);
    expect(getReadingMinutes(post({ content: [] }))).toBe(1);
    expect(countWords(post({ title: '', content: [{ type: 'ul', items: ['bir iki', '[üç](/x) dört'] }] }))).toBe(4);
  });

  it('Türkçe başlıkları çapaya çevirir ve tekrarları ayırır', () => {
    expect(slugifyHeading('Neden QR kod?')).toBe('neden-qr-kod');
    expect(slugifyHeading('Çerez Tercihleri: İşletme & Güvenlik')).toBe('cerez-tercihleri-isletme-guvenlik');
    expect(slugifyHeading('???')).toBe('bolum');
    const toc = getPostToc({
      content: [
        { type: 'h2', text: 'Giriş' },
        { type: 'p', text: 'x' },
        { type: 'h2', text: 'Giriş' },
        { type: 'h3', text: 'Alt' },
      ],
    });
    expect(toc).toEqual([
      { id: 'giris', text: 'Giriş', blockIndex: 0 },
      { id: 'giris-2', text: 'Giriş', blockIndex: 2 },
    ]);
  });

  it('tarih biçimi Europe/Istanbul gününe göredir (UTC 22:30 → ertesi gün)', () => {
    expect(formatBlogDate('2026-10-09T22:30:00.000Z')).toBe('10 Ekim 2026');
    expect(formatBlogDate('2025-01-15T10:00:00.000Z', 'short')).toBe('15 Oca 2025');
  });

  it('her kategori için etiket ve açıklama var', () => {
    for (const c of BLOG_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});
