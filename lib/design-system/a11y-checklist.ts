/**
 * Tasarım Sistemi → Erişilebilirlik: WCAG 2.2 AA el ile doğrulama listesi (saf; DB yok).
 *
 * Eski sayfa "kontrol listesi" başlığıyla dört cümlelik ipucu gösteriyordu (SAHTE). Bu liste
 * gerçek başarı kriterlerine bağlı, durumlu (geçti / kaldı / kapsam dışı / denetlenmedi), notlu
 * ve denetimlidir. Otomatik denetlenen kriterler (kontrast sözleşmesi Jest + canlı tablo) ayrıca
 * işaretlenir; burada yalnız el ile doğrulanması gerekenler tutulur.
 */
import { z } from 'zod';

export type WcagPrinciple = 'perceivable' | 'operable' | 'understandable' | 'robust';

/** W3C Türkçe yetkili çevirisindeki ilke adları. */
export const PRINCIPLE_LABEL: Record<WcagPrinciple, string> = {
  perceivable: 'Algılanabilir',
  operable: 'İşletilebilir',
  understandable: 'Anlaşılabilir',
  robust: 'Sağlam',
};

export const PRINCIPLE_HINT: Record<WcagPrinciple, string> = {
  perceivable: 'Bilgi ve arayüz bileşenleri herkesin algılayabileceği biçimde sunulur: metin alternatifi, kontrast, yeniden boyutlanabilirlik.',
  operable: 'Arayüz klavyeyle ve dokunarak kullanılabilir; yeterli süre, nöbet riski taşımayan hareket, görünür odak.',
  understandable: 'İçerik ve işleyiş öngörülebilir; hatalar açıklanır ve düzeltilmesine yardım edilir.',
  robust: 'İçerik yardımcı teknolojilerle (ekran okuyucu vb.) güvenilir biçimde yorumlanır: doğru ad, rol ve değer.',
};

export type ChecklistItem = {
  id: string;
  sc: string;
  title: string;
  level: 'A' | 'AA';
  principle: WcagPrinciple;
  /** Qratex'te neye bakılır (somut test yönergesi). */
  howTo: string;
};

export const A11Y_CHECKLIST: readonly ChecklistItem[] = [
  { id: '1.1.1', sc: '1.1.1', title: 'Metin olmayan içerik', level: 'A', principle: 'perceivable', howTo: 'Rozet küresi, maskot, 3B sahneler ve ikon butonlarının erişilebilir adı/alternatif metni var.' },
  { id: '1.3.1', sc: '1.3.1', title: 'Bilgi ve ilişkiler', level: 'A', principle: 'perceivable', howTo: 'Tek h1, sıralı başlıklar (h1→h2→h3), tablolarda th/scope, form alanlarında bağlı label.' },
  { id: '1.4.3', sc: '1.4.3', title: 'Kontrast (en az)', level: 'AA', principle: 'perceivable', howTo: 'Kontrast sözleşmesi tüm temalarda geçer; özel tema yayınlanırken kontrast raporu temiz.' },
  { id: '1.4.4', sc: '1.4.4', title: 'Metni yeniden boyutlandırma', level: 'AA', principle: 'perceivable', howTo: 'Yazı boyutu “Çok büyük” ayarında ve %200 yakınlaştırmada içerik kesilmez.' },
  { id: '1.4.10', sc: '1.4.10', title: 'Yeniden akış', level: 'AA', principle: 'perceivable', howTo: '320px genişlikte yatay kaydırma yok (tablolar kendi kapsayıcısında kayar).' },
  { id: '1.4.11', sc: '1.4.11', title: 'Metin dışı kontrast', level: 'AA', principle: 'perceivable', howTo: 'Kenarlık, odak halkası, grafik serileri ve form kontrolleri zeminle ≥ 3:1.' },
  { id: '2.1.1', sc: '2.1.1', title: 'Klavye', level: 'A', principle: 'operable', howTo: 'Kart seçimi, sekmeler, menüler, oyunlar ve diyaloglar yalnız klavyeyle kullanılabilir.' },
  { id: '2.1.2', sc: '2.1.2', title: 'Klavye tuzağı yok', level: 'A', principle: 'operable', howTo: 'Diyalog/alt sayfa Esc ile kapanır; 3B tuvaller odağı hapsetmez.' },
  { id: '2.2.2', sc: '2.2.2', title: 'Duraklat, durdur, gizle', level: 'A', principle: 'operable', howTo: 'Sonsuz animasyonlar yalnız <Ambient> içinde; azaltılmış harekette statik kare.' },
  { id: '2.3.3', sc: '2.3.3', title: 'Etkileşimden doğan animasyon', level: 'A', principle: 'operable', howTo: '“Animasyonları azalt” ve işletim sistemi tercihi kutlama/konfeti/kutu açılışını sadeleştirir.' },
  { id: '2.4.3', sc: '2.4.3', title: 'Odak sırası', level: 'A', principle: 'operable', howTo: 'Sekme sırası görsel sırayla aynı; diyalog kapanınca odak tetikleyiciye döner.' },
  { id: '2.4.7', sc: '2.4.7', title: 'Odak görünür', level: 'AA', principle: 'operable', howTo: 'Tüm etkileşimli öğelerde görünür odak halkası (focus-visible).' },
  { id: '2.4.11', sc: '2.4.11', title: 'Odak gizlenmez (en az)', level: 'AA', principle: 'operable', howTo: 'Yapışkan alt sekme çubuğu ve çerez bandı odaklanan öğeyi örtmez.' },
  { id: '2.5.7', sc: '2.5.7', title: 'Sürükleme hareketleri', level: 'AA', principle: 'operable', howTo: 'Kanban ve sıralama gibi sürükleme işlemlerinin tek dokunuşlu alternatifi var.' },
  { id: '2.5.8', sc: '2.5.8', title: 'Hedef boyutu (en az)', level: 'AA', principle: 'operable', howTo: 'Dokunma hedefleri ≥ 24px (Qratex kuralı: mobilde ≥ 44px).' },
  { id: '3.1.1', sc: '3.1.1', title: 'Sayfanın dili', level: 'A', principle: 'understandable', howTo: '<html lang> arayüz diliyle eşleşir (TR/EN).' },
  { id: '3.2.2', sc: '3.2.2', title: 'Girdi sırasında', level: 'A', principle: 'understandable', howTo: 'Seçim değiştirmek kendiliğinden yayın/gezinme başlatmaz (ör. tema yalnız “Yayınla” ile değişir).' },
  { id: '3.3.1', sc: '3.3.1', title: 'Hata tanımlama', level: 'A', principle: 'understandable', howTo: 'Form hataları alanın yanında metinle verilir ve aria-describedby ile bağlıdır.' },
  { id: '3.3.8', sc: '3.3.8', title: 'Erişilebilir kimlik doğrulama (en az)', level: 'AA', principle: 'understandable', howTo: 'Giriş ve doğrulama adımlarında bilişsel test yok; yapıştırma ve parola yöneticisi çalışır.' },
  { id: '4.1.2', sc: '4.1.2', title: 'Ad, rol, değer', level: 'A', principle: 'robust', howTo: 'Özel bileşenler (radyo kartları, anahtarlar, sekmeler) doğru role ve aria-checked/selected durumuna sahip.' },
  { id: '4.1.3', sc: '4.1.3', title: 'Durum mesajları', level: 'AA', principle: 'robust', howTo: 'Kaydedildi/hata bildirimleri ve yükleme durumları role="status"/aria-live ile duyurulur.' },
];

export const CHECK_STATUSES = ['untested', 'pass', 'fail', 'na'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  untested: 'Denetlenmedi',
  pass: 'Geçti',
  fail: 'Kaldı',
  na: 'Kapsam dışı',
};

export type ChecklistEntry = { status: CheckStatus; note: string | null; by: string | null; at: string | null };
export type ChecklistState = Record<string, ChecklistEntry>;

export const A11Y_CHECKLIST_SETTINGS_KEY = 'a11y_checklist_v1';

export const PatchChecklistBody = z
  .object({
    id: z.string().refine((v) => A11Y_CHECKLIST.some((i) => i.id === v), { message: 'Bilinmeyen kriter.' }),
    status: z.enum(CHECK_STATUSES),
    note: z.string().trim().max(500).optional(),
    baseVersion: z.string().max(64).nullable(),
  })
  .strict()
  .refine((v) => v.status !== 'fail' || (v.note && v.note.length >= 5), {
    message: '“Kaldı” için en az 5 karakterlik not yazın (nerede, ne bozuk).',
    path: ['note'],
  });
export type PatchChecklistInput = z.infer<typeof PatchChecklistBody>;

/** Saklı JSON'u hoşgörülü okur; bilinmeyen kriterler atılır. */
export function readChecklistState(raw: unknown): ChecklistState {
  const out: ChecklistState = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const item of A11Y_CHECKLIST) {
    const e = r[item.id];
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const status = (CHECK_STATUSES as readonly string[]).includes(o.status as string) ? (o.status as CheckStatus) : 'untested';
    out[item.id] = {
      status,
      note: typeof o.note === 'string' && o.note ? o.note : null,
      by: typeof o.by === 'string' ? o.by : null,
      at: typeof o.at === 'string' ? o.at : null,
    };
  }
  return out;
}

export type ChecklistProgress = { total: number; pass: number; fail: number; na: number; untested: number; percent: number };

/** Tamamlanma: (geçti + kapsam dışı) / toplam. */
export function checklistProgress(state: ChecklistState): ChecklistProgress {
  const counts = { pass: 0, fail: 0, na: 0, untested: 0 };
  for (const item of A11Y_CHECKLIST) counts[state[item.id]?.status ?? 'untested'] += 1;
  const total = A11Y_CHECKLIST.length;
  return { total, ...counts, percent: total ? Math.round(((counts.pass + counts.na) / total) * 100) : 0 };
}
