/**
 * Ayarlar merkezi UX koruması (genel denetim · admin-ayarlar):
 *  - Taslaklı bölümler kirli durumlarını merkeze bildirir; merkez bölüm değişiminde onay ister
 *    (önceden bölüm değiştirmek taslağı sessizce atıyordu; DirtyBar yalnız beforeunload yakalar).
 *  - "Varsayılana dön" kayıt defterinin varsayılanlarını kullanır (elle yazılmış ikinci kaynak yok).
 */
import fs from 'fs';
import path from 'path';
import { PLATFORM_SETTINGS, SETTINGS_KEYS } from '@/lib/platform-settings/registry';

const dir = path.join(process.cwd(), 'components/admin/a-ayarlar-kapi');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');

describe('ayarlar merkezi kaydedilmemiş değişiklik koruması', () => {
  it('taslaklı bölümler kirli durumunu bildirir', () => {
    expect(read('section-identity.tsx')).toMatch(/useReportDirty\('kimlik', dirty\)/);
    expect(read('section-maintenance.tsx')).toMatch(/useReportDirty\('bakim', dirty\)/);
  });
  it('merkez bölüm değişiminde onay ister ve sağlayıcıyı sarar', () => {
    const src = read('settings-center.tsx');
    expect(src).toMatch(/SettingsDirtyContext\.Provider/);
    expect(src).toMatch(/dirtySections\.current\.size > 0[\s\S]*window\.confirm/);
  });
});

describe('varsayılana dön', () => {
  it('kayıt defteri varsayılanları beklenen güvenli değerler', () => {
    expect(PLATFORM_SETTINGS[SETTINGS_KEYS.backgroundEffect].default).toBe('original');
    expect(PLATFORM_SETTINGS[SETTINGS_KEYS.registrationOpen].default).toBe(true);
    expect(PLATFORM_SETTINGS[SETTINGS_KEYS.googleAuth].default).toBe(true);
    expect(PLATFORM_SETTINGS[SETTINGS_KEYS.magicLink].default).toBe(false);
  });
  it('düğmeler varsayılanı kayıt defterinden okur', () => {
    expect(read('section-identity.tsx')).toMatch(/PLATFORM_SETTINGS\[SETTINGS_KEYS\.registrationOpen\]\.default/);
    expect(read('section-general.tsx')).toMatch(/PLATFORM_SETTINGS\[SETTINGS_KEYS\.backgroundEffect\]\.default/);
  });
});
