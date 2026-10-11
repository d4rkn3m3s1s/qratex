/**
 * Zihin Hırsızı kart metinleri (kozmetik). Tür (bozuk/gerçek) oyunda AÇIKÇA gösterilir (renk +
 * ikon + desen); metin yalnız atmosfer. Sayılar `sim.ts` → `*_TEXT_COUNT` ile eşit olmalı.
 * Örnekler karikatür değil, gerçek hayattaki manipülatif / samimi yorum kalıplarından.
 */
import { CORRUPTED_TEXT_COUNT, GENUINE_TEXT_COUNT } from './sim';

export const CORRUPTED_TEXTS: readonly string[] = [
  'BU İŞLETME DOLANDIRICI!!! Kaçın',
  'Hepsi satın alınmış yorum',
  'Asla gitmeyin, berbat berbat',
  '1 yıldız bile fazla, rezalet',
  'Bot yorumlarla şişirilmiş yer',
  'Herkese söylüyorum: uzak durun',
  'Para tuzağı, sakın inanmayın',
  'Rakip mekân çok daha iyi (link)',
  'Hiç gitmedim ama berbat olmalı',
  'Bu yorumu 50 kez paylaşın!!!',
  'Sahibi dolandırıcı, kesin bilgi',
  'Mükemmel!!! Mükemmel!!! Mükemmel',
];

export const GENUINE_TEXTS: readonly string[] = [
  'Servis güler yüzlüydü, teşekkürler',
  'Lezzetliydi, tekrar geleceğim',
  'Temiz ve ferah bir mekân',
  'Fiyat/performans gayet iyi',
  'Personel çok ilgiliydi',
  'Tatlılar biraz şekerliydi ama güzel',
  'Ambiyans hoş, müzik yüksekti',
  'Hızlı ve özenli hizmet',
  'Kahvesi çok iyiydi, öneririm',
  'Bekleme uzundu, yemek güzeldi',
  'Çocuklu aileler için uygun',
  'Porsiyonlar doyurucu',
];

if (CORRUPTED_TEXTS.length !== CORRUPTED_TEXT_COUNT || GENUINE_TEXTS.length !== GENUINE_TEXT_COUNT) {
  throw new Error('mind-thief texts: metin sayısı sim sabitleriyle uyuşmuyor');
}

export const POWER_LABEL = {
  freeze: 'Kartları Dondur',
  double: 'Çift Puan',
  heart: '+1 Can',
} as const;
