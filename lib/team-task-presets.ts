/**
 * Hazır görev şablonu kataloğu (statik, client-safe — prisma yok).
 *
 * Yönetici, sık kullanılan görevleri kendi şablonunu yazmadan tek tıkla
 * oluşturabilsin diye hazır bir preset koleksiyonu. Her preset, ekip görev
 * oluşturma alanlarıyla (title/description/priority/tags/estimateMin/checklist)
 * bire bir eşleşir; UI bu preseti önce TaskTemplate'e (POST) çevirip ardından
 * şablondan görev üretir (PUT), böylece checklist iskeleti de gelir.
 */

export type TeamTaskPresetCategory = 'urun' | 'operasyon' | 'pazarlama' | 'destek' | 'ekip';

export type TeamTaskPreset = {
  /** Benzersiz anahtar (stabil id). */
  key: string;
  /** Galeri kartında görünen ad. */
  name: string;
  /** Emoji (görsel ipucu). */
  emoji: string;
  /** Üretilecek görevin başlığı. */
  title: string;
  /** Görev açıklaması. */
  description: string;
  /** Öncelik. */
  priority: 'low' | 'medium' | 'high';
  /** Virgülle ayrık etiketler. */
  tags: string;
  /** Tahmini süre (dakika). */
  estimateMin: number;
  /** Alt görev satırları (checklist). */
  checklist: string[];
  /** Görsel gruplama. */
  category: TeamTaskPresetCategory;
};

/** Kategori görsel meta (başlık + renk sınıfları). */
export const PRESET_CATEGORY_META: Record<
  TeamTaskPresetCategory,
  { label: string; badgeClass: string; ringClass: string }
> = {
  urun: {
    label: 'Ürün',
    badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
    ringClass: 'group-hover:ring-violet-400/50',
  },
  operasyon: {
    label: 'Operasyon',
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
    ringClass: 'group-hover:ring-sky-400/50',
  },
  pazarlama: {
    label: 'Pazarlama',
    badgeClass: 'bg-pink-500/15 text-pink-600 dark:text-pink-300',
    ringClass: 'group-hover:ring-pink-400/50',
  },
  destek: {
    label: 'Destek',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    ringClass: 'group-hover:ring-amber-400/50',
  },
  ekip: {
    label: 'Ekip',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    ringClass: 'group-hover:ring-emerald-400/50',
  },
};

/** Hazır şablon kataloğu. */
export const TEAM_TASK_PRESETS: TeamTaskPreset[] = [
  {
    key: 'feature-launch',
    name: 'Yeni Özellik Lansmanı',
    emoji: '🚀',
    title: 'Yeni özellik: {ÖZELLİK} lansmanı',
    description:
      'Yeni bir özelliğin fikirden yayına kadar tüm adımlarını kapsar: tasarım, geliştirme, test ve dağıtım.',
    priority: 'high',
    tags: 'ürün,lansman',
    estimateMin: 960,
    checklist: [
      'Gereksinimleri ve kapsamı netleştir',
      'Tasarım / prototip hazırla',
      'Geliştirmeyi tamamla',
      'Kod incelemesi yaptır',
      'Test senaryolarını çalıştır (QA)',
      'Dokümantasyonu güncelle',
      'Yayına al (deploy)',
      'Lansman sonrası metrikleri izle',
    ],
    category: 'urun',
  },
  {
    key: 'bug-fix',
    name: 'Hata Düzeltme',
    emoji: '🐛',
    title: 'Hata düzeltme: {ÖZET}',
    description:
      'Bildirilen bir hatanın tekrar üretilmesi, kök nedeninin bulunması ve kalıcı olarak giderilmesi.',
    priority: 'high',
    tags: 'hata,acil',
    estimateMin: 180,
    checklist: [
      'Hatayı tekrar üret (repro adımları)',
      'Kök nedeni tespit et',
      'Düzeltmeyi uygula',
      'Regresyon testi ekle',
      'Etkilenen alanları doğrula',
      'Yayına al ve kapanışı bildir',
    ],
    category: 'urun',
  },
  {
    key: 'code-review',
    name: 'Kod İncelemesi',
    emoji: '🔍',
    title: 'Kod incelemesi: {PR / MODÜL}',
    description: 'Bir pull request veya modülün kalite, güvenlik ve standart açısından incelenmesi.',
    priority: 'medium',
    tags: 'kod,inceleme',
    estimateMin: 60,
    checklist: [
      'Değişiklikleri gözden geçir',
      'Kodlama standartlarına uygunluğu kontrol et',
      'Güvenlik ve performans açısından değerlendir',
      'Test kapsamını doğrula',
      'Geri bildirim / onay ver',
    ],
    category: 'urun',
  },
  {
    key: 'weekly-report',
    name: 'Haftalık Rapor Hazırla',
    emoji: '📊',
    title: 'Haftalık rapor — {HAFTA}',
    description: 'Haftanın performans metriklerini toplayıp özet bir rapor haline getir.',
    priority: 'medium',
    tags: 'rapor,haftalık',
    estimateMin: 90,
    checklist: [
      'Verileri topla ve doğrula',
      'Ana metrikleri (KPI) çıkar',
      'Öne çıkanları ve riskleri özetle',
      'Grafik / görselleri hazırla',
      'Paydaşlarla paylaş',
    ],
    category: 'operasyon',
  },
  {
    key: 'meeting-notes',
    name: 'Toplantı Notları',
    emoji: '📝',
    title: 'Toplantı notları — {KONU}',
    description: 'Toplantı gündemi, alınan kararlar ve aksiyon maddelerinin kayıt altına alınması.',
    priority: 'low',
    tags: 'toplantı,not',
    estimateMin: 45,
    checklist: [
      'Gündemi hazırla',
      'Kararları not al',
      'Aksiyon maddelerini ve sorumluları belirle',
      'Notları ekibe dağıt',
      'Takip görevlerini oluştur',
    ],
    category: 'operasyon',
  },
  {
    key: 'customer-feedback',
    name: 'Müşteri Geri Bildirimi İncele',
    emoji: '💬',
    title: 'Müşteri geri bildirimi incelemesi',
    description: 'Gelen müşteri geri bildirimlerini toparla, sınıflandır ve aksiyona dönüştür.',
    priority: 'medium',
    tags: 'müşteri,geri bildirim',
    estimateMin: 120,
    checklist: [
      'Geri bildirimleri topla',
      'Temalara göre sınıflandır',
      'Öncelik ve etkiyi değerlendir',
      'Aksiyon önerileri çıkar',
      'İlgili ekiplere ilet',
    ],
    category: 'destek',
  },
  {
    key: 'support-ticket',
    name: 'Destek Talebi Çöz',
    emoji: '🎧',
    title: 'Destek talebi: {TALEP}',
    description: 'Bir müşteri destek talebinin uçtan uca çözülmesi ve kapatılması.',
    priority: 'high',
    tags: 'destek,müşteri',
    estimateMin: 60,
    checklist: [
      'Talebi ve bağlamı anla',
      'Sorunu tekrar üret / doğrula',
      'Çözümü uygula veya yönlendir',
      'Müşteriye geri dönüş yap',
      'Talebi kapat ve kayıt tut',
    ],
    category: 'destek',
  },
  {
    key: 'social-content',
    name: 'Sosyal Medya İçeriği',
    emoji: '📱',
    title: 'Sosyal medya içeriği — {KAMPANYA}',
    description: 'Bir sosyal medya gönderisinin fikirden yayına kadar hazırlanması.',
    priority: 'medium',
    tags: 'pazarlama,sosyal medya',
    estimateMin: 90,
    checklist: [
      'İçerik fikrini ve mesajı belirle',
      'Metni (copy) yaz',
      'Görsel / videoyu hazırla',
      'İçeriği onaya sun',
      'Yayın planına ekle ve paylaş',
    ],
    category: 'pazarlama',
  },
  {
    key: 'campaign-launch',
    name: 'Pazarlama Kampanyası',
    emoji: '📣',
    title: 'Pazarlama kampanyası: {KAMPANYA}',
    description: 'Bir pazarlama kampanyasının planlanması, yürütülmesi ve ölçümlenmesi.',
    priority: 'high',
    tags: 'pazarlama,kampanya',
    estimateMin: 480,
    checklist: [
      'Hedef ve kitleyi tanımla',
      'Mesaj ve kanalları belirle',
      'İçerik ve varlıkları hazırla',
      'Kampanyayı yayına al',
      'Sonuçları ölç ve raporla',
    ],
    category: 'pazarlama',
  },
  {
    key: 'onboarding',
    name: 'Yeni Üye Onboarding',
    emoji: '🤝',
    title: 'Onboarding: {İSİM}',
    description: 'Yeni bir ekip üyesinin ilk gün ve ilk hafta uyum sürecinin planlanması.',
    priority: 'medium',
    tags: 'ekip,onboarding',
    estimateMin: 240,
    checklist: [
      'Hesap ve erişimleri hazırla',
      'Ekiple tanıştır',
      'Araç ve süreçleri anlat',
      'İlk görevleri ata',
      'İlk hafta geri bildirim görüşmesi planla',
    ],
    category: 'ekip',
  },
  {
    key: 'retro',
    name: 'Sprint Retrospektifi',
    emoji: '🔁',
    title: 'Retrospektif — {SPRINT}',
    description: 'Geçen dönemin değerlendirilmesi: iyi giden, gelişmesi gereken ve aksiyonlar.',
    priority: 'low',
    tags: 'ekip,retrospektif',
    estimateMin: 60,
    checklist: [
      'İyi giden noktaları topla',
      'Gelişmeye açık alanları belirle',
      'Aksiyon maddelerini çıkar',
      'Sorumluları ata',
      'Bir sonraki döneme aktar',
    ],
    category: 'ekip',
  },
  {
    key: 'research',
    name: 'Araştırma & Analiz',
    emoji: '🧪',
    title: 'Araştırma: {KONU}',
    description: 'Bir konu, rakip veya fırsatın araştırılıp bulguların özetlenmesi.',
    priority: 'medium',
    tags: 'araştırma,analiz',
    estimateMin: 180,
    checklist: [
      'Araştırma sorusunu netleştir',
      'Kaynakları / verileri topla',
      'Bulguları analiz et',
      'Öneri ve sonuçları özetle',
      'Ekiple paylaş',
    ],
    category: 'operasyon',
  },
];
