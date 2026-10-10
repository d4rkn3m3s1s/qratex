/**
 * P0-39 / P0-24: tek bir STAFF kullanıcısı `/admin/users`'ı çökertiyordu
 * (`roleIcons[user.role]` → undefined → `<undefined />`).
 * Bu test şemadaki her rolün görünüm sözlüğünde karşılığı olduğunu ve bilinmeyen
 * rolün çökmeden güvenli görünüme düştüğünü doğrular.
 */
import fs from 'fs';
import path from 'path';
import {
  ASSIGNABLE_ROLES,
  KNOWN_ROLES,
  ROLE_LABELS,
  ROLE_TONES,
  isAssignableRole,
  resolveRoleKey,
  roleLabel,
  roleTone,
} from '@/app/admin/users/role-meta';

function prismaRoles(): string[] {
  const schema = fs.readFileSync(path.resolve(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const m = schema.match(/enum Role \{([\s\S]*?)\}/);
  if (!m) throw new Error('schema.prisma içinde enum Role bulunamadı');
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

describe('admin/users rol görünüm sözlüğü', () => {
  it('Prisma Role enum’undaki her rol sözlükte tanımlı (STAFF dahil)', () => {
    const roles = prismaRoles();
    expect(roles).toContain('STAFF');
    for (const r of roles) {
      expect(KNOWN_ROLES).toContain(r);
      expect(resolveRoleKey(r)).toBe(r);
      expect(ROLE_LABELS[resolveRoleKey(r)]).toBeTruthy();
      expect(ROLE_TONES[resolveRoleKey(r)]).toBeTruthy();
    }
  });

  it('STAFF kullanıcısı Türkçe etiket ve ton alır (eskiden undefined → çökme)', () => {
    expect(roleLabel('STAFF')).toBe('Personel');
    expect(roleTone('STAFF')).toBe('brand');
  });

  it('bilinmeyen/bozuk rol çökmez, güvenli görünüme düşer', () => {
    expect(resolveRoleKey('SUPERUSER')).toBe('UNKNOWN');
    expect(resolveRoleKey(undefined)).toBe('UNKNOWN');
    expect(resolveRoleKey(null)).toBe('UNKNOWN');
    expect(resolveRoleKey(42)).toBe('UNKNOWN');
    expect(roleLabel('SUPERUSER')).toBe('SUPERUSER');
    expect(roleLabel(undefined)).toBe('Bilinmeyen rol');
    expect(roleTone('SUPERUSER')).toBe('neutral');
  });

  it('büyük/küçük harf ve boşluk duyarsız', () => {
    expect(resolveRoleKey(' staff ')).toBe('STAFF');
    expect(resolveRoleKey('admin')).toBe('ADMIN');
  });

  it('rol değiştirme menüsü STAFF atamaz (STAFF davetle gelir)', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['ADMIN', 'DEALER', 'CUSTOMER']);
    expect(isAssignableRole('STAFF')).toBe(false);
    expect(isAssignableRole('DEALER')).toBe(true);
  });

  it('users-client doğrudan `map[user.role]` indekslemesi yapmıyor', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'app', 'admin', 'users', 'users-client.tsx'), 'utf8');
    expect(src).not.toMatch(/\[\s*(user|selectedUser|u)\.role\s*\]/);
    expect(src).not.toMatch(/\broleIcons\b|\broleColors\b|\broleLabels\b/);
  });
});
