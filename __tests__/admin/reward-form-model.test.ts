/**
 * Ödül formu modeli: R2'ye yüklenen görseller (mutlak https URL) görsel olarak
 * tanınmalı (eski `startsWith('/')` kontrolü bunları emoji metni gibi basıyordu)
 * ve formun ürettiği gövde sunucu şemasından (`createRewardSchema`) geçmeli.
 */
import {
  initialRewardForm,
  isImageIcon,
  rewardToFormValues,
  toRewardPayload,
  validateRewardPayload,
} from '@/app/admin/rewards/reward-form-model';

describe('reward-form-model', () => {
  it('isImageIcon: R2 URL’si, kök-göreli yol → görsel; emoji ve tehlikeli şema → değil', () => {
    expect(isImageIcon('https://pub.r2.dev/assets/rewards/x.svg')).toBe(true);
    expect(isImageIcon('/images/badges/x.svg')).toBe(true);
    expect(isImageIcon('🎁')).toBe(false);
    expect(isImageIcon('//evil.com/x.png')).toBe(false);
    expect(isImageIcon('javascript:alert(1)')).toBe(false);
    expect(isImageIcon(undefined)).toBe(false);
  });

  it('varsayılan form gövdesi şemadan geçer; sınırsız stok (-1) kabul edilir', () => {
    const p = toRewardPayload({ ...initialRewardForm, name: 'Kahve', description: 'Bir fincan kahve', stock: '-1' });
    expect(p.stock).toBe(-1);
    expect(validateRewardPayload(p)).toBeNull();
  });

  it('boş açıklama ve sıfır maliyet istemcide yakalanır', () => {
    expect(validateRewardPayload(toRewardPayload({ ...initialRewardForm, name: 'X', description: '' }))).toBe('Açıklama gerekli');
    expect(
      validateRewardPayload(toRewardPayload({ ...initialRewardForm, name: 'X', description: 'Y', cost: '0' }))
    ).toBe('Maliyet pozitif olmalı');
  });

  it('düzenleme formu mevcut kaydı doğru doldurur', () => {
    const v = rewardToFormValues({
      name: 'Kupon',
      description: '%10',
      icon: 'https://pub.r2.dev/a.png',
      cost: 300,
      stock: -1,
      type: 'coupon',
      isActive: false,
    });
    expect(v).toMatchObject({ cost: '300', stock: '-1', type: 'coupon', isActive: false, icon: 'https://pub.r2.dev/a.png' });
    expect(rewardToFormValues({ name: 'a', description: 'b', stock: 1, type: 'bilinmeyen', isActive: true }).type).toBe('digital');
  });
});
