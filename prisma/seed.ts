import { PrismaClient, Role, CardStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getBadgePointCostById } from '../lib/badge-catalog';
import { BRAND_ACCENT_PINK_HEX, BRAND_PRIMARY_HEX } from '../lib/brand-colors';
import {
  THEME_LEGACY_CONFIG_SETTING_KEY,
  THEME_SETTINGS_CATEGORY,
} from '../lib/theme-settings-keys';

const prisma = new PrismaClient();

// Güvenli token üretici
function generateCardToken(prefix?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const tokenLength = 21;
  let token = '';
  for (let i = 0; i < tokenLength; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}_${token}` : token;
}

async function main() {
  console.log('🌱 Seeding database...');

  // ─────────────────────────────────────────────────────────────
  // CREATE ADMIN USER
  // ─────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@qratex.com' },
    update: {},
    create: {
      email: 'admin@qratex.com',
      name: 'Admin User',
      password: adminPassword,
      role: Role.ADMIN,
      emailVerified: new Date(),
      image: '/images/avatar/AVATAR ERKEK 1.svg',
      points: 10000,
      level: 99,
      xp: 999999,
    },
  });

  console.log('✅ Admin user created:', admin.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE DEMO DEALER
  // ─────────────────────────────────────────────────────────────
  const dealerPassword = await bcrypt.hash('Dealer123!', 12);
  
  const dealer = await prisma.user.upsert({
    where: { email: 'dealer@qratex.com' },
    update: {},
    create: {
      email: 'dealer@qratex.com',
      name: 'Demo Dealer',
      password: dealerPassword,
      role: Role.DEALER,
      emailVerified: new Date(),
      image: '/images/avatar/COFFFE.svg',
      businessName: 'Demo Cafe',
      businessDesc: 'En iyi kahve deneyimi',
      businessLogo: '/logo/logo.png',
      points: 500,
      level: 5,
      xp: 2500,
    },
  });

  console.log('✅ Dealer user created:', dealer.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE DEMO CUSTOMER
  // ─────────────────────────────────────────────────────────────
  const customerPassword = await bcrypt.hash('Customer123!', 12);
  
  const customer = await prisma.user.upsert({
    where: { email: 'customer@qratex.com' },
    update: {},
    create: {
      email: 'customer@qratex.com',
      name: 'Demo Customer',
      password: customerPassword,
      role: Role.CUSTOMER,
      emailVerified: new Date(),
      image: '/images/avatar/AVATAR KADIN 1.svg',
      points: 150,
      level: 2,
      xp: 350,
    },
  });

  console.log('✅ Customer user created:', customer.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE ALL BADGES WITH SVG ICONS
  // ─────────────────────────────────────────────────────────────
  const B = '/images/badges';
  const allBadgesData = [
    // ── GENEL / GERİ BİLDİRİM ROZETLERİ ──
    { id: 'badge-yeni-ses', name: 'Yeni Ses', desc: 'İlk geri bildiriminizi gönderdiniz!', icon: `${B}/YENİ SES.svg`, cat: 'feedback', rarity: 'common', req: { type: 'feedback_count', value: 1 } },
    { id: 'badge-usta-yorumcu', name: 'Usta Yorumcu', desc: '50 geri bildirim gönderdiniz!', icon: `${B}/USTA YORUMCU.svg`, cat: 'feedback', rarity: 'epic', req: { type: 'feedback_count', value: 50 } },
    { id: 'badge-yorum-makinesi', name: 'Yorum Makinesi', desc: 'Durmaksızın yorum yapıyorsunuz!', icon: `${B}/YORUM MAKİNESİ.svg`, cat: 'feedback', rarity: 'rare', req: { type: 'feedback_count', value: 25 } },
    { id: 'badge-kelime-buyucusu', name: 'Kelime Büyücüsü', desc: 'Uzun ve detaylı yorumlar yazdınız!', icon: `${B}/KELİME BÜYÜCÜSÜ.svg`, cat: 'feedback', rarity: 'rare', req: { type: 'long_feedback_count', value: 5 } },
    { id: 'badge-hayalet-yorumcu', name: 'Hayalet Yorumcu', desc: 'Gizlice yorum bırakıyorsunuz!', icon: `${B}/HAYALET YORUMCU.svg`, cat: 'feedback', rarity: 'common', req: { type: 'anonymous_feedback', value: 5 } },
    { id: 'badge-begeni-perisi', name: 'Beğeni Perisi', desc: 'Hep olumlu geri bildirimler verdiniz!', icon: `${B}/BEĞENİ PERİSİ.svg`, cat: 'engagement', rarity: 'rare', req: { type: 'positive_feedback', value: 15 } },
    { id: 'badge-emoji-ustasi', name: 'Emoji Ustası', desc: 'Yorumlarınızda emoji kullanma konusunda ustasınız!', icon: `${B}/EMOJİ USTASI.svg`, cat: 'feedback', rarity: 'common', req: { type: 'emoji_feedback', value: 10 } },
    { id: 'badge-flash', name: 'Flash', desc: 'Çok hızlı geri bildirim gönderdiniz!', icon: `${B}/FLASH.svg`, cat: 'speed', rarity: 'common', req: { type: 'quick_feedback', value: 5 } },
    { id: 'badge-keskin-nisanci', name: 'Keskin Nişancı', desc: 'Her yorumunuz isabetli ve yapıcı!', icon: `${B}/KESKİN NİŞANCI.svg`, cat: 'feedback', rarity: 'epic', req: { type: 'helpful_feedback', value: 20 } },
    { id: 'badge-hizli-ofkeli', name: 'Hızlı ve Öfkeli', desc: 'Çok hızlı ve tutkulu geri bildirimler!', icon: `${B}/HIZLI VE ÖFKELİ.svg`, cat: 'speed', rarity: 'rare', req: { type: 'rapid_feedback', value: 10 } },
    { id: 'badge-sessiz-sinema', name: 'Sessiz Sinema', desc: 'Fotoğraflarla geri bildirim verdiniz!', icon: `${B}/SESSİZ SİNEMA.svg`, cat: 'engagement', rarity: 'common', req: { type: 'photo_feedback', value: 5 } },
    { id: 'badge-konuk-oyuncu', name: 'Konuk Oyuncu', desc: 'Yeni bir işletmeye ilk kez geri bildirim verdiniz!', icon: `${B}/KONUK OYUNCU.svg`, cat: 'exploration', rarity: 'common', req: { type: 'first_visit_feedback', value: 1 } },
    { id: 'badge-tur-rehberi', name: 'Tur Rehberi', desc: '10 farklı işletmeyi ziyaret ettiniz!', icon: `${B}/TUR REHBERİ.svg`, cat: 'exploration', rarity: 'rare', req: { type: 'unique_businesses', value: 10 } },
    { id: 'badge-mucevher', name: 'Mücevher', desc: '30 gün boyunca aktif kaldınız!', icon: `${B}/MÜCEVHER.svg`, cat: 'engagement', rarity: 'epic', req: { type: 'active_days', value: 30 } },
    { id: 'badge-mukemmeliyetci', name: 'Mükemmeliyetçi', desc: 'Her zaman 5 yıldız verdiniz!', icon: `${B}/MÜKEMMELLİYETÇİ.svg`, cat: 'rating', rarity: 'rare', req: { type: 'five_star_count', value: 10 } },
    { id: 'badge-efsane', name: 'Efsane', desc: 'Platformun efsanevi kullanıcısı oldunuz!', icon: `${B}/EFSANE.svg`, cat: 'special', rarity: 'legendary', req: { type: 'total_points', value: 5000 } },
    { id: 'badge-taht-sahibi', name: 'Taht Sahibi', desc: 'Liderlik tablosunda zirveye çıktınız!', icon: `${B}/TAHT SAHİBİ.svg`, cat: 'engagement', rarity: 'legendary', req: { type: 'leaderboard_top', value: 1 } },
    { id: 'badge-saatli-bomba', name: 'Saatli Bomba', desc: 'Son dakikada yetişen geri bildirimler!', icon: `${B}/SAATLİ BOMBA.svg`, cat: 'speed', rarity: 'epic', req: { type: 'last_minute_feedback', value: 5 } },
    { id: 'badge-firtina', name: 'Fırtına', desc: '7 gün üst üste geri bildirim gönderdiniz!', icon: `${B}/FIRTINA.svg`, cat: 'streak', rarity: 'epic', req: { type: 'streak', value: 7 } },
    { id: 'badge-filozof', name: 'Filozof', desc: 'Derin ve düşündürücü yorumlar yazdınız!', icon: `${B}/FİLOZOF.svg`, cat: 'feedback', rarity: 'rare', req: { type: 'detailed_feedback_count', value: 10 } },
    { id: 'badge-nostalji', name: 'Nostalji Rüzgarı', desc: 'Eski bir işletmeyi tekrar ziyaret ettiniz!', icon: `${B}/NOSTALJİ RÜZGARI.svg`, cat: 'engagement', rarity: 'common', req: { type: 'revisit_business', value: 3 } },
    { id: 'badge-ilham-kaynagi', name: 'İlham Kaynağı', desc: 'Detaylı ve ilham verici geri bildirimler yazdınız!', icon: `${B}/İLHAM KAYNAĞI.svg`, cat: 'feedback', rarity: 'rare', req: { type: 'inspiring_feedback', value: 10 } },
    { id: 'badge-hayal-muhendisi', name: 'Hayal Mühendisi', desc: 'Yaratıcı önerileriniz gerçeğe dönüştü!', icon: `${B}/FİLOZOF.svg`, cat: 'special', rarity: 'rare', req: { type: 'creative_suggestion', value: 5 } },
    { id: 'badge-katalizor', name: 'Katalizör', desc: 'Toplulukta değişime öncülük ettiniz!', icon: `${B}/KATALİZÇR.svg`, cat: 'engagement', rarity: 'epic', req: { type: 'community_impact', value: 15 } },
    { id: 'badge-ters-kose', name: 'Ters Köşe', desc: 'Beklenmedik bir açıdan yorum yaptınız!', icon: `${B}/TERS KÖŞE.svg`, cat: 'special', rarity: 'rare', req: { type: 'unique_perspective', value: 5 } },
    { id: 'badge-yanki', name: 'Yankı', desc: 'Yorumlarınız başkaları tarafından beğenildi!', icon: `${B}/YANKI.svg`, cat: 'feedback', rarity: 'common', req: { type: 'liked_feedback', value: 10 } },
    { id: 'badge-xray', name: 'X-Ray', desc: 'Gizli detayları keşfettiniz!', icon: `${B}/XRAY.svg`, cat: 'special', rarity: 'epic', req: { type: 'hidden_detail', value: 5 } },
    { id: 'badge-tetikci', name: 'Tetikçi', desc: 'Hızlı ve etkili geri bildirimler!', icon: `${B}/TETİKÇİ.svg`, cat: 'speed', rarity: 'rare', req: { type: 'efficient_feedback', value: 10 } },
    { id: 'badge-surpriz-kutusu', name: 'Sürpriz Kutusu', desc: 'Beklenmedik ödüller kazandınız!', icon: `${B}/sürpriz kutusu.svg`, cat: 'special', rarity: 'rare', req: { type: 'surprise_reward', value: 3 } },
    { id: 'badge-depresif', name: 'Depresif', desc: 'Düşük puanlı geri bildirimler verdiniz!', icon: `${B}/DEPRESİF.svg`, cat: 'general', rarity: 'common', req: { type: 'low_rating_feedback', value: 5 } },
    { id: 'badge-drama-queen', name: 'Drama Queen', desc: 'En dramatik yorumların sahibi!', icon: `${B}/drama queen.svg`, cat: 'general', rarity: 'common', req: { type: 'dramatic_feedback', value: 5 } },
    { id: 'badge-copy-cv', name: 'Copy CV', desc: 'Profilinizi mükemmelleştirdiniz!', icon: `${B}/copy cv.svg`, cat: 'general', rarity: 'common', req: { type: 'profile_complete', value: 1 } },
    { id: 'badge-havai-fisek', name: 'Havai Fişek', desc: 'Kutlama zamanı! Büyük başarı!', icon: `${B}/havai fişek.svg`, cat: 'special', rarity: 'rare', req: { type: 'milestone_reached', value: 1 } },
    { id: 'badge-filiz', name: 'Filiz', desc: 'Yeni başlayan ama büyüyen bir kullanıcı!', icon: `${B}/filiz.svg`, cat: 'general', rarity: 'common', req: { type: 'account_age_days', value: 7 } },
    { id: 'badge-huysuz', name: 'Huysuz', desc: 'Eleştirel ama yapıcı geri bildirimler!', icon: `${B}/huysuz.svg`, cat: 'general', rarity: 'common', req: { type: 'critical_feedback', value: 5 } },
    { id: 'badge-jet', name: 'Jet', desc: 'İnanılmaz hızda geri bildirim!', icon: `${B}/jet.svg`, cat: 'speed', rarity: 'rare', req: { type: 'ultra_fast_feedback', value: 3 } },
    { id: 'badge-kafein-bagimlisi', name: 'Kafein Bağımlısı', desc: 'Kafe kategorisinde uzman oldunuz!', icon: `${B}/kafein bağımlısı.svg`, cat: 'expertise', rarity: 'common', req: { type: 'cafe_feedback', value: 10 } },
    { id: 'badge-leyla', name: 'Leyla', desc: 'Gece saatlerinde aktif kullanıcı!', icon: `${B}/leyla.svg`, cat: 'general', rarity: 'common', req: { type: 'night_feedback', value: 5 } },
    { id: 'badge-gurme', name: 'Gurme', desc: 'Yemek kategorisinde uzman oldunuz!', icon: `${B}/gurme.svg`, cat: 'expertise', rarity: 'epic', req: { type: 'food_category_count', value: 20 } },
    { id: 'badge-muhabbet-kusu', name: 'Muhabbet Kuşu', desc: 'Çok konuşkan bir kullanıcısınız!', icon: `${B}/muhabbet kuşu.svg`, cat: 'engagement', rarity: 'common', req: { type: 'chat_messages', value: 20 } },
    { id: 'badge-behzat-c', name: 'Behzat Ç', desc: 'Adaletli ve dürüst geri bildirimler!', icon: `${B}/behzat ç.svg`, cat: 'general', rarity: 'rare', req: { type: 'honest_feedback', value: 15 } },
    { id: 'badge-joker', name: 'Joker', desc: 'Beklenmedik ve eğlenceli yorumlar!', icon: `${B}/JOKER.svg`, cat: 'special', rarity: 'legendary', req: { type: 'funny_feedback', value: 10 } },
    // ── DİZİ / FİLM KARAKTERİ ROZETLERİ ──
    { id: 'badge-barney-stinson', name: 'Barney Stinson', desc: 'Efsanevi olmak senin işin!', icon: `${B}/BARNEY STİNSON.svg`, cat: 'special', rarity: 'legendary', req: { type: 'legendary_status', value: 1 } },
    { id: 'badge-chandler', name: 'Chandler Bing', desc: 'Espri ustası! Her yorumun gülümsetiyor.', icon: `${B}/CHANDLER BİİG.svg`, cat: 'special', rarity: 'legendary', req: { type: 'witty_feedback', value: 10 } },
    { id: 'badge-sheldon', name: 'Sheldon Cooper', desc: 'Bilimsel hassasiyetle geri bildirim!', icon: `${B}/SHELDON COOPER.svg`, cat: 'special', rarity: 'legendary', req: { type: 'precise_feedback', value: 15 } },
    { id: 'badge-walter-white', name: 'Walter White', desc: 'Kimya gibi mükemmel formüller!', icon: `${B}/WALTER WHİTE.svg`, cat: 'special', rarity: 'legendary', req: { type: 'perfect_formula', value: 20 } },
    { id: 'badge-jon-snow', name: 'Jon Snow', desc: 'Kış geliyor... ama sen hazırsın!', icon: `${B}/JON SNOW.svg`, cat: 'special', rarity: 'legendary', req: { type: 'winter_warrior', value: 1 } },
    { id: 'badge-sherlock', name: 'Sherlock Holmes', desc: 'Dedektif gibi detaycı geri bildirimler!', icon: `${B}/SHERLOCK.svg`, cat: 'special', rarity: 'legendary', req: { type: 'detective_feedback', value: 10 } },
    { id: 'badge-mr-robot', name: 'Mr. Robot', desc: 'Sistemi çözdünüz!', icon: `${B}/MR ROBOT.svg`, cat: 'special', rarity: 'legendary', req: { type: 'system_master', value: 1 } },
    { id: 'badge-professor', name: 'Profesör', desc: 'Planınız mükemmel işledi!', icon: `${B}/PROFESSOR.svg`, cat: 'special', rarity: 'legendary', req: { type: 'master_plan', value: 1 } },
    { id: 'badge-the-doctor', name: 'The Doctor', desc: 'Zaman ve mekanın ötesinde!', icon: `${B}/THE DOCTOR.svg`, cat: 'special', rarity: 'legendary', req: { type: 'time_traveler', value: 1 } },
    { id: 'badge-tokyo', name: 'Tokyo', desc: 'Cesur ve kararlı bir kullanıcı!', icon: `${B}/TOKYO.svg`, cat: 'special', rarity: 'epic', req: { type: 'bold_action', value: 10 } },
    { id: 'badge-tommy-shelby', name: 'Tommy Shelby', desc: 'Peaky Blinders tarzı liderlik!', icon: `${B}/TOMMY SHELBY.svg`, cat: 'special', rarity: 'legendary', req: { type: 'leadership', value: 1 } },
    { id: 'badge-ragnar', name: 'Ragnar Lothbrok', desc: 'Viking cesareti ile keşfe çıktınız!', icon: `${B}/RAGNAR LOTHBROK.svg`, cat: 'special', rarity: 'legendary', req: { type: 'explorer_spirit', value: 20 } },
    { id: 'badge-spartacus', name: 'Spartacus', desc: 'Özgürlük savaşçısı!', icon: `${B}/SPARTACUS.svg`, cat: 'special', rarity: 'legendary', req: { type: 'freedom_fighter', value: 1 } },
    { id: 'badge-dexter', name: 'Dexter', desc: 'Analitik zekayı geri bildirime döktünüz!', icon: `${B}/DEXTER.svg`, cat: 'special', rarity: 'epic', req: { type: 'analytical_feedback', value: 15 } },
    { id: 'badge-eleven', name: 'Eleven', desc: 'Süper güçler aktif!', icon: `${B}/ELEVEN.svg`, cat: 'special', rarity: 'epic', req: { type: 'super_power', value: 1 } },
    { id: 'badge-wednesday', name: 'Wednesday', desc: 'Karanlık ama zarif bir tarz!', icon: `${B}/WEDNESDAY.svg`, cat: 'special', rarity: 'epic', req: { type: 'dark_elegance', value: 1 } },
    { id: 'badge-pablo-escobar', name: 'Pablo Escobar', desc: 'Puan imparatorluğu kurdunuz!', icon: `${B}/PABLO ESCOBAR.svg`, cat: 'special', rarity: 'legendary', req: { type: 'point_empire', value: 10000 } },
    { id: 'badge-jesse-pinkman', name: 'Jesse Pinkman', desc: 'Yeah Science! Bilimsel yaklaşım!', icon: `${B}/JESSE PİNKMAN.svg`, cat: 'special', rarity: 'epic', req: { type: 'scientific_approach', value: 10 } },
    { id: 'badge-dark-jonas', name: 'Dark Jonas', desc: 'Zamanın döngüsünü kırdınız!', icon: `${B}/DARK JONAS.svg`, cat: 'special', rarity: 'epic', req: { type: 'time_loop', value: 1 } },
    { id: 'badge-dean-winchester', name: 'Dean Winchester', desc: 'Doğaüstü güçlerle savaşan kahraman!', icon: `${B}/DEAN WİNCHESTER.svg`, cat: 'special', rarity: 'epic', req: { type: 'supernatural', value: 1 } },
    { id: 'badge-castiel', name: 'Castiel', desc: 'Koruyucu melek gibi destekçi!', icon: `${B}/CASTİEL.svg`, cat: 'special', rarity: 'epic', req: { type: 'guardian_angel', value: 1 } },
    { id: 'badge-carrie', name: 'Carrie Mathison', desc: 'Sezgileri güçlü bir analist!', icon: `${B}/CARRİE MATHİNSON.svg`, cat: 'special', rarity: 'epic', req: { type: 'strong_intuition', value: 10 } },
    { id: 'badge-elizabeth', name: 'Elizabeth', desc: 'Kraliçe gibi zarafet!', icon: `${B}/ELİZABETH.svg`, cat: 'special', rarity: 'epic', req: { type: 'royal_elegance', value: 1 } },
    { id: 'badge-frank-underwood', name: 'Frank Underwood', desc: 'Stratejik deha!', icon: `${B}/FRANK UNDERWOOD.svg`, cat: 'special', rarity: 'legendary', req: { type: 'strategic_genius', value: 1 } },
    { id: 'badge-good-omens', name: 'Good Omens', desc: 'İyilik ve kötülüğün dengesi!', icon: `${B}/GOOD OMENS.svg`, cat: 'special', rarity: 'epic', req: { type: 'balance', value: 1 } },
    { id: 'badge-hannibal', name: 'Hannibal', desc: 'Sofistike zevkler ve keskin zeka!', icon: `${B}/HANNİBAL.svg`, cat: 'special', rarity: 'legendary', req: { type: 'sophisticated', value: 1 } },
    { id: 'badge-house-md', name: 'House MD', desc: 'Herkes yalan söyler... ama siz gerçeği bulursunuz!', icon: `${B}/HOUSE MD.svg`, cat: 'special', rarity: 'legendary', req: { type: 'truth_seeker', value: 1 } },
    { id: 'badge-joe', name: 'Joe', desc: 'Takıntılı bir meraklı!', icon: `${B}/JOE.svg`, cat: 'special', rarity: 'epic', req: { type: 'obsessive_curiosity', value: 1 } },
    { id: 'badge-john-locke', name: 'John Locke', desc: 'Adaya inanç, sisteme güven!', icon: `${B}/JOHN LOCKE.svg`, cat: 'special', rarity: 'epic', req: { type: 'faith_in_system', value: 1 } },
    { id: 'badge-kelly-yorkie', name: 'Kelly & Yorkie', desc: 'Birlikte daha güçlü!', icon: `${B}/KELLY AND YORKİE.svg`, cat: 'special', rarity: 'epic', req: { type: 'partnership', value: 1 } },
    { id: 'badge-khalesi', name: 'Khaleesi', desc: 'Ejderhaların anası! Güç sizinle!', icon: `${B}/KHALESİ.svg`, cat: 'special', rarity: 'legendary', req: { type: 'dragon_mother', value: 1 } },
    { id: 'badge-martha', name: 'Martha', desc: 'Her dünyada bir bağlantı!', icon: `${B}/MARTHA.svg`, cat: 'special', rarity: 'epic', req: { type: 'multiverse', value: 1 } },
    { id: 'badge-michael-scofield', name: 'Michael Scofield', desc: 'Her detayı planlayan deha!', icon: `${B}/MİCHAEL SCOLFİELD.svg`, cat: 'special', rarity: 'legendary', req: { type: 'master_planner', value: 1 } },
    { id: 'badge-rick-morty', name: 'Rick & Morty', desc: 'Wubba lubba dub dub! Bilimsel macera!', icon: `${B}/RİCK AND MORTY.svg`, cat: 'special', rarity: 'legendary', req: { type: 'science_adventure', value: 1 } },
    { id: 'badge-rome-julius', name: 'Julius Caesar', desc: 'Veni, Vidi, Vici! Geldim, gördüm, yorum yaptım!', icon: `${B}/ROME JULİUS.svg`, cat: 'special', rarity: 'legendary', req: { type: 'conqueror', value: 1 } },
    { id: 'badge-tyrion', name: 'Tyrion Lannister', desc: 'İçerim ve bilir olurum!', icon: `${B}/TYRİON LANNİSTER.svg`, cat: 'special', rarity: 'legendary', req: { type: 'wise_drinker', value: 1 } },
    { id: 'badge-villanelle', name: 'Villanelle', desc: 'Tarz sahibi ve ölümcül çekici!', icon: `${B}/VİLLANEVİLLE.svg`, cat: 'special', rarity: 'epic', req: { type: 'killer_style', value: 1 } },
    { id: 'badge-the-office', name: 'The Office', desc: 'Ofis hayatının en eğlenceli hali!', icon: `${B}/THE OFFİCE.svg`, cat: 'special', rarity: 'epic', req: { type: 'office_fun', value: 1 } },
    { id: 'badge-this-is-us', name: 'This is Us', desc: 'Duygusal ve gerçek bağlantılar!', icon: `${B}/THİS İS US.svg`, cat: 'special', rarity: 'epic', req: { type: 'emotional_bond', value: 1 } },
    { id: 'badge-sam-winchester', name: 'Sam Winchester', desc: 'Kardeşlik ve cesaret!', icon: `${B}/SAM WİNCHESTR.svg`, cat: 'special', rarity: 'epic', req: { type: 'brotherhood', value: 1 } },
    { id: 'badge-witcher', name: 'Witcher Geralt', desc: 'Hmm... Canavarlarla savaşan kahraman!', icon: `${B}/WİTCHER GERALT.svg`, cat: 'special', rarity: 'legendary', req: { type: 'monster_slayer', value: 1 } },
  ];

  // Delete existing badges and create all new ones
  await prisma.badge.deleteMany({});
  
  const badges = await Promise.all(
    allBadgesData.map((b) =>
      prisma.badge.create({
        data: {
          id: b.id,
          name: b.name,
          description: b.desc,
          icon: b.icon,
          category: b.cat,
          rarity: b.rarity,
          requirement: b.req,
          pointCost: getBadgePointCostById(b.id),
          isActive: true,
        },
      })
    )
  );

  console.log('✅ Badges created:', badges.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE QUESTS
  // ─────────────────────────────────────────────────────────────
  const quests = await Promise.all([
    prisma.quest.upsert({
      where: { id: 'quest-daily-feedback' },
      update: {},
      create: {
        id: 'quest-daily-feedback',
        name: 'Günlük Geri Bildirim',
        description: 'Bugün 1 geri bildirim gönderin',
        icon: '/images/badges/YORUM MAKİNESİ.svg',
        type: 'daily',
        requirement: { type: 'give_feedback', count: 1 },
        reward: { points: 50, xp: 25 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-weekly-explorer' },
      update: {},
      create: {
        id: 'quest-weekly-explorer',
        name: 'Haftalık Kaşif',
        description: 'Bu hafta 5 farklı işletmeyi ziyaret edin',
        icon: '/images/badges/TUR REHBERİ.svg',
        type: 'weekly',
        requirement: { type: 'visit_businesses', count: 5 },
        reward: { points: 200, xp: 100 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-photo-feedback' },
      update: {},
      create: {
        id: 'quest-photo-feedback',
        name: 'Fotoğraflı Geri Bildirim',
        description: 'Fotoğraf içeren bir geri bildirim gönderin',
        icon: '/images/badges/EMOJİ USTASI.svg',
        type: 'daily',
        requirement: { type: 'feedback_with_photo', count: 1 },
        reward: { points: 75, xp: 40 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-detailed-review' },
      update: {},
      create: {
        id: 'quest-detailed-review',
        name: 'Detaylı Değerlendirme',
        description: '100+ karakter uzunluğunda yorum yazın',
        icon: '/images/badges/KELİME BÜYÜCÜSÜ.svg',
        type: 'daily',
        requirement: { type: 'detailed_feedback', count: 1 },
        reward: { points: 100, xp: 50 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-weekly-feedback' },
      update: {},
      create: {
        id: 'quest-weekly-feedback',
        name: 'Haftalık Geri Bildirim',
        description: 'Bu hafta 3 geri bildirim gönderin',
        icon: '/images/badges/YENİ SES.svg',
        type: 'weekly',
        requirement: { type: 'give_feedback', count: 3 },
        reward: { points: 150, xp: 75 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-first-referral' },
      update: {},
      create: {
        id: 'quest-first-referral',
        name: 'İlk Davet',
        description: 'Bir arkadaşınızı davet edin (referans kodu ile kayıt olmalı)',
        icon: '/images/badges/YANKI.svg',
        type: 'special',
        requirement: { type: 'referral', count: 1 },
        reward: { points: 300, xp: 150 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-three-businesses' },
      update: {},
      create: {
        id: 'quest-three-businesses',
        name: 'Üç Farklı İşletme',
        description: '3 farklı işletmeye geri bildirim verin',
        icon: '/images/badges/KONUK OYUNCU.svg',
        type: 'weekly',
        requirement: { type: 'visit_businesses', count: 3 },
        reward: { points: 180, xp: 90 },
      },
    }),
  ]);

  console.log('✅ Quests created:', quests.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE REWARDS
  // ─────────────────────────────────────────────────────────────
  const rewards = await Promise.all([
    prisma.reward.upsert({
      where: { id: 'reward-coffee-coupon' },
      update: {
        icon: '/images/rewards/reward-coffee.webp',
      },
      create: {
        id: 'reward-coffee-coupon',
        name: 'Ücretsiz Kahve',
        description: 'Anlaşmalı kafelerde ücretsiz kahve kuponu',
        icon: '/images/rewards/reward-coffee.webp',
        cost: 500,
        type: 'coupon',
        stock: 100,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-discount-10' },
      update: {
        icon: '/images/rewards/reward-discount.webp',
      },
      create: {
        id: 'reward-discount-10',
        name: '%10 İndirim',
        description: 'Bir sonraki alışverişinizde %10 indirim',
        icon: '/images/rewards/reward-discount.webp',
        cost: 300,
        type: 'coupon',
        stock: -1,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-vip-badge' },
      update: {
        icon: '/images/rewards/reward-vip.webp',
      },
      create: {
        id: 'reward-vip-badge',
        name: 'VIP Rozet',
        description: 'Profilinizde VIP rozeti kazanın',
        icon: '/images/rewards/reward-vip.webp',
        cost: 1000,
        type: 'digital',
        stock: -1,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-donut' },
      update: {
        icon: '/images/rewards/reward-donut.webp',
      },
      create: {
        id: 'reward-donut',
        name: 'Ücretsiz Tatlı',
        description: 'Anlaşmalı pastanelerde ücretsiz tatlı',
        icon: '/images/rewards/reward-donut.webp',
        cost: 400,
        type: 'coupon',
        stock: 50,
      },
    }),
  ]);

  console.log('✅ Rewards created:', rewards.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE QR CODES FOR DEALER
  // ─────────────────────────────────────────────────────────────
  const qrCodes = await Promise.all([
    prisma.qRCode.upsert({
      where: { id: 'qr-demo-1' },
      update: {},
      create: {
        id: 'qr-demo-1',
        code: 'DEMO-CAFE-001',
        name: 'Ana Masa QR',
        description: 'Ana girişteki masa için QR kod',
        dealerId: dealer.id,
        scanCount: 42,
      },
    }),
    prisma.qRCode.upsert({
      where: { id: 'qr-demo-2' },
      update: {},
      create: {
        id: 'qr-demo-2',
        code: 'DEMO-CAFE-002',
        name: 'Teras QR',
        description: 'Teras alanı için QR kod',
        dealerId: dealer.id,
        scanCount: 28,
      },
    }),
  ]);

  console.log('✅ QR Codes created:', qrCodes.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE SAMPLE FEEDBACKS
  // ─────────────────────────────────────────────────────────────
  const feedbacks = await Promise.all([
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[0].id,
        userId: customer.id,
        rating: 5,
        text: 'Harika bir deneyimdi! Kahveler çok lezzetli ve personel çok ilgiliydi.',
        sentiment: 'positive',
        emotions: { happy: 0.9, satisfied: 0.85 },
        topics: ['service', 'quality', 'staff'],
      },
    }),
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[0].id,
        rating: 4,
        text: 'Ortam güzel ama biraz kalabalıktı.',
        sentiment: 'positive',
        emotions: { satisfied: 0.7, neutral: 0.3 },
        topics: ['atmosphere', 'crowded'],
      },
    }),
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[1].id,
        rating: 3,
        text: 'Beklentilerimi tam olarak karşılamadı.',
        sentiment: 'neutral',
        emotions: { neutral: 0.6, disappointed: 0.3 },
        topics: ['expectations'],
      },
    }),
  ]);

  console.log('✅ Feedbacks created:', feedbacks.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE SETTINGS
  // ─────────────────────────────────────────────────────────────
  const settings = await Promise.all([
    prisma.settings.upsert({
      where: { key: 'site_name' },
      update: {},
      create: {
        key: 'site_name',
        value: { value: 'QRATEX' },
        category: 'general',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'site_description' },
      update: {},
      create: {
        key: 'site_description',
        value: { value: 'QR Tabanlı Geri Bildirim ve Gamification Platformu' },
        category: 'general',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'header_config' },
      update: {},
      create: {
        key: 'header_config',
        value: {
          logo: '/logo/logo.png',
          logoLight: '/logo/logo-light.png',
          menuItems: [
            { label: 'Ana Sayfa', href: '/' },
            { label: 'Özellikler', href: '/#features' },
            { label: 'Fiyatlandırma', href: '/#pricing' },
            { label: 'İletişim', href: '/contact' },
          ],
          ctaButton: { label: 'Başla', href: '/auth/register' },
        },
        category: 'layout',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'footer_config' },
      update: {},
      create: {
        key: 'footer_config',
        value: {
          columns: [
            {
              title: 'Ürün',
              links: [
                { label: 'Özellikler', href: '/#features' },
                { label: 'Fiyatlandırma', href: '/#pricing' },
                { label: 'API', href: '/api-docs' },
              ],
            },
            {
              title: 'Şirket',
              links: [
                { label: 'Hakkımızda', href: '/about' },
                { label: 'Blog', href: '/blog' },
                { label: 'Kariyer', href: '/careers' },
              ],
            },
            {
              title: 'Destek',
              links: [
                { label: 'Yardım Merkezi', href: '/help' },
                { label: 'İletişim', href: '/contact' },
                { label: 'SSS', href: '/faq' },
              ],
            },
          ],
          socialLinks: [
            { platform: 'twitter', href: 'https://twitter.com/qratex' },
            { platform: 'linkedin', href: 'https://linkedin.com/company/qratex' },
            { platform: 'instagram', href: 'https://instagram.com/qratex' },
          ],
          legalText: '© 2024 QRATEX. Tüm hakları saklıdır.',
        },
        category: 'layout',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'gamification_config' },
      update: {},
      create: {
        key: 'gamification_config',
        value: {
          pointsPerFeedback: 50,
          pointsPerDetailedFeedback: 100,
          xpPerLevel: 1000,
          levelMultiplier: 1.5,
          leagues: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        },
        category: 'gamification',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'ai_config' },
      update: {},
      create: {
        key: 'ai_config',
        value: {
          enabled: true,
          model: 'gpt-4-turbo-preview',
          maxTokens: 500,
          temperature: 0.7,
          sentimentAnalysis: true,
          emotionDetection: true,
          topicExtraction: true,
          toxicityCheck: true,
        },
        category: 'ai',
      },
    }),
    prisma.settings.upsert({
      where: { key: THEME_LEGACY_CONFIG_SETTING_KEY },
      update: {},
      create: {
        key: THEME_LEGACY_CONFIG_SETTING_KEY,
        value: {
          defaultTheme: 'dark',
          allowUserTheme: true,
          primaryColor: BRAND_PRIMARY_HEX,
          accentColor: BRAND_ACCENT_PINK_HEX,
        },
        category: THEME_SETTINGS_CATEGORY,
      },
    }),
    prisma.settings.upsert({
      where: { key: 'avatar_options' },
      update: {},
      create: {
        key: 'avatar_options',
        value: {
          categories: [
            {
              name: 'İnsanlar',
              avatars: [
                '/images/avatar/AVATAR ERKEK 1.svg',
                '/images/avatar/AVATAR ERKEK 2.svg',
                '/images/avatar/AVATAR ERKEK 3.svg',
                '/images/avatar/AVATAR ERKEK 4.svg',
                '/images/avatar/AVATAR ERKEK 5.svg',
                '/images/avatar/AVATAR KADIN 1.svg',
                '/images/avatar/AVATAR KADIN 2.svg',
                '/images/avatar/AVATAR KADIN 3.svg',
                '/images/avatar/AVATAR KADIN 4.svg',
              ],
            },
            {
              name: 'Hayvanlar',
              avatars: [
                '/images/avatar/CAT.svg',
                '/images/avatar/DOG.svg',
                '/images/avatar/ELEPHANT.svg',
                '/images/avatar/FROG.svg',
                '/images/avatar/KOALA.svg',
                '/images/avatar/LİON.svg',
                '/images/avatar/MONKEY.svg',
                '/images/avatar/PANDA.svg',
                '/images/avatar/TİGER.svg',
              ],
            },
            {
              name: 'Yiyecekler',
              avatars: [
                '/images/avatar/APPLE.svg',
                '/images/avatar/AVACADO.svg',
                '/images/avatar/BANANA.svg',
                '/images/avatar/BLUEBERRY.svg',
                '/images/avatar/CHERRRY.svg',
                '/images/avatar/COFFFE.svg',
                '/images/avatar/DONUT.svg',
                '/images/avatar/HAMBURGER.svg',
                '/images/avatar/PİZZ.svg',
              ],
            },
            {
              name: 'Emojiler',
              avatars: [
                '/images/avatar/EMOJİ1.svg',
                '/images/avatar/EMOJİ2.svg',
                '/images/avatar/EMOJİ3.svg',
                '/images/avatar/EMOJİ4.svg',
                '/images/avatar/EMOJİ5.svg',
                '/images/avatar/EMOJİ6.svg',
                '/images/avatar/EMOJİ7.svg',
                '/images/avatar/EMOJİ8.svg',
              ],
            },
          ],
        },
        category: 'avatars',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'enableRegistration' },
      update: {},
      create: { key: 'enableRegistration', value: true, category: 'general' },
    }),
    prisma.settings.upsert({
      where: { key: 'enableGoogleAuth' },
      update: {},
      create: { key: 'enableGoogleAuth', value: true, category: 'general' },
    }),
    prisma.settings.upsert({
      where: { key: 'enableMagicLink' },
      update: {},
      create: { key: 'enableMagicLink', value: true, category: 'general' },
    }),
    prisma.settings.upsert({
      where: { key: 'maintenanceMode' },
      update: {},
      create: { key: 'maintenanceMode', value: false, category: 'general' },
    }),
  ]);

  console.log('✅ Settings created:', settings.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE FEATURE FLAGS
  // ─────────────────────────────────────────────────────────────
  const featureFlags = await Promise.all([
    prisma.featureFlag.upsert({
      where: { key: 'gamification' },
      update: {},
      create: {
        key: 'gamification',
        name: 'Gamification Sistemi',
        description: 'Puan, rozet ve ödül sistemi',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'ai_analysis' },
      update: {},
      create: {
        key: 'ai_analysis',
        name: 'AI Analizi',
        description: 'OpenAI ile geri bildirim analizi',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'push_notifications' },
      update: {},
      create: {
        key: 'push_notifications',
        name: 'Push Bildirimleri',
        description: 'Tarayıcı push bildirimleri',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'leaderboard' },
      update: {},
      create: {
        key: 'leaderboard',
        name: 'Liderlik Tablosu',
        description: 'Kullanıcı sıralaması',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'vip_club' },
      update: {},
      create: {
        key: 'vip_club',
        name: 'VIP Kulüp',
        description: 'VIP üyelik özellikleri',
        isEnabled: false,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'dark_mode' },
      update: {},
      create: {
        key: 'dark_mode',
        name: 'Karanlık Mod',
        description: 'Karanlık tema desteği',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'light_mode' },
      update: {},
      create: {
        key: 'light_mode',
        name: 'Açık Mod',
        description: 'Açık tema desteği',
        isEnabled: true,
      },
    }),
  ]);

  console.log('✅ Feature flags created:', featureFlags.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE PRICING PLANS
  // ─────────────────────────────────────────────────────────────
  const pricingPlans = await Promise.all([
    prisma.pricingPlan.upsert({
      where: { id: 'plan-free' },
      update: {},
      create: {
        id: 'plan-free',
        name: 'Ücretsiz',
        description: 'Küçük işletmeler için ideal başlangıç',
        price: 0,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          '3 QR Kod',
          'Aylık 100 Geri Bildirim',
          'Temel Analitik',
          'E-posta Desteği',
        ],
        order: 0,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-starter' },
      update: {},
      create: {
        id: 'plan-starter',
        name: 'Başlangıç',
        description: 'Büyüyen işletmeler için',
        price: 299,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          '10 QR Kod',
          'Aylık 500 Geri Bildirim',
          'Gelişmiş Analitik',
          'AI Duygu Analizi',
          'Öncelikli Destek',
        ],
        isPopular: true,
        order: 1,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-pro' },
      update: {},
      create: {
        id: 'plan-pro',
        name: 'Profesyonel',
        description: 'Orta ölçekli işletmeler için',
        price: 699,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          'Sınırsız QR Kod',
          'Sınırsız Geri Bildirim',
          'Tam Analitik Paketi',
          'AI Asistan',
          'API Erişimi',
          'Özel Entegrasyonlar',
          '7/24 Destek',
        ],
        order: 2,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-enterprise' },
      update: {},
      create: {
        id: 'plan-enterprise',
        name: 'Kurumsal',
        description: 'Büyük işletmeler ve zincirler için',
        price: 1999,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          'Tüm Pro Özellikleri',
          'Çoklu Şube Yönetimi',
          'Özel Raporlama',
          'SLA Garantisi',
          'Dedicated Hesap Yöneticisi',
          'On-premise Seçeneği',
          'Özel Eğitim',
        ],
        order: 3,
      },
    }),
  ]);

  console.log('✅ Pricing plans created:', pricingPlans.length);

  // ─────────────────────────────────────────────────────────────
  // GIVE BADGES TO USERS
  // ─────────────────────────────────────────────────────────────
  await prisma.userBadge.upsert({
    where: {
      userId_badgeId: {
        userId: customer.id,
        badgeId: 'badge-yeni-ses',
      },
    },
    update: {},
    create: {
      userId: customer.id,
      badgeId: 'badge-yeni-ses',
    },
  });

  await prisma.userBadge.upsert({
    where: {
      userId_badgeId: {
        userId: admin.id,
        badgeId: 'badge-efsane',
      },
    },
    update: {},
    create: {
      userId: admin.id,
      badgeId: 'badge-efsane',
    },
  });

  console.log('✅ User badges assigned');

  // ─────────────────────────────────────────────────────────────
  // CREATE DONATION PROJECTS
  // ─────────────────────────────────────────────────────────────
  const donationProjects = await Promise.all([
    prisma.donationProject.upsert({
      where: { id: 'project-clean-water' },
      update: {},
      create: {
        id: 'project-clean-water',
        name: 'Temiz Su Projesi',
        description: 'Afrika köylerinde temiz su kuyuları açarak binlerce insanın hayatını değiştiriyoruz. Her 100 puan = 10 litre temiz su.',
        icon: '💧',
        category: 'water',
        goal: 10000,
        current: 3250,
        impact: { unit: 'litre', perPoint: 0.1, label: 'Temiz Su' },
        tags: ['Temel İhtiyaç', 'Afrika', 'Sürdürülebilir'],
        isFeatured: true,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-education' },
      update: {},
      create: {
        id: 'project-education',
        name: 'Eğitim Bursu',
        description: 'Dezavantajlı öğrencilere eğitim bursu sağlayarak geleceğe yatırım yapıyoruz. Her 500 puan = 1 öğrenci için 1 aylık eğitim desteği.',
        icon: '📚',
        category: 'education',
        goal: 25000,
        current: 8750,
        impact: { unit: 'öğrenci', perPoint: 0.002, label: 'Eğitim Desteği' },
        tags: ['Eğitim', 'Gençlik', 'Fırsat Eşitliği'],
        isFeatured: true,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-tree-planting' },
      update: {},
      create: {
        id: 'project-tree-planting',
        name: 'Fidan Dikimi',
        description: 'Ormanlarımızı yeniden yeşertiyoruz. Her 200 puan = 1 fidan dikimi. Geleceğe nefes olun!',
        icon: '🌳',
        category: 'environment',
        goal: 15000,
        current: 6420,
        impact: { unit: 'fidan', perPoint: 0.005, label: 'Dikilen Fidan' },
        tags: ['Çevre', 'İklim', 'Yeşil Gelecek'],
        isFeatured: false,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-animal-shelter' },
      update: {},
      create: {
        id: 'project-animal-shelter',
        name: 'Hayvan Barınağı Desteği',
        description: 'Sokak hayvanlarına yiyecek ve barınak sağlıyoruz. Her 50 puan = 1 kg mama.',
        icon: '🐾',
        category: 'animals',
        goal: 8000,
        current: 2150,
        impact: { unit: 'kg mama', perPoint: 0.02, label: 'Hayvan Maması' },
        tags: ['Hayvan Hakları', 'Sokak Hayvanları', 'Barınak'],
        isFeatured: false,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-health-support' },
      update: {},
      create: {
        id: 'project-health-support',
        name: 'Sağlık Yardımı',
        description: 'İhtiyaç sahibi ailelere sağlık desteği sağlıyoruz. Her 1000 puan = 1 sağlık paketi.',
        icon: '🏥',
        category: 'health',
        goal: 20000,
        current: 4500,
        impact: { unit: 'paket', perPoint: 0.001, label: 'Sağlık Paketi' },
        tags: ['Sağlık', 'Destek', 'Acil Yardım'],
        isFeatured: false,
      },
    }),
  ]);

  console.log('✅ Donation projects created:', donationProjects.length);

  // Create some sample donations
  await prisma.donation.createMany({
    data: [
      {
        userId: admin.id,
        projectId: 'project-clean-water',
        points: 500,
        message: 'Temiz su herkesin hakkı!',
        isPublic: true,
      },
      {
        userId: admin.id,
        projectId: 'project-education',
        points: 750,
        message: 'Eğitim en büyük yatırım.',
        isPublic: true,
      },
      {
        userId: customer.id,
        projectId: 'project-tree-planting',
        points: 100,
        message: 'Yeşil bir gelecek için!',
        isPublic: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Sample donations created');

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - PRODUCT CATEGORIES
  // ─────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.productCategory.upsert({
      where: { id: 'cat-food' },
      update: {},
      create: {
        id: 'cat-food',
        name: 'Yemekler',
        icon: '🍽️',
        order: 1,
        dealerId: null, // Global kategori
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-drinks' },
      update: {},
      create: {
        id: 'cat-drinks',
        name: 'İçecekler',
        icon: '🥤',
        order: 2,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-desserts' },
      update: {},
      create: {
        id: 'cat-desserts',
        name: 'Tatlılar',
        icon: '🍰',
        order: 3,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-coffee' },
      update: {},
      create: {
        id: 'cat-coffee',
        name: 'Kahveler',
        icon: '☕',
        order: 4,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-snacks' },
      update: {},
      create: {
        id: 'cat-snacks',
        name: 'Atıştırmalıklar',
        icon: '🍿',
        order: 5,
        dealerId: null,
      },
    }),
  ]);

  console.log('✅ Product categories created:', categories.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - PRODUCTS
  // ─────────────────────────────────────────────────────────────
  const products = await Promise.all([
    // Yemekler
    prisma.product.upsert({
      where: { id: 'prod-burger' },
      update: {},
      create: {
        id: 'prod-burger',
        name: 'Klasik Burger',
        description: 'Dana köfte, marul, domates, turşu',
        price: 180,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-pizza' },
      update: {},
      create: {
        id: 'prod-pizza',
        name: 'Karışık Pizza',
        description: 'Sucuk, sosis, mantar, biber, mozzarella',
        price: 220,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-pasta' },
      update: {},
      create: {
        id: 'prod-pasta',
        name: 'Fettuccine Alfredo',
        description: 'Kremalı makarna, parmesan',
        price: 160,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    // İçecekler
    prisma.product.upsert({
      where: { id: 'prod-cola' },
      update: {},
      create: {
        id: 'prod-cola',
        name: 'Kola',
        description: '330ml',
        price: 35,
        categoryId: 'cat-drinks',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-lemonade' },
      update: {},
      create: {
        id: 'prod-lemonade',
        name: 'Ev Yapımı Limonata',
        description: 'Taze sıkılmış',
        price: 45,
        categoryId: 'cat-drinks',
        dealerId: dealer.id,
      },
    }),
    // Kahveler
    prisma.product.upsert({
      where: { id: 'prod-latte' },
      update: {},
      create: {
        id: 'prod-latte',
        name: 'Caffè Latte',
        description: 'Espresso + süt köpüğü',
        price: 55,
        categoryId: 'cat-coffee',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-americano' },
      update: {},
      create: {
        id: 'prod-americano',
        name: 'Americano',
        description: 'Double shot espresso + su',
        price: 45,
        categoryId: 'cat-coffee',
        dealerId: dealer.id,
      },
    }),
    // Tatlılar
    prisma.product.upsert({
      where: { id: 'prod-cheesecake' },
      update: {},
      create: {
        id: 'prod-cheesecake',
        name: 'San Sebastian Cheesecake',
        description: 'Yanık cheesecake',
        price: 85,
        categoryId: 'cat-desserts',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-brownie' },
      update: {},
      create: {
        id: 'prod-brownie',
        name: 'Brownie',
        description: 'Dondurma ile servis',
        price: 75,
        categoryId: 'cat-desserts',
        dealerId: dealer.id,
      },
    }),
  ]);

  console.log('✅ Products created:', products.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - DEMO CARDS
  // ─────────────────────────────────────────────────────────────
  const demoCardBatch = await prisma.cardBatch.upsert({
    where: { id: 'batch-demo' },
    update: {},
    create: {
      id: 'batch-demo',
      name: 'Demo Kartlar - Ocak 2024',
      quantity: 5,
      prefix: 'DEMO',
      createdById: admin.id,
    },
  });

  console.log('✅ Card batch created:', demoCardBatch.name);

  // Demo kartlar - 1 aktive edilmiş (müşteriye bağlı), 2 boş, 1 bloklu
  const demoCards = await Promise.all([
    // Müşteriye bağlı aktif kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-1' },
      update: {},
      create: {
        id: 'card-demo-1',
        token: 'DEMO_AktifKartToken12345',
        batchId: demoCardBatch.id,
        status: CardStatus.ACTIVATED,
        customerId: customer.id,
        activatedAt: new Date(),
      },
    }),
    // Boş kartlar (aktivasyon bekliyor)
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-2' },
      update: {},
      create: {
        id: 'card-demo-2',
        token: 'DEMO_BosKartToken123456',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-3' },
      update: {},
      create: {
        id: 'card-demo-3',
        token: 'DEMO_BosKartToken789012',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
    // Bloklanmış kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-4' },
      update: {},
      create: {
        id: 'card-demo-4',
        token: 'DEMO_BlokluKartToken345',
        batchId: demoCardBatch.id,
        status: CardStatus.BLOCKED,
        blockedAt: new Date(),
        blockReason: 'Demo bloklu kart - test amaçlı',
      },
    }),
    // Test için sabit token'lı kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-5' },
      update: {},
      create: {
        id: 'card-demo-5',
        token: 'TEST123',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
  ]);

  console.log('✅ Physical cards created:', demoCards.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - DEMO CONSUMPTION
  // ─────────────────────────────────────────────────────────────
  const demoConsumption = await prisma.consumption.upsert({
    where: { id: 'consumption-demo-1' },
    update: {},
    create: {
      id: 'consumption-demo-1',
      cardId: 'card-demo-1',
      customerId: customer.id,
      dealerId: dealer.id,
      productId: 'prod-latte',
      amount: 55,
      note: 'Demo tüketim kaydı',
    },
  });

  console.log('✅ Demo consumption created:', demoConsumption.id);

  // Demo consumption review
  await prisma.consumptionReview.upsert({
    where: { id: 'review-demo-1' },
    update: {},
    create: {
      id: 'review-demo-1',
      consumptionId: demoConsumption.id,
      customerId: customer.id,
      rating: 5,
      text: 'Harika bir latte! Kahve çekirdekleri çok kaliteli.',
      dimensions: {
        taste: 5,
        service: 5,
        ambiance: 4,
        value: 4,
      },
    },
  });

  console.log('✅ Demo consumption review created');

  // Card audit log örneği
  await prisma.cardAuditLog.createMany({
    data: [
      {
        cardId: 'card-demo-1',
        userId: customer.id,
        action: 'ACTIVATED',
        metadata: { source: 'seed' },
      },
      {
        cardId: 'card-demo-1',
        userId: dealer.id,
        action: 'CONSUMPTION_ADDED',
        metadata: { consumptionId: demoConsumption.id },
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Card audit logs created');

  // ─────────────────────────────────────────────────────────────
  // CREATE VIP TIERS
  // ─────────────────────────────────────────────────────────────
  const vipTiers = [
    {
      name: 'Bronze',
      minPoints: 0,
      multiplier: 1.0,
      benefits: [
        { type: 'points', label: '1x puan kazanımı' },
        { type: 'access', label: 'Temel ödüllere erişim' },
      ],
      color: '#CD7F32',
      icon: '🥉',
      order: 1,
    },
    {
      name: 'Silver',
      minPoints: 1000,
      multiplier: 1.25,
      benefits: [
        { type: 'points', label: '1.25x puan kazanımı' },
        { type: 'access', label: 'Özel ödüllere erişim' },
        { type: 'support', label: 'Öncelikli destek' },
      ],
      color: '#C0C0C0',
      icon: '🥈',
      order: 2,
    },
    {
      name: 'Gold',
      minPoints: 5000,
      multiplier: 1.5,
      benefits: [
        { type: 'points', label: '1.5x puan kazanımı' },
        { type: 'access', label: 'Premium ödüllere erişim' },
        { type: 'support', label: 'VIP destek' },
        { type: 'exclusive', label: 'Özel kampanyalar' },
      ],
      color: '#FFD700',
      icon: '🥇',
      order: 3,
    },
    {
      name: 'Platinum',
      minPoints: 15000,
      multiplier: 2.0,
      benefits: [
        { type: 'points', label: '2x puan kazanımı' },
        { type: 'access', label: 'Tüm ödüllere erişim' },
        { type: 'support', label: 'Kişisel hesap yöneticisi' },
        { type: 'exclusive', label: 'Özel etkinlikler' },
        { type: 'gift', label: 'Yıllık hediye' },
      ],
      color: '#E5E4E2',
      icon: '💎',
      order: 4,
    },
  ];

  for (const tier of vipTiers) {
    await prisma.vIPTier.upsert({
      where: { name: tier.name },
      update: tier,
      create: tier,
    });
  }
  console.log('✅ VIP tiers created:', vipTiers.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE HAPPY HOURS
  // ─────────────────────────────────────────────────────────────
  await prisma.happyHour.upsert({
    where: { id: 'hh-lunch-special' },
    update: {},
    create: {
      id: 'hh-lunch-special',
      dealerId: dealer.id,
      name: 'Öğle Yemeği Bonusu',
      description: 'Öğle saatlerinde ekstra puan kazan!',
      multiplier: 1.5,
      startTime: '12:00',
      endTime: '14:00',
      daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      isActive: true,
    },
  });

  await prisma.happyHour.upsert({
    where: { id: 'hh-weekend-special' },
    update: {},
    create: {
      id: 'hh-weekend-special',
      dealerId: null, // Global
      name: 'Hafta Sonu Çılgınlığı',
      description: 'Hafta sonu tüm gün 2x puan!',
      multiplier: 2.0,
      startTime: '10:00',
      endTime: '22:00',
      daysOfWeek: [0, 6], // Sat-Sun
      isActive: true,
    },
  });

  console.log('✅ Happy hours created');

  // ─────────────────────────────────────────────────────────────
  // CREATE CUSTOMER STREAK
  // ─────────────────────────────────────────────────────────────
  await prisma.userStreak.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
      currentStreak: 5,
      longestStreak: 12,
      lastActivityAt: new Date(),
      totalActiveDays: 45,
      streakFreezes: 2,
    },
  });
  console.log('✅ User streak created');

  // ─────────────────────────────────────────────────────────────
  // CREATE REFERRAL CODE
  // ─────────────────────────────────────────────────────────────
  await prisma.referralCode.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
      code: 'DEMO2024',
      usageCount: 3,
    },
  });
  console.log('✅ Referral code created: DEMO2024');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📧 Login credentials:');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │ Admin:    admin@qratex.com / Admin123! │');
  console.log('   │ Dealer:   dealer@qratex.com / Dealer123!│');
  console.log('   │ Customer: customer@qratex.com / Customer123!│');
  console.log('   └─────────────────────────────────────────┘');
  console.log('');
  console.log('🎴 Demo Cards:');
  console.log('   ┌─────────────────────────────────────────────────────┐');
  console.log('   │ Aktif Kart:  /c/DEMO_AktifKartToken12345 (müşteriye bağlı) │');
  console.log('   │ Boş Kart 1:  /c/DEMO_BosKartToken123456 (aktivasyon bekliyor) │');
  console.log('   │ Boş Kart 2:  /c/DEMO_BosKartToken789012 (aktivasyon bekliyor) │');
  console.log('   │ Test Kart:   /c/TEST123 (kısa test token)  │');
  console.log('   │ Bloklu Kart: /c/DEMO_BlokluKartToken345 (bloklanmış) │');
  console.log('   └─────────────────────────────────────────────────────┘');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
