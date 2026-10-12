/** POST /api/admin/team/members: ham token/URL/e-posta yanıtta yok; hesap sayımı yapılamaz. */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'app/api/admin/team/members/route.ts'), 'utf8');
const post = src
  .slice(src.indexOf('export const POST'), src.indexOf('const updateBody'))
  .replace(/^\s*\/\/.*$/gm, ''); // yorumlar hariç

describe('ekip daveti uç sızıntı korkulukları', () => {
  it('yanıtta token / acceptUrl / hedef e-posta dönmez', () => {
    const okCall = post.slice(post.lastIndexOf('return ok('));
    expect(okCall).not.toMatch(/token|acceptUrl|target\.email|\.\.\.invitation/);
  });
  it('kayıtsız / rol / ekipte durumları için ayrı mesaj yok', () => {
    expect(post).not.toMatch(/kayıtlı kullanıcı yok|Bayi ve personel|zaten ekipte/i);
    expect(post).toMatch(/INVITE_UNAVAILABLE/);
  });
});
