/**
 * İyimser kilit (P0-28 / K4): "yükleme hatası, ardından Kaydet" ve "son yazan kazanır"
 * sınıfı hataların SUNUCU tarafı savunması.
 *
 * Sözleşme:
 *   - GET, kaynağın o anki `version` değerini döndürür.
 *   - PUT/PATCH/POST gövdesinde `baseVersion` (istemcinin üzerinde çalıştığı sürüm) gelir.
 *   - Yazma, kaynağa özel bir Postgres advisory kilidi altında yapılır: kilit → güncel sürümü
 *     oku → `baseVersion` ile karşılaştır → uyuşmazsa 409 `VERSION_CONFLICT`, uyuşursa yaz.
 *     Kilit transaction sonuna kadar tutulur; aynı kaynağa iki eşzamanlı yazma serileşir ve
 *     ikincisi birincinin yazdığı yeni sürümü görüp 409 alır (kayıp güncelleme olmaz).
 *   - Audit kaydı AYNI transaction içinde yazılır (ayar değişip izi kalmaması imkânsız).
 *
 * Sürüm biçimleri:
 *   - `Settings` satırı: `updatedAt` ISO metni; satır yoksa `NO_VERSION` ('none').
 *   - Çok alanlı/karışık kaynak (ör. kullanıcı profili): düzenlenebilir alanların kararlı
 *     JSON'unun SHA-256 özeti (`h:` önekiyle) — ilgisiz alan güncellemeleri (puan, son giriş)
 *     sahte çakışma üretmez.
 *
 * Bu modül yalnız sunucuda kullanılır (crypto + next/server). İstemci tarafı:
 * `lib/versioned-resource.ts` + `hooks/use-versioned-resource.ts`.
 */
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT';
export const BASE_VERSION_REQUIRED_CODE = 'BASE_VERSION_REQUIRED';
/** Kaynak henüz hiç yazılmamışsa (Settings satırı yok) sürüm belirteci. */
export const NO_VERSION = 'none';

export const VERSION_CONFLICT_MESSAGE =
  'Bu ayarlar siz düzenlerken başka biri tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.';
export const BASE_VERSION_REQUIRED_MESSAGE =
  'Sayfa güncel olmayan bir sürümle açık. Lütfen sayfayı yenileyip tekrar kaydedin.';

/** `updatedAt` → sürüm metni. */
export function versionFromDate(date: Date | null | undefined): string {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : NO_VERSION;
}

/** Anahtar sırasından bağımsız, kararlı JSON (içerik özeti için). */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** İçerik tabanlı sürüm (ETag benzeri). */
export function versionFromContent(value: unknown): string {
  return `h:${createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 32)}`;
}

/**
 * Gövdeden `baseVersion` okur. Zod şemaları bilinmeyen alanları attığı için HAM gövdeden
 * okunur. Boş/bozuk değer → null (çağıran 428 döner ya da isteğe bağlıysa kontrolü atlar).
 */
export function readBaseVersion(raw: unknown, field: string = 'baseVersion'): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[field];
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

/** Çoklu anahtar için `{ key: baseVersion }` haritası (batch uçları). */
export function readBaseVersionMap(raw: unknown, field: string = 'baseVersions'): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const map = (raw as Record<string, unknown>)[field];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim().length > 0 && v.length <= 200) out[k] = v.trim();
  }
  return out;
}

export type VersionConflictDetail = { key: string; currentVersion: string };

export class VersionConflictError extends Error {
  readonly code = VERSION_CONFLICT_CODE;
  readonly currentVersion: string;
  readonly conflicts: VersionConflictDetail[];
  constructor(currentVersion: string, conflicts: VersionConflictDetail[] = []) {
    super(VERSION_CONFLICT_MESSAGE);
    this.name = 'VersionConflictError';
    this.currentVersion = currentVersion;
    this.conflicts = conflicts;
  }
}

export function isVersionConflictError(error: unknown): error is VersionConflictError {
  return error instanceof VersionConflictError;
}

/** 409 yanıtı — istemci `code === 'VERSION_CONFLICT'` ile tanır. */
export function versionConflictResponse(error: VersionConflictError, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      success: false,
      error: VERSION_CONFLICT_MESSAGE,
      code: VERSION_CONFLICT_CODE,
      currentVersion: error.currentVersion,
      ...(error.conflicts.length > 0 ? { conflicts: error.conflicts } : {}),
      ...extra,
    },
    { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** 428 Precondition Required — `baseVersion` gönderilmemiş (ör. deploy öncesinden açık kalan sekme). */
export function baseVersionRequiredResponse() {
  return NextResponse.json(
    { success: false, error: BASE_VERSION_REQUIRED_MESSAGE, code: BASE_VERSION_REQUIRED_CODE },
    { status: 428, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

type RawExecutor = Pick<Prisma.TransactionClient, '$executeRaw'>;

/** Transaction süresince kaynağa özel advisory kilit (commit/rollback'te kendiliğinden bırakılır). */
export async function lockResource(tx: RawExecutor, resourceKey: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`versioned:${resourceKey}`}))`;
}

/**
 * Yeni `updatedAt`: kesinlikle öncekinden büyük olmalı; aynı milisaniyede iki yazma sürümü
 * değiştirmeden geçemesin.
 */
export function nextUpdatedAt(previous: Date | null | undefined, now: Date = new Date()): Date {
  if (previous instanceof Date && now.getTime() <= previous.getTime()) {
    return new Date(previous.getTime() + 1);
  }
  return now;
}

type SettingsTx = RawExecutor & Pick<Prisma.TransactionClient, 'settings'>;

export type VersionedSettingWrite = {
  key: string;
  /**
   * Yazılacak değer. Fonksiyon verilirse kilit altında okunan GÜNCEL değerle çağrılır
   * (ör. rol bazında kısmi birleştirme) — birleştirme asla bayat bir okumaya dayanmaz.
   */
  value: Prisma.InputJsonValue | ((previous: Prisma.JsonValue | null) => Prisma.InputJsonValue);
  category: string;
  /** İstemcinin üzerinde çalıştığı sürüm. */
  baseVersion: string;
};

export type VersionedSettingResult = {
  id: string;
  key: string;
  version: string;
  /** Yazmadan önceki değer (audit `oldData` için); satır yoksa null. */
  previous: Prisma.JsonValue | null;
  /** Yazılan değer. */
  value: Prisma.InputJsonValue;
  created: boolean;
};

/**
 * Tek `Settings` anahtarını sürüm kontrolüyle yazar. Bir `$transaction(async (tx) => …)`
 * içinde çağrılmalı; audit kaydı da aynı `tx` ile yazılmalı.
 * Uyuşmazlıkta `VersionConflictError` fırlatır (transaction geri alınır).
 */
export async function writeVersionedSetting(
  tx: SettingsTx,
  input: VersionedSettingWrite
): Promise<VersionedSettingResult> {
  await lockResource(tx, `settings:${input.key}`);
  const current = await tx.settings.findUnique({
    where: { key: input.key },
    select: { id: true, value: true, updatedAt: true },
  });
  const currentVersion = versionFromDate(current?.updatedAt);
  if (input.baseVersion !== currentVersion) {
    throw new VersionConflictError(currentVersion, [{ key: input.key, currentVersion }]);
  }
  const previous = current?.value ?? null;
  const value = typeof input.value === 'function' ? input.value(previous) : input.value;

  if (current) {
    const saved = await tx.settings.update({
      where: { key: input.key },
      data: { value, category: input.category, updatedAt: nextUpdatedAt(current.updatedAt) },
      select: { id: true, key: true, updatedAt: true },
    });
    return { id: saved.id, key: saved.key, version: versionFromDate(saved.updatedAt), previous, value, created: false };
  }

  const created = await tx.settings.create({
    data: { key: input.key, value, category: input.category },
    select: { id: true, key: true, updatedAt: true },
  });
  return { id: created.id, key: created.key, version: versionFromDate(created.updatedAt), previous: null, value, created: true };
}

export type VersionedBatchEntry = {
  key: string;
  value: Prisma.InputJsonValue;
  /** Yalnız satır YOKSA kullanılır (mevcut kategori korunur). */
  categoryOnCreate: string;
  /** Verilirse sürüm kontrolü yapılır; verilmezse (eski istemciler) koşulsuz yazılır. */
  baseVersion?: string | null;
};

export type VersionedBatchResult = {
  /** Yazmadan önceki değerler (yalnız var olan anahtarlar). */
  previous: Record<string, Prisma.JsonValue>;
  /** Yazma sonrası anahtar → sürüm. */
  versions: Record<string, string>;
  count: number;
};

/**
 * Çok anahtarlı `Settings` yazımı: tüm anahtarlar sıralı kilitlenir (kilitlenme/deadlock yok),
 * `baseVersion` verilen her anahtar kontrol edilir; herhangi biri uyuşmazsa HİÇBİRİ yazılmaz.
 */
export async function writeVersionedSettingsBatch(
  tx: SettingsTx,
  rawEntries: VersionedBatchEntry[]
): Promise<VersionedBatchResult> {
  // Aynı anahtar iki kez gelirse sonuncusu geçerli (eski upsert davranışıyla aynı).
  const entries = Array.from(new Map(rawEntries.map((e) => [e.key, e])).values());
  const keys = entries.map((e) => e.key).sort();
  for (const key of keys) {
    await lockResource(tx, `settings:${key}`);
  }
  const rows = await tx.settings.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const conflicts: VersionConflictDetail[] = [];
  for (const entry of entries) {
    if (entry.baseVersion == null) continue;
    const currentVersion = versionFromDate(byKey.get(entry.key)?.updatedAt);
    if (entry.baseVersion !== currentVersion) conflicts.push({ key: entry.key, currentVersion });
  }
  if (conflicts.length > 0) {
    throw new VersionConflictError(conflicts[0].currentVersion, conflicts);
  }

  const previous: Record<string, Prisma.JsonValue> = {};
  const versions: Record<string, string> = {};
  for (const entry of entries) {
    const row = byKey.get(entry.key);
    if (row) {
      previous[entry.key] = row.value;
      const saved = await tx.settings.update({
        where: { key: entry.key },
        data: { value: entry.value, updatedAt: nextUpdatedAt(row.updatedAt) },
        select: { key: true, value: true, updatedAt: true },
      });
      byKey.set(entry.key, saved);
      versions[entry.key] = versionFromDate(saved.updatedAt);
    } else {
      const created = await tx.settings.create({
        data: { key: entry.key, value: entry.value, category: entry.categoryOnCreate },
        select: { key: true, value: true, updatedAt: true },
      });
      byKey.set(entry.key, created);
      versions[entry.key] = versionFromDate(created.updatedAt);
    }
  }
  return { previous, versions, count: rawEntries.length };
}
