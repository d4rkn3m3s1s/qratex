/**
 * Hazır anket şablonları (saf içerik). Şablon yalnız oluşturucuyu ÖNCEDEN DOLDURUR; bayi her
 * soruyu düzenleyebilir. Tüm şablonlar ortak sözleşmeyi (lib/survey-schema.ts) geçer — Jest ile
 * doğrulanır.
 */
import type { SurveyQuestionType } from '@/lib/survey-schema';

export type TemplateQuestion = { type: SurveyQuestionType; text: string; options?: string[]; required: boolean };
export type SurveyTemplate = {
  key: string;
  title: string;
  description: string;
  /** Kartta gösterilen kısa amaç. */
  pitch: string;
  questions: TemplateQuestion[];
};

const TR: SurveyTemplate[] = [
  {
    key: 'csat',
    title: 'Ziyaret memnuniyeti',
    description: 'Bugünkü ziyaretiniz hakkında üç kısa soru. Yanıtlarınız hizmetimizi iyileştirmemize yardım eder.',
    pitch: 'Puan + tavsiye + tek açık soru. En hızlı başlangıç.',
    questions: [
      { type: 'rating', text: 'Bugünkü deneyiminizi nasıl puanlarsınız?', required: true },
      { type: 'single_choice', text: 'Bizi bir arkadaşınıza önerir misiniz?', options: ['Kesinlikle evet', 'Muhtemelen', 'Emin değilim', 'Hayır'], required: true },
      { type: 'open_text', text: 'Neyi daha iyi yapabiliriz?', required: false },
    ],
  },
  {
    key: 'menu',
    title: 'Menü geri bildirimi',
    description: 'Menümüzü sizin için geliştiriyoruz. Görüşleriniz bizim için değerli.',
    pitch: 'Lezzet, porsiyon ve menüde görmek istenenler.',
    questions: [
      { type: 'rating', text: 'Yemeklerin lezzetini nasıl buldunuz?', required: true },
      { type: 'single_choice', text: 'Porsiyonlar nasıldı?', options: ['Az', 'Tam yerinde', 'Fazla'], required: true },
      { type: 'multiple_choice', text: 'En çok neyi beğendiniz?', options: ['Lezzet', 'Sunum', 'Fiyat/performans', 'Çeşitlilik', 'Sağlıklı seçenekler'], required: false },
      { type: 'open_text', text: 'Menüde görmek istediğiniz bir ürün var mı?', required: false },
    ],
  },
  {
    key: 'service',
    title: 'Hizmet ve hız',
    description: 'Siparişinizin hızı ve ekibimizin ilgisi hakkında kısa bir anket.',
    pitch: 'Bekleme süresi ve personel ilgisini ölçer.',
    questions: [
      { type: 'rating', text: 'Ekibimizin ilgisini nasıl buldunuz?', required: true },
      { type: 'single_choice', text: 'Siparişiniz ne kadar sürede geldi?', options: ['10 dakikadan az', '10–20 dakika', '20 dakikadan fazla'], required: true },
      { type: 'rating', text: 'Hızımızdan ne kadar memnun kaldınız?', required: true },
      { type: 'open_text', text: 'Hizmetimizle ilgili eklemek istediğiniz bir şey var mı?', required: false },
    ],
  },
  {
    key: 'new_product',
    title: 'Yeni ürün tadımı',
    description: 'Yeni ürünümüz hakkındaki görüşünüzü merak ediyoruz.',
    pitch: 'Lezzet, fiyat algısı ve tekrar alma niyeti.',
    questions: [
      { type: 'rating', text: 'Yeni ürünümüzün tadını nasıl buldunuz?', required: true },
      { type: 'single_choice', text: 'Fiyatını nasıl buldunuz?', options: ['Uygun', 'Biraz yüksek', 'Çok yüksek'], required: true },
      { type: 'single_choice', text: 'Tekrar sipariş eder misiniz?', options: ['Evet', 'Belki', 'Hayır'], required: true },
      { type: 'open_text', text: 'Ürünü nasıl daha iyi yapabiliriz?', required: false },
    ],
  },
  {
    key: 'ambience',
    title: 'Ortam ve temizlik',
    description: 'Mekânımızda kendinizi rahat hissetmeniz bizim için önemli.',
    pitch: 'Temizlik, atmosfer ve iyileştirme önceliği.',
    questions: [
      { type: 'rating', text: 'Mekânın temizliğini nasıl puanlarsınız?', required: true },
      { type: 'rating', text: 'Ortamın atmosferini nasıl buldunuz?', required: true },
      { type: 'multiple_choice', text: 'Neyi iyileştirmemizi istersiniz?', options: ['Müzik', 'Aydınlatma', 'Oturma düzeni', 'Sıcaklık', 'Gürültü'], required: false },
      { type: 'open_text', text: 'Başka bir öneriniz var mı?', required: false },
    ],
  },
];

const EN: SurveyTemplate[] = [
  {
    key: 'csat',
    title: 'Visit satisfaction',
    description: 'Three quick questions about today’s visit. Your answers help us improve.',
    pitch: 'Rating + recommendation + one open question. Fastest start.',
    questions: [
      { type: 'rating', text: 'How would you rate your experience today?', required: true },
      { type: 'single_choice', text: 'Would you recommend us to a friend?', options: ['Definitely', 'Probably', 'Not sure', 'No'], required: true },
      { type: 'open_text', text: 'What could we do better?', required: false },
    ],
  },
  {
    key: 'menu',
    title: 'Menu feedback',
    description: 'We are improving our menu for you. Your opinion matters.',
    pitch: 'Taste, portions and what guests want on the menu.',
    questions: [
      { type: 'rating', text: 'How did you find the taste of the food?', required: true },
      { type: 'single_choice', text: 'How were the portions?', options: ['Too small', 'Just right', 'Too large'], required: true },
      { type: 'multiple_choice', text: 'What did you like most?', options: ['Taste', 'Presentation', 'Value for money', 'Variety', 'Healthy options'], required: false },
      { type: 'open_text', text: 'Is there anything you would like to see on the menu?', required: false },
    ],
  },
  {
    key: 'service',
    title: 'Service and speed',
    description: 'A short survey about the speed of your order and our team’s care.',
    pitch: 'Measures waiting time and staff attention.',
    questions: [
      { type: 'rating', text: 'How would you rate our team’s attention?', required: true },
      { type: 'single_choice', text: 'How long did your order take?', options: ['Under 10 minutes', '10–20 minutes', 'Over 20 minutes'], required: true },
      { type: 'rating', text: 'How satisfied are you with our speed?', required: true },
      { type: 'open_text', text: 'Anything else about our service?', required: false },
    ],
  },
  {
    key: 'new_product',
    title: 'New product tasting',
    description: 'We would love to hear what you think of our new product.',
    pitch: 'Taste, price perception and repurchase intent.',
    questions: [
      { type: 'rating', text: 'How did you like the taste of our new product?', required: true },
      { type: 'single_choice', text: 'How did you find the price?', options: ['Fair', 'A bit high', 'Too high'], required: true },
      { type: 'single_choice', text: 'Would you order it again?', options: ['Yes', 'Maybe', 'No'], required: true },
      { type: 'open_text', text: 'How could we make it better?', required: false },
    ],
  },
  {
    key: 'ambience',
    title: 'Ambience and cleanliness',
    description: 'Your comfort in our venue matters to us.',
    pitch: 'Cleanliness, atmosphere and improvement priorities.',
    questions: [
      { type: 'rating', text: 'How would you rate the cleanliness?', required: true },
      { type: 'rating', text: 'How did you find the atmosphere?', required: true },
      { type: 'multiple_choice', text: 'What should we improve?', options: ['Music', 'Lighting', 'Seating', 'Temperature', 'Noise'], required: false },
      { type: 'open_text', text: 'Any other suggestions?', required: false },
    ],
  },
];

export function surveyTemplates(locale: 'tr' | 'en' = 'tr'): SurveyTemplate[] {
  return locale === 'en' ? EN : TR;
}

export function findSurveyTemplate(key: string | null | undefined, locale: 'tr' | 'en' = 'tr'): SurveyTemplate | null {
  if (!key) return null;
  return surveyTemplates(locale).find((t) => t.key === key) ?? null;
}
