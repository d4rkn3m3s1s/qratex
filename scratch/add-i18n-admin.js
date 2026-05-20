const fs = require('fs');

function addTranslations(filePath, newKeys) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);
    
    // Add keys to root
    for (const [key, value] of Object.entries(newKeys)) {
      if (!json[key]) {
        json[key] = value;
      } else {
        json[key] = { ...json[key], ...value };
      }
    }
    
    fs.writeFileSync(filePath, JSON.stringify(json, null, 4));
    console.log(`Updated ${filePath}`);
  } catch (err) {
    console.error(`Error updating ${filePath}:`, err);
  }
}

const trKeys = {
  adminSquadBattles: {
    title: "Klan Savaşları",
    description: "Aktif ve geçmiş klan (squad) savaşlarını yönetin.",
    createBattle: "Yeni Savaş Başlat",
    refresh: "Yenile",
    newBattle: "Yeni Savaş",
    squad1: "1. Klan (Squad 1)",
    squad2: "2. Klan (Squad 2)",
    selectSquad: "Klan Seçin",
    startTime: "Başlangıç Zamanı",
    endTime: "Bitiş Zamanı",
    rewardPool: "Ödül Havuzu (Puan)",
    cancel: "İptal",
    create: "Oluştur",
    creating: "Oluşturuluyor...",
    activeBattles: "Aktif Savaşlar",
    noActiveBattles: "Şu an devam eden savaş yok.",
    start: "Başlangıç",
    end: "Bitiş",
    statusPending: "Bekliyor",
    statusActive: "Aktif",
    statusCompleted: "Tamamlandı",
    finishBattle: "Savaşı Bitir",
    pastBattles: "Geçmiş Savaşlar",
    noPastBattles: "Geçmiş savaş kaydı bulunamadı.",
    winner: "Kazanan",
    draw: "Berabere",
    loadError: "Veriler yüklenemedi",
    sameSquadError: "Aynı klan kendiyle savaşamaz",
    battleCreated: "Savaş planlandı",
    createFailed: "Savaş oluşturulamadı",
    confirmFinish: "Savaşı bitirmek ve ödülleri dağıtmak istediğinize emin misiniz?",
    battleFinished: "Savaş tamamlandı ve ödüller dağıtıldı!",
    finishFailed: "Savaş tamamlanamadı",
    genericError: "Bir hata oluştu"
  },
  adminGamificationSettings: {
    title: "Oyunlaştırma Ayarları",
    description: "Platform genelindeki XP, Puan ve Sezon parametrelerini yönetin.",
    save: "Kaydet",
    saving: "Kaydediliyor...",
    multipliers: "Ekonomi Çarpanları",
    multipliersDesc: "Kazanılan XP ve Puan miktarlarını global olarak artırın veya azaltın.",
    xpMultiplier: "XP Çarpanı (Global)",
    pointMultiplier: "Puan Çarpanı (Global)",
    limitsAndRewards: "Günlük Limitler & Ödüller",
    limitsAndRewardsDesc: "Suistimali önlemek için günlük tavan değerlerini belirleyin.",
    dailyXpCap: "Günlük Maksimum XP",
    levelUpRewardBase: "Level Up Puan Ödülü (Taban)",
    seasonManagement: "Sezon Yönetimi",
    seasonManagementDesc: "Aktif sezonu ve bitiş tarihlerini ayarlayın.",
    seasonName: "Sezon Adı",
    seasonNamePlaceholder: "Örn: Kış Sezonu 2024",
    seasonEndsAt: "Sezon Bitiş Tarihi",
    isSeasonActive: "Sezon Aktif mi?",
    isSeasonActiveDesc: "Kapalıysa sezon ödülleri ve sıralamaları dondurulur.",
    loadError: "Ayarlar yüklenemedi",
    saveSuccess: "Ayarlar kaydedildi",
    saveFailed: "Ayarlar kaydedilemedi",
    genericError: "Bir hata oluştu"
  }
};

const enKeys = {
  adminSquadBattles: {
    title: "Squad Battles",
    description: "Manage active and past squad battles.",
    createBattle: "Start New Battle",
    refresh: "Refresh",
    newBattle: "New Battle",
    squad1: "Squad 1",
    squad2: "Squad 2",
    selectSquad: "Select Squad",
    startTime: "Start Time",
    endTime: "End Time",
    rewardPool: "Reward Pool (Points)",
    cancel: "Cancel",
    create: "Create",
    creating: "Creating...",
    activeBattles: "Active Battles",
    noActiveBattles: "No active battles at the moment.",
    start: "Start",
    end: "End",
    statusPending: "Pending",
    statusActive: "Active",
    statusCompleted: "Completed",
    finishBattle: "Finish Battle",
    pastBattles: "Past Battles",
    noPastBattles: "No past battle records found.",
    winner: "Winner",
    draw: "Draw",
    loadError: "Failed to load data",
    sameSquadError: "A squad cannot battle itself",
    battleCreated: "Battle scheduled",
    createFailed: "Failed to create battle",
    confirmFinish: "Are you sure you want to finish the battle and distribute rewards?",
    battleFinished: "Battle completed and rewards distributed!",
    finishFailed: "Failed to finish battle",
    genericError: "An error occurred"
  },
  adminGamificationSettings: {
    title: "Gamification Settings",
    description: "Manage platform-wide XP, Points, and Season parameters.",
    save: "Save",
    saving: "Saving...",
    multipliers: "Economy Multipliers",
    multipliersDesc: "Globally increase or decrease earned XP and Points amounts.",
    xpMultiplier: "XP Multiplier (Global)",
    pointMultiplier: "Points Multiplier (Global)",
    limitsAndRewards: "Daily Limits & Rewards",
    limitsAndRewardsDesc: "Set daily caps to prevent abuse.",
    dailyXpCap: "Daily Maximum XP",
    levelUpRewardBase: "Level Up Point Reward (Base)",
    seasonManagement: "Season Management",
    seasonManagementDesc: "Set active season and end dates.",
    seasonName: "Season Name",
    seasonNamePlaceholder: "e.g., Winter Season 2024",
    seasonEndsAt: "Season End Date",
    isSeasonActive: "Is Season Active?",
    isSeasonActiveDesc: "If disabled, season rewards and rankings are frozen.",
    loadError: "Failed to load settings",
    saveSuccess: "Settings saved",
    saveFailed: "Failed to save settings",
    genericError: "An error occurred"
  }
};

addTranslations('./messages/tr.json', trKeys);
addTranslations('./messages/en.json', enKeys);
