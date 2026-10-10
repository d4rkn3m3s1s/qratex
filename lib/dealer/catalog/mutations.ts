/**
 * Ürün kataloğu — yazma işlemleri (Prisma). Hepsi kiracı kapsamlı (`dealerId` çağırandan),
 * sunucu otoriter: sahiplik, kategori erişimi, görsel alanı, yinelenen ad ve sürüm (409)
 * burada denetlenir. Silme YOK: ürün ve kategori arşivlenir (`isActive=false`), tüketim
 * geçmişi korunur ve geri yüklenebilir.
 */
import 'server-only';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { uploadToR2 } from '@/lib/r2-storage';
import { feedbackPhotosEnabled, MAX_UPLOAD_BYTES, processFeedbackPhoto } from '@/lib/feedback-funnel/media';
import { buildImportReport, isAcceptedProductImage, productImageKey, toProductDto, type RawProduct } from './core';
import { adjustMinorByPercent, minorToPrice, priceToMinor } from './money';
import type { CategoryCreateInput, ProductBulkInput, ProductCreateInput, ProductUpdateInput } from './schemas';
import { normalizeForSearch, sameName } from './text';
import type { CatalogProductDto, ImportReportDto } from './types';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  image: true,
  isActive: true,
  dealerId: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, icon: true, isActive: true } },
} as const;

function publicBase(): string | null {
  const v = process.env.R2_PUBLIC_URL?.trim();
  return v ? v.replace(/\/$/, '') : null;
}

function toDto(p: unknown, dealerId: string): CatalogProductDto {
  return toProductDto(p as RawProduct, dealerId, undefined, true);
}

/** Bayinin kendi ürünü (sistem ürünü ya da başka bayininki → 403/404). */
async function ownedProduct(dealerId: string, productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, dealerId: true, name: true, image: true, isActive: true, updatedAt: true, categoryId: true, category: { select: { isActive: true } } },
  });
  if (!p || (p.dealerId !== null && p.dealerId !== dealerId)) throw new ApiError('NOT_FOUND', 'Ürün bulunamadı.');
  if (p.dealerId === null) {
    throw new ApiError('FORBIDDEN', 'Sistem ürünleri düzenlenemez; "Kopyamı oluştur" ile kendi ürününüzü açın.');
  }
  return p;
}

/** Ürün eklenebilecek kategori: bayinin ya da sistemin AKTİF kategorisi. */
async function usableCategory(dealerId: string, categoryId: string) {
  const c = await prisma.productCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, dealerId: true, isActive: true },
  });
  if (!c || (c.dealerId !== null && c.dealerId !== dealerId)) {
    throw new ApiError('VALIDATION', 'Kategori bulunamadı.', { details: [{ path: 'categoryId', message: 'Kategori bulunamadı.' }] });
  }
  if (!c.isActive) {
    throw new ApiError('VALIDATION', 'Bu kategori arşivde; önce geri yükleyin ya da başka kategori seçin.', {
      details: [{ path: 'categoryId', message: 'Kategori arşivde.' }],
    });
  }
  return c;
}

function assertImage(dealerId: string, url: string | null | undefined, current: string | null = null) {
  if (url === undefined || url === null || url === current) return;
  if (!isAcceptedProductImage(url, dealerId, publicBase())) {
    throw new ApiError('VALIDATION', 'Görsel bu ekrandan yüklenmeli.', { details: [{ path: 'image', message: 'Görsel geçersiz.' }] });
  }
}

async function assertUniqueName(dealerId: string, name: string, exceptId?: string) {
  const rows = await prisma.product.findMany({
    where: { dealerId, isActive: true, name: { equals: name.trim(), mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true, name: true },
    take: 5,
  });
  if (rows.some((r) => sameName(r.name, name))) {
    throw new ApiError('CONFLICT', 'Bu adla aktif bir ürününüz zaten var.', {
      status: 409,
      details: [{ path: 'name', message: 'Bu adla aktif bir ürününüz var.' }],
    });
  }
}

// ───────────────────────────── Ürün ─────────────────────────────

export async function createProduct(dealerId: string, input: ProductCreateInput): Promise<CatalogProductDto> {
  await usableCategory(dealerId, input.categoryId);
  assertImage(dealerId, input.image);
  await assertUniqueName(dealerId, input.name);
  const p = await prisma.product.create({
    data: {
      name: input.name,
      description: input.description,
      price: minorToPrice(input.priceMinor),
      categoryId: input.categoryId,
      image: input.image,
      dealerId,
    },
    select: PRODUCT_SELECT,
  });
  return toDto(p, dealerId);
}

export async function updateProduct(dealerId: string, productId: string, input: ProductUpdateInput): Promise<CatalogProductDto> {
  const current = await ownedProduct(dealerId, productId);
  if (input.baseUpdatedAt && Date.parse(input.baseUpdatedAt) !== current.updatedAt.getTime()) {
    throw new ApiError('CONFLICT', 'Ürün siz düzenlerken değişti. En son hâli yükleyip tekrar deneyin.', { status: 409 });
  }
  if (input.categoryId && input.categoryId !== current.categoryId) await usableCategory(dealerId, input.categoryId);
  assertImage(dealerId, input.image, current.image);
  const willBeActive = input.isActive ?? current.isActive;
  if (willBeActive && (input.name !== undefined || (input.isActive === true && !current.isActive))) {
    await assertUniqueName(dealerId, input.name ?? current.name, productId);
  }
  if (input.isActive === true && !current.isActive && !input.categoryId && !current.category.isActive) {
    throw new ApiError('CONFLICT', 'Ürünün kategorisi arşivde. Önce kategoriyi geri yükleyin ya da ürünü taşıyın.', { status: 409 });
  }
  const p = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priceMinor !== undefined ? { price: minorToPrice(input.priceMinor) } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: PRODUCT_SELECT,
  });
  return toDto(p, dealerId);
}

/** Sistem ürününden bayiye ait kopya (envanter #37 / Bulgu 9). */
export async function copyGlobalProduct(dealerId: string, productId: string): Promise<CatalogProductDto> {
  const src = await prisma.product.findFirst({
    where: { id: productId, dealerId: null, isActive: true },
    select: { name: true, description: true, price: true, categoryId: true, category: { select: { isActive: true } } },
  });
  if (!src) throw new ApiError('NOT_FOUND', 'Sistem ürünü bulunamadı.');
  await assertUniqueName(dealerId, src.name);
  const p = await prisma.product.create({
    data: { name: src.name, description: src.description, price: src.price, categoryId: src.categoryId, dealerId },
    select: PRODUCT_SELECT,
  });
  return toDto(p, dealerId);
}

export type BulkResult = { updated: number; skipped: number; skippedReasons: string[] };

export async function bulkProducts(dealerId: string, input: ProductBulkInput): Promise<BulkResult> {
  const rows = await prisma.product.findMany({
    where: { id: { in: input.ids }, dealerId },
    select: { id: true, name: true, price: true, isActive: true, category: { select: { isActive: true } } },
  });
  const reasons = new Set<string>();
  const foreign = input.ids.length - rows.length;
  if (foreign > 0) reasons.add('Sistem ürünleri ya da bulunamayan kayıtlar atlandı.');

  if (input.action === 'move') {
    await usableCategory(dealerId, input.categoryId!);
    const r = await prisma.product.updateMany({ where: { id: { in: rows.map((x) => x.id) }, dealerId }, data: { categoryId: input.categoryId! } });
    return { updated: r.count, skipped: input.ids.length - r.count, skippedReasons: [...reasons] };
  }
  if (input.action === 'archive' || input.action === 'restore') {
    const target = input.action === 'restore';
    let eligible = rows.filter((x) => x.isActive !== target);
    if (target) {
      const blocked = eligible.filter((x) => !x.category.isActive);
      if (blocked.length) reasons.add('Kategorisi arşivde olan ürünler geri yüklenmedi.');
      eligible = eligible.filter((x) => x.category.isActive);
      // Aynı adla aktif ürün varsa geri yükleme yinelenen ad üretir → atla.
      const active = await prisma.product.findMany({ where: { dealerId, isActive: true }, select: { name: true } });
      const before = eligible.length;
      eligible = eligible.filter((x) => !active.some((a) => sameName(a.name, x.name)));
      if (eligible.length < before) reasons.add('Aynı adla aktif ürünü olanlar geri yüklenmedi.');
    }
    const r = await prisma.product.updateMany({ where: { id: { in: eligible.map((x) => x.id) }, dealerId }, data: { isActive: target } });
    return { updated: r.count, skipped: input.ids.length - r.count, skippedReasons: [...reasons] };
  }
  // adjustPrice — kuruşta hesap, ürün başına tek güncelleme (≤ 200, tek işlem).
  const priced = rows.filter((x) => x.price !== null);
  if (priced.length < rows.length) reasons.add('Fiyatı girilmemiş ürünler değiştirilmedi.');
  await prisma.$transaction(
    priced.map((x) =>
      prisma.product.update({
        where: { id: x.id },
        data: { price: minorToPrice(adjustMinorByPercent(priceToMinor(x.price) ?? 0, input.percent!, input.roundTo ?? 1)) },
        select: { id: true },
      })
    )
  );
  return { updated: priced.length, skipped: input.ids.length - priced.length, skippedReasons: [...reasons] };
}

// ───────────────────────────── Görsel ─────────────────────────────

export function productImagesEnabled(): boolean {
  return feedbackPhotosEnabled();
}

/** Baytlardan biçim doğrular, yeniden kodlar (EXIF/konum atılır) ve R2'ye yazar. */
export async function uploadProductImage(dealerId: string, file: { size: number; arrayBuffer(): Promise<ArrayBuffer> }) {
  if (!productImagesEnabled()) throw new ApiError('SERVICE_UNAVAILABLE', 'Görsel yükleme şu anda kullanılamıyor.', { retryable: false });
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Görsel çok büyük (en fazla 4 MB).');
  const processed = await processFeedbackPhoto(Buffer.from(await file.arrayBuffer()));
  if (!processed) throw new ApiError('VALIDATION', 'Yalnız JPEG, PNG, WebP ya da HEIC görsel yüklenebilir.');
  const key = productImageKey(dealerId, randomBytes(18).toString('base64url'));
  const url = await uploadToR2(key, processed.buffer, 'image/jpeg', 'inline');
  return { url, width: processed.width, height: processed.height };
}

// ───────────────────────────── Kategori ─────────────────────────────

async function ownedCategory(dealerId: string, categoryId: string) {
  const c = await prisma.productCategory.findUnique({ where: { id: categoryId }, select: { id: true, dealerId: true, name: true, isActive: true } });
  if (!c || (c.dealerId !== null && c.dealerId !== dealerId)) throw new ApiError('NOT_FOUND', 'Kategori bulunamadı.');
  if (c.dealerId === null) throw new ApiError('FORBIDDEN', 'Sistem kategorileri değiştirilemez.');
  return c;
}

async function assertUniqueCategory(dealerId: string, name: string, exceptId?: string) {
  const rows = await prisma.productCategory.findMany({
    where: { OR: [{ dealerId }, { dealerId: null }], isActive: true, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
    take: 500,
  });
  if (rows.some((r) => sameName(r.name, name))) {
    throw new ApiError('CONFLICT', 'Bu adla bir kategori zaten var.', { status: 409, details: [{ path: 'name', message: 'Bu adla bir kategori var.' }] });
  }
}

export async function createCategory(dealerId: string, input: CategoryCreateInput) {
  await assertUniqueCategory(dealerId, input.name);
  const max = await prisma.productCategory.aggregate({ where: { dealerId }, _max: { order: true } });
  return prisma.productCategory.create({
    data: { name: input.name, icon: input.icon, dealerId, order: (max._max.order ?? 0) + 1 },
    select: { id: true, name: true, icon: true, order: true, isActive: true },
  });
}

export async function updateCategory(dealerId: string, categoryId: string, input: { name?: string; icon?: string; isActive?: boolean }) {
  const c = await ownedCategory(dealerId, categoryId);
  if (input.name !== undefined || (input.isActive === true && !c.isActive)) await assertUniqueCategory(dealerId, input.name ?? c.name, categoryId);
  return prisma.productCategory.update({
    where: { id: categoryId },
    data: input,
    select: { id: true, name: true, icon: true, order: true, isActive: true },
  });
}

/** Arşivle: içinde aktif ürün varsa hedef kategori ZORUNLU (ürünler taşınır, sonra arşiv). */
export async function archiveCategory(dealerId: string, categoryId: string, moveToCategoryId: string | null | undefined) {
  await ownedCategory(dealerId, categoryId);
  const activeProducts = await prisma.product.count({ where: { categoryId, dealerId, isActive: true } });
  if (activeProducts > 0 && !moveToCategoryId) {
    throw new ApiError('CONFLICT', `Bu kategoride ${activeProducts} aktif ürün var; önce taşınacağı kategoriyi seçin.`, {
      status: 409,
      details: { activeProducts },
    });
  }
  if (moveToCategoryId) {
    if (moveToCategoryId === categoryId) throw new ApiError('VALIDATION', 'Ürünler aynı kategoriye taşınamaz.');
    await usableCategory(dealerId, moveToCategoryId);
  }
  const [moved] = await prisma.$transaction([
    prisma.product.updateMany({ where: { categoryId, dealerId, isActive: true }, data: { categoryId: moveToCategoryId ?? categoryId } }),
    prisma.productCategory.update({ where: { id: categoryId }, data: { isActive: false }, select: { id: true } }),
  ]);
  return { moved: moveToCategoryId ? moved.count : 0 };
}

/** Bayi kategorilerinin sırası (sistem kategorileri sabit kalır). */
export async function reorderCategories(dealerId: string, ids: readonly string[]) {
  const own = await prisma.productCategory.findMany({ where: { id: { in: [...ids] }, dealerId }, select: { id: true } });
  if (own.length !== ids.length) throw new ApiError('VALIDATION', 'Yalnız kendi kategorileriniz sıralanabilir.');
  await prisma.$transaction(ids.map((id, i) => prisma.productCategory.update({ where: { id }, data: { order: i + 1 }, select: { id: true } })));
  return { updated: ids.length };
}

// ───────────────────────────── İçe / dışa aktarma ─────────────────────────────

export async function importProducts(dealerId: string, csv: string, onDuplicate: 'skip' | 'update', commit: boolean): Promise<ImportReportDto> {
  const [categories, products] = await Promise.all([
    prisma.productCategory.findMany({ where: { OR: [{ dealerId }, { dealerId: null }], isActive: true }, select: { id: true, name: true }, take: 500 }),
    prisma.product.findMany({ where: { dealerId, isActive: true }, select: { id: true, name: true }, take: 5000 }),
  ]);
  const report = buildImportReport(csv, { categories, products }, onDuplicate);
  if (!commit || report.fileError) return report;
  const writable = report.rows.filter((r) => r.status === 'create' || r.status === 'update');
  if (writable.length === 0) return { ...report, committed: true };

  await prisma.$transaction(
    async (tx) => {
      const created = new Map<string, string>(); // kategori adı (küçük) → id
      const maxOrder = (await tx.productCategory.aggregate({ where: { dealerId }, _max: { order: true } }))._max.order ?? 0;
      let order = maxOrder;
      for (const r of writable) {
        let categoryId = r.categoryId;
        if (!categoryId) {
          const key = normalizeForSearch(r.categoryName);
          categoryId = created.get(key) ?? null;
          if (!categoryId) {
            order += 1;
            const c = await tx.productCategory.create({ data: { name: r.categoryName, dealerId, order }, select: { id: true } });
            created.set(key, c.id);
            categoryId = c.id;
          }
        }
        const data = { name: r.name, description: r.description, price: minorToPrice(r.priceMinor), categoryId };
        if (r.status === 'update' && r.productId) {
          await tx.product.update({ where: { id: r.productId }, data, select: { id: true } });
        } else {
          await tx.product.create({ data: { ...data, dealerId }, select: { id: true } });
        }
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
  return { ...report, committed: true };
}

export async function exportProducts(dealerId: string, includeArchived: boolean) {
  return prisma.product.findMany({
    where: { dealerId, ...(includeArchived ? {} : { isActive: true }) },
    select: { name: true, description: true, price: true, category: { select: { name: true } } },
    orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
    take: 5000,
  });
}
