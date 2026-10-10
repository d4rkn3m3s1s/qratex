/**
 * Adresten il türetme — saf (jest).
 *
 * `User` modelinde yapılandırılmış şehir alanı yok (ŞEMA İSTEĞİ: `User.city`). Kıyas sayfasının
 * "Şehrim" akran grubu için il, serbest metin adresten TÜRETİLİR ve arayüzde kaynağıyla birlikte
 * gösterilir ("adresinizden"). Kural: normalize edilmiş adreste kelime sınırıyla geçen il
 * adlarından EN SONDA olanı seçilir (Türkçe adresler "… Kadıköy/İstanbul" biçiminde il ile
 * biter; "Ordu Caddesi … İstanbul" gibi sokak adları böylece ile ezilmez).
 */
import { normalizeText } from '@/lib/places/categories';

/** 81 il: anahtar (ASCII, küçük harf) → görünen ad. */
export const TR_PROVINCES: Readonly<Record<string, string>> = {
  adana: 'Adana', adiyaman: 'Adıyaman', afyonkarahisar: 'Afyonkarahisar', agri: 'Ağrı', aksaray: 'Aksaray',
  amasya: 'Amasya', ankara: 'Ankara', antalya: 'Antalya', ardahan: 'Ardahan', artvin: 'Artvin', aydin: 'Aydın',
  balikesir: 'Balıkesir', bartin: 'Bartın', batman: 'Batman', bayburt: 'Bayburt', bilecik: 'Bilecik',
  bingol: 'Bingöl', bitlis: 'Bitlis', bolu: 'Bolu', burdur: 'Burdur', bursa: 'Bursa', canakkale: 'Çanakkale',
  cankiri: 'Çankırı', corum: 'Çorum', denizli: 'Denizli', diyarbakir: 'Diyarbakır', duzce: 'Düzce',
  edirne: 'Edirne', elazig: 'Elazığ', erzincan: 'Erzincan', erzurum: 'Erzurum', eskisehir: 'Eskişehir',
  gaziantep: 'Gaziantep', giresun: 'Giresun', gumushane: 'Gümüşhane', hakkari: 'Hakkari', hatay: 'Hatay',
  igdir: 'Iğdır', isparta: 'Isparta', istanbul: 'İstanbul', izmir: 'İzmir', kahramanmaras: 'Kahramanmaraş',
  karabuk: 'Karabük', karaman: 'Karaman', kars: 'Kars', kastamonu: 'Kastamonu', kayseri: 'Kayseri',
  kilis: 'Kilis', kirikkale: 'Kırıkkale', kirklareli: 'Kırklareli', kirsehir: 'Kırşehir', kocaeli: 'Kocaeli',
  konya: 'Konya', kutahya: 'Kütahya', malatya: 'Malatya', manisa: 'Manisa', mardin: 'Mardin', mersin: 'Mersin',
  mugla: 'Muğla', mus: 'Muş', nevsehir: 'Nevşehir', nigde: 'Niğde', ordu: 'Ordu', osmaniye: 'Osmaniye',
  rize: 'Rize', sakarya: 'Sakarya', samsun: 'Samsun', sanliurfa: 'Şanlıurfa', siirt: 'Siirt', sinop: 'Sinop',
  sirnak: 'Şırnak', sivas: 'Sivas', tekirdag: 'Tekirdağ', tokat: 'Tokat', trabzon: 'Trabzon', tunceli: 'Tunceli',
  usak: 'Uşak', van: 'Van', yalova: 'Yalova', yozgat: 'Yozgat', zonguldak: 'Zonguldak',
};

/** Yaygın eş adlar → il anahtarı. */
const ALIASES: Readonly<Record<string, string>> = {
  afyon: 'afyonkarahisar',
  maras: 'kahramanmaras',
  urfa: 'sanliurfa',
  icel: 'mersin',
  antep: 'gaziantep',
  izmit: 'kocaeli',
  adapazari: 'sakarya',
};

const NAMES: ReadonlyArray<[needle: string, key: string]> = [
  ...Object.keys(TR_PROVINCES).map((k) => [k, k] as [string, string]),
  ...Object.entries(ALIASES),
];

/** Harf olmayan karakterleri boşluğa çevirip normalize eder ("Kadıköy/İSTANBUL" → "kadikoy istanbul"). */
function tokenize(raw: string): string {
  return ` ${normalizeText(raw).replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** Adresteki il anahtarı (bulunamazsa null). */
export function cityFromAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = tokenize(raw);
  let best: { key: string; at: number } | null = null;
  for (const [needle, key] of NAMES) {
    const at = text.lastIndexOf(` ${needle} `);
    if (at >= 0 && (!best || at > best.at)) best = { key, at };
  }
  return best?.key ?? null;
}

export function cityLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return TR_PROVINCES[key] ?? null;
}

export function isCityKey(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TR_PROVINCES, value);
}
