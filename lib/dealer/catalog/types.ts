/**
 * Ürün kataloğu (/dealer/products) — BFF sözleşmesi. Para hep KURUŞ (`priceMinor`).
 */

/** Ürün başına müşteri deneyimi özeti — son 30 gün (İstanbul günü sınırı). */
export type ProductStatsDto = {
  /** Son 30 günde bu ürünle açılan tüketim kaydı. */
  consumptions30: number;
  /** Önceki 30 gün (eğilim için). */
  consumptionsPrev30: number;
  /** Son 30 günün tüketimlerine yazılmış (silinmemiş) değerlendirme sayısı. */
  reviews30: number;
  /** Ortalama puan (1–5); değerlendirme yoksa null. */
  avgRating30: number | null;
  /** 1–2 yıldızlı değerlendirme sayısı. */
  low30: number;
};

export type CatalogCategoryRef = { id: string; name: string; icon: string; isActive: boolean };

export type CatalogProductDto = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  image: string | null;
  isActive: boolean;
  /** Sistem (global) ürünü: bayi düzenleyemez, kopyasını oluşturabilir. */
  isGlobal: boolean;
  canEdit: boolean;
  category: CatalogCategoryRef;
  createdAt: string;
  updatedAt: string;
  stats: ProductStatsDto;
};

export type CatalogCategoryDto = {
  id: string;
  name: string;
  icon: string;
  order: number;
  isGlobal: boolean;
  /** Arşivlenmiş (bayi kategorisi); arşivdeyken ürün eklenemez, geri yüklenebilir. */
  isActive: boolean;
  canEdit: boolean;
  /** Bu bayinin (ve sistem) aktif ürünleri — başka bayilerinki SAYILMAZ (Bulgu 10). */
  activeCount: number;
  archivedCount: number;
};

export type CatalogInsightsDto = {
  windowDays: 30;
  activeCount: number;
  archivedCount: number;
  /** Fiyatı girilmemiş aktif ürün sayısı. */
  missingPrice: number;
  /** Son 30 günde en çok tüketilen aktif ürün. */
  topConsumed: { id: string; name: string; count: number } | null;
  /** En düşük ortalama puan (en az `minReviews` değerlendirme). */
  lowestRated: { id: string; name: string; avg: number; reviews: number } | null;
  minReviews: number;
  /** Son 30 günde ürün seçilerek açılan tüketim toplamı. */
  consumptionsWithProduct30: number;
};

export type CatalogPageDto = {
  items: CatalogProductDto[];
  /** Filtreye uyan toplam (sayfalama için). */
  total: number;
  page: number;
  pageSize: number;
  /** Katalog yükleme üst sınırına ulaşıldı (liste eksik olabilir — dürüst uyarı). */
  capped: boolean;
  categories: CatalogCategoryDto[];
  insights: CatalogInsightsDto;
  /** R2 yapılandırılmış mı (değilse görsel yükleme gizlenir). */
  imageUploadEnabled: boolean;
  /** Yazma yetkisi (ADMIN bayi adına yalnız okur). */
  canWrite: boolean;
  generatedAt: string;
};

export type ProductReviewDto = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  replied: boolean;
};

export type ProductDetailDto = {
  product: CatalogProductDto;
  /** Son 30 gün puan dağılımı: index 0 → 1 yıldız … 4 → 5 yıldız. */
  distribution: [number, number, number, number, number];
  /** Son 8 İstanbul haftası (Pazartesi başlangıçlı), eskiden yeniye. */
  weekly: Array<{ weekStart: string; consumptions: number; avgRating: number | null }>;
  /** En yeni 5 değerlendirme (moderasyonla silinenler hariç). */
  recentReviews: ProductReviewDto[];
  /** Tüm zamanların tüketim sayısı (bu bayide). */
  consumptionsAllTime: number;
};

export type ImportRowStatus = 'create' | 'update' | 'skip' | 'error';

export type ImportRowReport = {
  /** Dosyadaki satır numarası (başlık = 1). */
  line: number;
  name: string;
  categoryName: string;
  priceMinor: number | null;
  description: string | null;
  status: ImportRowStatus;
  errors: string[];
  /** Eşleşen mevcut kategori (yoksa yeni oluşturulacak). */
  categoryId: string | null;
  newCategory: boolean;
  /** Güncellenecek mevcut ürün. */
  productId: string | null;
};

export type ImportReportDto = {
  committed: boolean;
  /** Dosya düzeyi hata (başlık eksik, satır sınırı vb.); varsa satır raporu boştur. */
  fileError: string | null;
  rows: ImportRowReport[];
  summary: { create: number; update: number; skip: number; error: number; newCategories: string[] };
};
