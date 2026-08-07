/**
 * Mini oyunların KİŞİLİK metinleri. Önceden GameShell tüm oyunlar için aynı
 * sabit metni gösteriyordu ("▶ Oyna", "Kazandın! 🎉", "Bu sefer olmadı",
 * "Yarın yeni bir hak için tekrar gel") → 20 oyun aynı hissi veriyordu.
 *
 * Burada her oyuna kendi evrenine uygun ses tonu verilir. Kazanma/kaybetme
 * başlıkları DİZİ → her oynayışta `pickVariant` ile rastgele biri seçilir, aynı
 * oyun bile her seferinde farklı his bırakır. Eksik alanlar GameShell'deki
 * varsayılana düşer (geriye uyumlu).
 */

export interface GameCopy {
  /** Başlat butonu metni (emoji + kısa, oyunun diline uygun). */
  startCta?: string;
  /** Başlangıç ekranındaki küçük ipucu/teşvik şeridi. */
  startHint?: string;
  /** Yükleniyor (oyun açılırken) metni. */
  loadingStart?: string;
  /** Yükleniyor (sonuç gönderilirken) metni. */
  loadingSubmit?: string;
  /** KAZANMA başlığı varyasyonları (rastgele biri). */
  winTitles?: string[];
  /** KAYBETME başlığı varyasyonları (rastgele biri). */
  loseTitles?: string[];
  /** Ödül kazanılamadığında (kazandı ama eşik altı) alt satır. */
  rewardMissNote?: string;
  /** Sonuç ekranının kapanış satırı (yarın tekrar gel hissi, temaya uygun). */
  comeBackNote?: string;
  /** "Bugün zaten oynandı" başlığı. */
  lockedTitle?: string;
  /** "Bugün zaten oynandı" alt satırı. */
  lockedNote?: string;
  /** Skor etiketinin önündeki kelime ("Skorun" yerine temaya uygun). */
  scoreLabel?: string;
}

/**
 * gameType → kişilik metinleri. Pacman dahil tüm oyunlar kapsanır.
 * Her oyunun tonu farklı: dedektif soruşturur, yılan arcade konuşur,
 * troll avcısı savaşır, muhafız korur…
 */
export const GAME_COPY: Record<string, GameCopy> = {
  pacman: {
    startCta: '👾 Labirente Dal',
    startHint: 'Günde 1 tur — 5 yıldızı topla, hayaletlere yem olma!',
    winTitles: ['Labirent Senin! 🌟', 'Tüm Yıldızlar Toplandı!', 'Hayaletler Geride Kaldı!'],
    loseTitles: ['Hayalet Yakaladı! 👻', 'Labirentte Kayboldun', 'Bir Dahaki Tura…'],
    scoreLabel: 'Yıldız',
    comeBackNote: 'Labirent yarın yeniden kuruluyor. 🌙',
  },
  'mind-thief': {
    startCta: '🧠 Zihne Sız',
    startHint: 'Bozuk yorumları yok et, ağ enfekte olmadan. Patron her seviyede güçleniyor!',
    loadingStart: 'Sinir ağına bağlanılıyor…',
    winTitles: ['Zihin Temizlendi! 🧠', 'Patron Devrildi!', 'Ağ Kurtarıldı!'],
    loseTitles: ['Ağ Enfekte Oldu ☣️', 'Patron Seni Yendi', 'Zihin Ele Geçti'],
    scoreLabel: 'Temizlik',
    comeBackNote: 'Yeni bir zihin yarın enfekte olacak. 🌙',
  },
  'truth-vs-fake': {
    startCta: '⚖️ Kararı Ver',
    startHint: '45 saniye, sağa-sola kaydır: gerçek mi sahte mi? Komboyu kaçırma!',
    winTitles: ['Adalet Yerini Buldu! ⚖️', 'Keskin Göz!', 'Sahteler Elendi!'],
    loseTitles: ['Yanıldın ⚖️', 'Sahte Seni Kandırdı', 'Karar Hatalıydı'],
    scoreLabel: 'Doğru karar',
    comeBackNote: 'Yeni davalar yarın masanda. 🌙',
  },
  'bot-hunter': {
    startCta: '🛰️ Taramayı Başlat',
    startHint: 'Radar dolmadan botları yakala, gerçek kullanıcıları koru!',
    loadingStart: 'Radar kalibre ediliyor…',
    winTitles: ['Tüm Botlar Avlandı! 🛰️', 'Ağ Temiz!', 'Avcı Gözü Şahin!'],
    loseTitles: ['Botlar Sızdı 🤖', 'Radar Yetmedi', 'Av Kaçtı'],
    scoreLabel: 'Yakalanan',
    comeBackNote: 'Yeni bot dalgası yarın geliyor. 🛰️',
  },
  'review-detective': {
    startCta: '🕵️ Dosyayı Aç',
    startHint: 'Elit dedektif ol: sahte/yapay yorumu bul. Süre daraldıkça ipuçları azalır!',
    loadingStart: 'Dosya inceleniyor…',
    winTitles: ['Dava Çözüldü! 🕵️', 'Sahtekâr İfşa!', 'Dedektif Sezgisi!'],
    loseTitles: ['İz Soğudu 🔍', 'Sahtekâr Kaçtı', 'Yanlış Şüpheli'],
    scoreLabel: 'Çözülen dosya',
    comeBackNote: 'Yeni bir dava yarın masanda. 🕵️',
  },
  'spam-defense': {
    startCta: '🛡️ Savunmaya Geç',
    startHint: 'Çekirdeği spam dalgalarından koru! Botlara ateş et, dalgalar zorlaşıyor.',
    loadingStart: 'Kalkanlar yükseliyor…',
    winTitles: ['Çekirdek Korundu! 🛡️', 'Dalga Püskürtüldü!', 'Hat Tutuldu!'],
    loseTitles: ['Çekirdek Düştü 💥', 'Savunma Yarıldı', 'Spam Aştı'],
    scoreLabel: 'Vuruş',
    comeBackNote: 'Yeni dalga yarın çekirdeğe yürüyor. 🛡️',
  },
  'data-miner': {
    startCta: '⛏️ Kazmaya Başla',
    startHint: 'Küpleri aç, değerli veriyi bul — ama bazılarında bot tuzağı var! Risk senin.',
    loadingStart: 'Maden taranıyor…',
    winTitles: ['Cevher Vurdun! ⛏️', 'Veri Hazinesi!', 'Zengin Damar!'],
    loseTitles: ['Tuzağa Düştün 💣', 'Damar Kurudu', 'Bot Patladı'],
    scoreLabel: 'Çıkarılan veri',
    comeBackNote: 'Yeni damarlar yarın açılıyor. ⛏️',
  },
  'guardian-of-trust': {
    startCta: '✨ Kalkanı Kaldır',
    startHint: 'Düşen olumlu yorumları bozuk yorumlar enfekte etmeden koru!',
    winTitles: ['Güven Korundu! ✨', 'Kalkan Aşılmadı!', 'Muhafız Görevi Tamam!'],
    loseTitles: ['Enfeksiyon Yayıldı ☣️', 'Kalkan Çöktü', 'Güven Sarsıldı'],
    scoreLabel: 'Korunan',
    comeBackNote: 'Yeni yorumlar yarın gökten düşüyor. ✨',
  },
  'troll-slayer': {
    startCta: '⚔️ Arenaya Çık',
    startHint: 'Troll dalgalarıyla savaş! Dokun ve yok et, mümkün olduğunca uzun dayan.',
    loadingStart: 'Arena hazırlanıyor…',
    winTitles: ['Arena Fethedildi! ⚔️', 'Troller Biçildi!', 'Şampiyon Sensin!'],
    loseTitles: ['Troller Bastı 💀', 'Arena Düştü', 'Kılıç Kırıldı'],
    scoreLabel: 'Devrilen troll',
    comeBackNote: 'Yeni troll ordusu yarın geliyor. ⚔️',
  },
  'network-defender': {
    startCta: '🌐 Ağı Savun',
    startHint: 'Düğümlere dokun, yayılan kötü sinyali durdur! Tüm ağ sarılmadan temizle.',
    loadingStart: 'Ağ haritası yükleniyor…',
    winTitles: ['Ağ Temizlendi! 🌐', 'Sinyal Durduruldu!', 'Bağlantı Güvende!'],
    loseTitles: ['Ağ Çöktü 📡', 'Sinyal Yayıldı', 'Düğümler Düştü'],
    scoreLabel: 'Temizlenen düğüm',
    comeBackNote: 'Yeni bir ağ yarın tehdit altında. 🌐',
  },
  'combo-tap': {
    startCta: '🎯 Refleksi Test Et',
    startHint: 'Beliren yıldızlara hızla dokun, komboyu kaçırma! Üst üste vur, puanı katla.',
    winTitles: ['Kusursuz Ritim! 🎯', 'Kombo Ustası!', 'Şimşek Refleks!'],
    loseTitles: ['Ritim Kaçtı 🎯', 'Kombo Bozuldu', 'Bir Tık Geç'],
    scoreLabel: 'Kombo',
    comeBackNote: 'Yeni ritim yarın başlıyor. 🎯',
  },
  'memory-match': {
    startCta: '🃏 Kartları Çevir',
    startHint: 'Eşleşen emoji çiftlerini bul! En az hamlede tüm çiftleri topla.',
    winTitles: ['Tüm Çiftler Bulundu! 🃏', 'Fil Hafızası!', 'Kusursuz Eşleşme!'],
    loseTitles: ['Hamleler Tükendi 🃏', 'Çiftler Karıştı', 'Hafıza Yanılttı'],
    scoreLabel: 'Eşleşme',
    comeBackNote: 'Kartlar yarın yeniden karılıyor. 🃏',
  },
  'speed-order': {
    startCta: '⚡ Sıralamaya Başla',
    startHint: "Rakamlara 1'den başlayarak sırayla dokun! Süre tükenmeden yakala.",
    winTitles: ['Yıldırım Hızı! ⚡', 'Kusursuz Sıra!', 'Hız Rekoru!'],
    loseTitles: ['Süre Bitti ⚡', 'Sıra Şaştı', 'Bir Saniye Geç'],
    scoreLabel: 'Sıra',
    comeBackNote: 'Yeni sıralama yarın seni bekliyor. ⚡',
  },
  'lucky-wheel': {
    startCta: '🎰 Çarkı Çevir',
    startHint: 'Çarkı doğru anda durdur! Yeşil bölgeyi yakala, riskli dilimlerden kaç.',
    winTitles: ['Jackpot! 🎰', 'Şans Seninle!', 'Tam İsabet!'],
    loseTitles: ['Şans Yaver Gitmedi 🎰', 'Kıl Payı Kaçtı', 'Çark Döndü, Durdu'],
    scoreLabel: 'Kazanç',
    comeBackNote: 'Çark yarın yeniden dönecek. 🎰',
  },
  'word-spot': {
    startCta: '🧩 Gözünü Aç',
    startHint: 'Izgaradaki FARKLI/sahte kelimeyi bul! Turlar hızlanıyor, dikkatini topla.',
    winTitles: ['Keskin Göz! 🧩', 'Sahte Yakalandı!', 'Hiçbiri Kaçmadı!'],
    loseTitles: ['Sahte Saklandı 🧩', 'Göz Yanıldı', 'Bir Kelime Kaçtı'],
    scoreLabel: 'Bulunan',
    comeBackNote: 'Yeni ızgara yarın hazır. 🧩',
  },
  'data-snake': {
    startCta: '🐍 Yılanı Sür',
    startHint: 'Veri paketlerini yut, büyü! Bot duvarlarından ve kendi kuyruğundan kaç.',
    winTitles: ['Devasa Yılan! 🐍', 'Veri Canavarı!', 'Sınırı Aştın!'],
    loseTitles: ['Kuyruğa Çarptın 🐍', 'Duvara Toslandı', 'Yılan Düğümlendi'],
    scoreLabel: 'Yutulan veri',
    comeBackNote: 'Yılan yarın yeniden acıkacak. 🐍',
  },
  'review-stack': {
    startCta: '🧱 İstifle',
    startHint: 'Düşen yorum bloklarını döndürüp diz! Satır dolarsa onaylanır ve temizlenir.',
    winTitles: ['Kusursuz İstif! 🧱', 'Satırlar Temizlendi!', 'Mimar Eli!'],
    loseTitles: ['Yığın Devrildi 🧱', 'Tavan Doldu', 'Blok Sıkıştı'],
    scoreLabel: 'Dizilen',
    comeBackNote: 'Yeni bloklar yarın düşüyor. 🧱',
  },
  'trust-merge': {
    startCta: '🔢 Birleştir',
    startHint: 'Aynı güven rozetlerini kaydırıp birleştir! 2 → 4 → 8… en yükseğe taşı.',
    winTitles: ['Zirve Rozet! 🔢', 'Mükemmel Birleşim!', 'Güven Tavan Yaptı!'],
    loseTitles: ['Tahta Doldu 🔢', 'Hamle Kalmadı', 'Rozetler Sıkıştı'],
    scoreLabel: 'En yüksek rozet',
    comeBackNote: 'Tahta yarın sıfırlanıyor. 🔢',
  },
  'signal-pipe': {
    startCta: '🔧 Hattı Kur',
    startHint: 'Boruları döndür, QR sinyalini kaynaktan sunucuya ulaştır! Akışı tamamla.',
    winTitles: ['Sinyal Bağlandı! 🔧', 'Hat Kesintisiz!', 'Akış Tamam!'],
    loseTitles: ['Hat Koptu 🔧', 'Sinyal Kayboldu', 'Boru Tıkandı'],
    scoreLabel: 'Bağlanan hat',
    comeBackNote: 'Yeni hat yarın kurulmayı bekliyor. 🔧',
  },
  'spam-breaker': {
    startCta: '🧊 Topu Sek',
    startHint: 'Kalkanı kaydır, topu sektir, spam tuğlalarını kır! Çekirdeği koru.',
    winTitles: ['Tahta Kırıldı! 🧊', 'Tüm Spam Temiz!', 'Kusursuz Sekiş!'],
    loseTitles: ['Top Kaçtı 🧊', 'Çekirdek Açıldı', 'Kalkan Yetişemedi'],
    scoreLabel: 'Kırılan tuğla',
    comeBackNote: 'Yeni tahta yarın diziliyor. 🧊',
  },
  'frost-catcher': {
    startCta: '❄️ Eldiveni Tak',
    startHint: 'Eldiveni kaydır, düşen kar tanelerini yakala! Kombo yap, altın kristali kaçırma.',
    loadingStart: 'Kar fırtınası hazırlanıyor…',
    winTitles: ['Buzul Ustası! ❄️', 'Kar Fırtınası Fethedildi!', 'Kusursuz Yakalayış!'],
    loseTitles: ['Buz Eridi 💧', 'Kar Elinden Kaçtı', 'Fırtına Bastırdı'],
    scoreLabel: 'Yakalanan',
    comeBackNote: 'Kar yarın yeniden yağacak. ❄️',
  },
};

/** Deterministik olmayan ama tek seçim: bir varyant dizisinden rastgele biri. */
export function pickVariant(arr: string[] | undefined, fallback: string): string {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** gameType → kişilik metinleri (yoksa boş obje → GameShell varsayılanları). */
export function getGameCopy(gameType: string): GameCopy {
  return GAME_COPY[gameType] ?? {};
}
