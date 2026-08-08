/**
 * Rozet renk yardımcıları — sanitizeHexColor GÜVENLİK katmanı: bu değerler doğrudan
 * inline style'a girer, geçersiz/kötü niyetli string CSS injection yüzeyi olur. Yalnız
 * geçerli hex geçmeli. hexToRgba/badgeColorStyle de buna dayanır.
 */
import { sanitizeHexColor, hexToRgba, badgeColorStyle } from '@/lib/badge-colors';

describe('sanitizeHexColor', () => {
  it('geçerli hex biçimlerini kabul eder', () => {
    expect(sanitizeHexColor('#fff')).toBe('#fff');
    expect(sanitizeHexColor('#9333ea')).toBe('#9333ea');
    expect(sanitizeHexColor('#9333EAff')).toBe('#9333EAff'); // 8-hane (alpha)
    expect(sanitizeHexColor('  #abc  ')).toBe('#abc'); // trim
  });

  it('geçersiz/kötü niyetli girdileri reddeder (null)', () => {
    expect(sanitizeHexColor('red')).toBeNull();
    expect(sanitizeHexColor('#12')).toBeNull();
    expect(sanitizeHexColor('#xyz123')).toBeNull();
    expect(sanitizeHexColor('rgb(1,2,3)')).toBeNull();
    expect(sanitizeHexColor('#fff; background:url(x)')).toBeNull(); // injection denemesi
    expect(sanitizeHexColor('')).toBeNull();
    expect(sanitizeHexColor(null)).toBeNull();
    expect(sanitizeHexColor(123)).toBeNull();
  });
});

describe('hexToRgba', () => {
  it('6-hane hex → doğru rgba', () => {
    expect(hexToRgba('#9333ea', 0.5)).toBe('rgba(147, 51, 234, 0.5)');
  });
  it('3-hane hex genişletilir', () => {
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });
  it('geçersiz hex → şeffaf siyah (güvenli)', () => {
    expect(hexToRgba('red', 0.3)).toBe('rgba(0,0,0,0.3)');
  });
});

describe('badgeColorStyle', () => {
  it('color yoksa null (rarity varsayılanına düşülür)', () => {
    expect(badgeColorStyle(null, null)).toBeNull();
    expect(badgeColorStyle('', '#fff')).toBeNull();
    expect(badgeColorStyle('geçersiz', '#fff')).toBeNull();
  });

  it('geçerli color → stil objesi (background/border/shadow/color)', () => {
    const s = badgeColorStyle('#9333ea', '#c026d3');
    expect(s).not.toBeNull();
    expect(s!.color).toBe('#9333ea');
    expect(s!.background).toContain('linear-gradient');
    expect(s!.borderColor).toContain('rgba(147, 51, 234');
    expect(s!.boxShadow).toContain('rgba(147, 51, 234');
  });

  it('bgColor yoksa color kendisi zemin olur', () => {
    const s = badgeColorStyle('#9333ea', null);
    expect(s).not.toBeNull();
    expect(s!.background).toContain('rgba(147, 51, 234'); // hem accent hem zemin aynı
  });

  it('geçersiz bgColor → color\'a düşer (güvenli)', () => {
    const s = badgeColorStyle('#9333ea', 'kötü;değer');
    expect(s).not.toBeNull();
    expect(s!.background).toContain('rgba(147, 51, 234');
  });
});
