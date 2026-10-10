import type { Tone } from '@/components/states/tone';

/**
 * Kullanıcı rolü görünüm sözlüğü (etiket + QDL tonu).
 *
 * P0-39 / P0-24: `roleIcons`/`roleColors`/`roleLabels` yalnız ADMIN/DEALER/CUSTOMER
 * içeriyordu; Prisma `Role` enum'unda STAFF da var. Tek bir STAFF kullanıcısı
 * listede göründüğünde `roleIcons[user.role]` → `undefined` → `<undefined />`
 * render hatası ile `/admin/users` tamamen çöküyordu.
 *
 * Kural: rol görünümü HER ZAMAN `resolveRoleKey` üzerinden okunur; şemaya yeni bir
 * rol eklenip burada unutulursa `UNKNOWN` görünümüne düşer (çökmez) ve
 * `__tests__/admin/users-role-meta.test.ts` şema ile sözlüğün eşleşmediğini yakalar.
 */
export const KNOWN_ROLES = ['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF'] as const;
export type KnownRole = (typeof KNOWN_ROLES)[number];
export type RoleKey = KnownRole | 'UNKNOWN';

/** Rol değiştirme menüsünde admin'in doğrudan atayabildiği roller (STAFF davetle gelir). */
export const ASSIGNABLE_ROLES = ['ADMIN', 'DEALER', 'CUSTOMER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<RoleKey, string>> = {
  ADMIN: 'Admin',
  DEALER: 'Bayi',
  CUSTOMER: 'Müşteri',
  STAFF: 'Personel',
  UNKNOWN: 'Bilinmeyen rol',
};

export const ROLE_TONES: Readonly<Record<RoleKey, Tone>> = {
  ADMIN: 'danger',
  DEALER: 'info',
  CUSTOMER: 'success',
  STAFF: 'brand',
  UNKNOWN: 'neutral',
};

const KNOWN_SET: ReadonlySet<string> = new Set(KNOWN_ROLES);

export function resolveRoleKey(role: unknown): RoleKey {
  if (typeof role !== 'string') return 'UNKNOWN';
  const upper = role.trim().toUpperCase();
  return KNOWN_SET.has(upper) ? (upper as KnownRole) : 'UNKNOWN';
}

export function roleLabel(role: unknown): string {
  const key = resolveRoleKey(role);
  if (key === 'UNKNOWN' && typeof role === 'string' && role.trim()) return role.trim();
  return ROLE_LABELS[key];
}

export function roleTone(role: unknown): Tone {
  return ROLE_TONES[resolveRoleKey(role)];
}

export function isAssignableRole(role: unknown): role is AssignableRole {
  return typeof role === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}
