# /customer/progress-hub

**Amaç:** Müşterinin seviye/XP, puan bakiyesi, aktivite sayıları, aktif görevler ve son rozetlerini tek ekranda özetleyen “Gelişim merkezi”. Sidebar’da “Analizler” grubunda (`components/dashboard/sidebar.tsx:288`) ve Keşfet sayfasının “Kazan” bölümünde (`app/customer/discover/page.tsx:34`) yer alır.

**Genel puan: 4/10** · **Karar: birleştir** (müşteri ana paneli `components/customer/dashboard/customer-dashboard.tsx` ile aynı API’yi ve aynı bölümleri kopyalıyor; tek, kanonik bir “İlerleme” ekranında birleştirilip yeniden tasarlanmalı)

> Doğrulama notu: Kod salt okunur incelendi; DB/dev server çalıştırılmadı. Görev ilerleme çubuğunun 0 genişlikte çizildiği iddiası, aynı DOM/CSS yapısının sistem Chrome’unda headless olarak ölçülmesiyle doğrulandı (`wrap=0 root=0`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Veri gerçek ama XP ilerlemesi 2. seviyeden itibaren yanlış hesaplanıyor, görev çubukları görünmüyor, rozet ikonları dosya yolu olarak metin basılıyor. |
| UX | 4/10 | Sayfa yalnızca okunur bir “sayaç panosu”; hiçbir kart aksiyona götürmüyor (bekleyen yorum, tamamlanmış görev claim’i yok), alt link şeridi bağlamsız. |
| Görsel | 4/10 | Düz shadcn kartları; oyunlaştırma sayfası için ödül hissi, hiyerarşi ve rozet görselleri yok — rozet sayfasındaki zengin SVG görsellerin yerine yazı çipleri var. |
| Mimari | 4/10 | Seviye ilerlemesi için sistemde 3 farklı formül var; sayfa 11 sorgu yapan genel amaçlı `/api/customer/stats`’i kullanıp çıktının ~%30’unu tüketiyor; modül kapısı sayfada/API’de uygulanmıyor. |
| Performans | 6/10 | Tek istek, `Promise.all` paralel; ancak 200 kart + 5 son tüketim + 5 son feedback gibi kullanılmayan veriler çekiliyor, istemci tarafı waterfall (hidrasyon → fetch). |
| Erişilebilirlik + mobil | 5/10 | Mobilde düzgün yığılıyor; fakat `Progress` bileşeni `value`’yu Radix’e geçirmediği için tüm çubuklar ekran okuyucuya “belirsiz” bildiriliyor; spinner `motion-reduce` korumasız. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/progress-hub/layout.tsx:4-6` | i18n anahtarları TR/EN mevcut. |
| 2 | Rol koruması (CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-73`, `app/api/customer/stats/route.ts:10-11` | API `session.user.id` kullanıyor; IDOR yok. |
| 3 | Modül kapısı (`progress_hub`) | KISMİ | `lib/module-controls.ts:27`, `components/dashboard/sidebar.tsx:450-454` | Yalnızca sidebar öğesi gizleniyor; sayfa ve API kapatılmış modülde de URL ile açılıyor; `assertModuleEnabled` çağrılmıyor. |
| 4 | Sidebar girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:288` | |
| 5 | Keşfet sayfası linki | ÇALIŞIYOR | `app/customer/discover/page.tsx:34` | Modül kapalıyken de link görünür (doğrulanmadı: discover filtrelemesi okunmadı). |
| 6 | Hero (eyebrow/başlık/alt başlık/ikon) | ÇALIŞIYOR | `page.tsx:77-83` | |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:85-89` | Ortalanmış spinner; skeleton değil, içerik gelince düzen sıçrıyor. |
| 8 | Hata durumu | KISMİ | `page.tsx:90-91` | Tek satır metin; “Tekrar dene” yok, 401/403/500 ayrımı yok. |
| 9 | Fetch iptal koruması | ÇALIŞIYOR | `page.tsx:49-67` | `cancelled` bayrağı; unmount sonrası setState yok. |
| 10 | Seviye numarası | ÇALIŞIYOR | `page.tsx:106` | DB’deki `user.level` (geometrik `calculateLevel` ile yazılıyor, `lib/points-wallet.ts:46`). |
| 11 | Puan değeri | KISMİ | `page.tsx:109-110`, `messages/tr.json` → `pointsLabel: "Toplam puan"` | `user.points` harcanabilir bakiye (`lib/points-wallet.ts` decrement); “Toplam puan” etiketi yanıltıcı. |
| 12 | XP ilerleme çubuğu | BOZUK | `page.tsx:71,120`, `app/api/customer/stats/route.ts:86-90` | Doğrusal formül (seviye başına 1000 XP) ile geometrik seviye sistemi (`lib/utils.ts:94-106`) uyuşmuyor; Seviye 4+’te çubuk hep %100. |
| 13 | XP metni “x / y” | BOZUK | `page.tsx:116-118` | Aynı nedenle “1.750 / 1.000” gibi imkânsız değerler. |
| 14 | Progress erişilebilirliği | BOZUK | `components/ui/progress.tsx:16-24` | `value` destructure edilip Radix Root’a geçirilmiyor → `aria-valuenow` yok, `data-state="indeterminate"`. |
| 15 | Geri bildirim sayısı | ÇALIŞIYOR | `route.ts:22,153`, `page.tsx:133` | QR feedback + ConsumptionReview toplamı. |
| 16 | Rozet sayısı | ÇALIŞIYOR | `route.ts:23`, `page.tsx:137` | |
| 17 | Tüketim sayısı | KISMİ | `route.ts:51-76`, `page.tsx:141` | Kart sistemi sorgusu hata verirse `console.log` ile yutulup 0 gösteriliyor; kullanıcı yanlış “0” görür. |
| 18 | Bekleyen yorum sayısı | KISMİ | `route.ts:145`, `page.tsx:144-145` | Değer doğru; ama tıklanamaz — `/customer/consumptions` “pending” filtresine götürmüyor. |
| 19 | Aktif görev seçimi | KISMİ | `route.ts:24-28` | `isActive`/`expiresAt` filtresi yok, `orderBy` yok (rastgele 5), `progress>=target` ama claim edilmemiş görevler de “aktif” listede. |
| 20 | “Tamamlanmaya yakın olanları önceleyin” vaadi | KISMİ | `messages/tr.json` `questsHint`, `route.ts:24-28` | Metin önceliklendirme vaat ediyor; ne API ne sayfa sıralıyor. |
| 21 | Görev ilerleme çubuğu | BOZUK | `page.tsx:176`, `components/ui/progress.tsx:17` | `flex-1` iç Root’a gidiyor, flex öğesi olan sarmalayıcı `div.relative`’in genişliği 0 → çubuk görünmüyor (headless Chrome ile ölçüldü). |
| 22 | Görev sayaç metni | ÇALIŞIYOR | `page.tsx:177-179` | `nf` ile formatlanmıyor; `5/3` gibi taşmalar olduğu gibi yazılıyor. |
| 23 | Görev boş durumu | ÇALIŞIYOR | `page.tsx:167-168` | Sadece metin; aksiyon yok. |
| 24 | “Tüm görevler” linki | ÇALIŞIYOR | `page.tsx:161-164` | `quests` modülü kapalıyken de görünür. |
| 25 | Görev ikonu / ödülü / bitiş süresi | EKSİK | `route.ts:100,104` döner; `page.tsx:170-182` render etmiyor | API `icon`, `reward`, `type` gönderiyor ama sayfa kullanmıyor; `expiresAt` hiç seçilmiyor. |
| 26 | Tamamlanan görevi claim etme | EKSİK | — | Claim akışı yalnızca `/customer/quests`’te (`app/customer/quests/page.tsx:252`). |
| 27 | Rozet çipleri | BOZUK | `page.tsx:215`, `prisma/seed.ts:225-303`, `lib/badge-catalog.ts:7` | `Badge.icon` çoğunlukla `/images/badges/YENİ SES.svg` gibi dosya yolu; sayfa bunu metin olarak basıyor. |
| 28 | Rozet çipine tıklayınca önizleme | ÇALIŞIYOR | `page.tsx:204-209,251` | Klavye ile erişilebilir `button`, odak halkası var. |
| 29 | Rozet önizleme dialog içeriği | KISMİ | `page.tsx:252-271`, `route.ts:140` | İkon yolu metin olarak; nadirlik ham İngilizce (“Nadirlik: legendary”); açıklama, kazanılma tarihi, görsel yok. |
| 30 | Rozet boş durumu | ÇALIŞIYOR | `page.tsx:200-201` | |
| 31 | “Tüm rozetler” linkleri (başlık + dialog) | ÇALIŞIYOR | `page.tsx:194-197,264-271` | |
| 32 | Hızlı link: Yolculuk skoru | ÇALIŞIYOR | `page.tsx:226-234` | Modül kontrolsüz. |
| 33 | Hızlı link: Harcama özeti | ÇALIŞIYOR | `page.tsx:235-240` | Modül kontrolsüz. |
| 34 | Hızlı link: Ödüller | ÇALIŞIYOR | `page.tsx:241-246` | Modül kontrolsüz. |
| 35 | TR/EN yerelleştirme | KISMİ | `messages/tr.json`, `messages/en.json` `customerProgressHub` | Tüm sabit metinler çevrili; nadirlik değeri ve API hata metinleri (`route.ts:80,181`) çevrilmiyor. |
| 36 | Sayı biçimlendirme (yerel) | ÇALIŞIYOR | `page.tsx:44-47` | Görev sayaçları hariç. |
| 37 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:94,151,199,225` | `md:`/`lg:` ızgaralar tek kolona düşüyor, çipler sarıyor. |
| 38 | Veri tazeleme (odak/çek-bırak/yeniden doğrulama) | EKSİK | `page.tsx:49-67` | Yalnızca mount’ta bir kez; dashboard React Query kullanırken burada önbellek/paylaşım yok. |
| 39 | Günlük seri (streak) | EKSİK | `prisma/schema.prisma` `User.loginStreakCount` | Veri var, sayfada yok. |
| 40 | Lig / sıralama konumu | EKSİK | — | Lig sistemi var (`lib/league-rules`), sayfada yok. |
| 41 | Karakter rozeti gizli ilerleme / koleksiyon | EKSİK | `lib/character-badges.ts` | Sistemin imza oyunlaştırması bu “ilerleme” ekranında hiç yok. |
| 42 | Kutlama / mikro-etkileşim | EKSİK | `page.tsx` (hiç `Motion` yok) | Seviye atlama, görev tamamlama anı yok. |
| 43 | `stats.streak` alanı | SAHTE | `app/api/customer/stats/route.ts:157` | Sabit `0`; sayfa kullanmıyor ama aynı API’yi kullanan ekranlar için yanlış sinyal. |

**Durum özeti:** ÇALIŞIYOR 21 · KISMİ 9 · BOZUK 5 · SAHTE 1 · EKSİK 7 (toplam 43)

---

## Bulgular

### 1. XP / seviye ilerlemesi yanlış formülle hesaplanıyor — Seviye 4’ten itibaren çubuk hep dolu
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** `app/api/customer/stats/route.ts:86-90` (`xpForCurrentLevel = (level-1)*1000`, `xpNeeded = 1000`); gerçek seviye `lib/utils.ts:94-106` `calculateLevel` (1000, 1500, 2250, 3375… geometrik, çarpan 1.5) ile `lib/points-wallet.ts:46`’da yazılıyor.
- **Sorun:** Seviye 3 başlangıcı gerçekte 2.500 XP, Seviye 4 başlangıcı 4.750 XP. API Seviye 4 kullanıcısı için `xpProgress = 4750-3000 = 1750`, `xpNeeded = 1000` → `levelProgress = 100`. Yani 4. seviyeden sonra her kullanıcı “bir sonraki seviyeye hazır” görünür, metin “1.750 / 1.000” yazar. Seviye 2–3’te de oran şişik (ör. xp=2000, Seviye 2: API %100, gerçek %67). Aynı yanlış değer müşteri ana panelinde de kullanılıyor (`components/customer/dashboard/customer-dashboard.tsx:240`). Üstelik sistemde üçüncü bir hesap daha var: sidebar `calculateLevelProgress(session.user.points)` ile XP yerine **puanı** kullanıyor (`components/dashboard/sidebar.tsx:506`), `/api/gamification/progress/route.ts:71` ise bambaşka bir doğrusal formül kullanıyor. Kullanıcı aynı anda üç farklı ilerleme görebilir.
- **Öneri:** Seviye eğrisini tek bir saf modüle (`lib/leveling.ts`: `levelFromXp`, `levelBounds(level) → {start, end}`, `progress(xp)`) taşıyın; `calculateLevel*` üçlüsünü bu modülden türetin. `/api/customer/stats`, `/api/gamification/progress` ve sidebar aynı fonksiyonu çağırsın; API `xpIntoLevel`, `xpForLevel`, `xpToNext`, `levelProgress` alanlarını sunucu tarafında üretsin. Birim testi: sınır değerler (0, 999, 1000, 2499, 2500, 4750) için `levelFromXp` ile `levelBounds` tutarlılığı. Admin seviye atama yolu (`app/api/admin/users/route.ts:479`, `xp: (level-1)*1000`) da aynı modülün `levelBounds(level).start` değerini kullanmalı, yoksa admin’in atadığı seviye ile XP birbirini tutmuyor.

### 2. Görev ilerleme çubukları görünmüyor (0 piksel genişlik)
- **Önem:** yüksek · **Kategori:** görsel hata · **Efor:** S
- **Kanıt:** `app/customer/progress-hub/page.tsx:175-176` (`<div className="mt-2 flex …"><Progress className="h-1.5 flex-1" />`), `components/ui/progress.tsx:17-24` (bileşen Root’u bir `<div className="relative">` ile sarıyor ve `className`’i iç Root’a veriyor).
- **Sorun:** Flex öğesi olan sarmalayıcı `div`’in kendi içeriği yok (Root `w-full`, Indicator yüzde genişlikli) → max-content 0, `flex-grow` 0. Aynı yapı headless Chrome’da ölçüldü: sarmalayıcı ve Root genişliği `0`. Görev kartında yalnızca isim ve “2/5” sayacı görünür; sayfanın ana görsel öğesi kayıp. Aynı hata `app/admin/components/AnalyticsSection.tsx:86`’da da var.
- **Öneri:** Kısa vadede `Progress` bileşenine `wrapperClassName` ekleyin ya da sarmalayıcıyı yalnız `showValue` true iken render edin; uzun vadede `className`’in dış katmana gitmesini sağlayıp göstergeyi `indicatorClassName` ile yönetin. Bileşene “flex içinde genişler” görsel regresyon örneği (Storybook/Playwright ekran görüntüsü) ekleyin; tüm 30 kullanım yerini tarayın.

### 3. Rozet ikonları dosya yolu olarak metin basılıyor
- **Önem:** yüksek · **Kategori:** görsel hata / veri sunumu · **Efor:** S
- **Kanıt:** `page.tsx:215` (`{b.icon ? <span aria-hidden>{b.icon}</span> : null}`), `page.tsx:255` (dialog başlığı); DB değerleri `prisma/seed.ts:225-303` ve `lib/badge-catalog.ts:7` (`/images/badges/...svg`), `lib/character-badges.ts:120` (karakter rozetlerinde de yol). Doğru render örneği: `app/customer/badges/badges-client.tsx:479` (`<Image src={badge.icon} …>`).
- **Sorun:** Çip “/images/badges/YENİ SES.svg Yeni Ses” gibi görünür ve `max-w-[10rem] truncate` yalnızca ismi kısalttığından yol metni çipi genişletir. Eski emoji rozetleri (`lib/emoji-badge-texts.ts`) metin olarak doğru çıkarken SVG rozetler bozuk — karışık bir koleksiyon görünümü.
- **Öneri:** Rozet sayfasındaki render mantığını paylaşılan bir `<BadgeGlyph icon size />` bileşenine çıkarın (yol/URL → `next/image`, emoji → metin, boş → varsayılan). Önizleme çiplerini metin çipi yerine 56–64 px rozet madalyonlarına (nadirlik rengiyle halka, `Badge.color/bgColor` alanları) dönüştürün.

### 4. Aktif görev listesi yanlış ve deterministik değil
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:** `app/api/customer/stats/route.ts:24-28` (`where: { userId, completedAt: null }`, `take: 5`, `orderBy` yok, `quest.isActive`/`expiresAt` filtresi yok); karşılaştırma `app/api/gamification/quests/route.ts:28-29,80-81` (`isActive: true`, `completed = completedAt || progress >= target`, claim durumu audit log’dan).
- **Sorun:** (a) Admin’in pasifleştirdiği veya süresi dolmuş görevler “aktif” gösterilir; `/customer/quests` bunları göstermez → iki sayfa çelişir. (b) `orderBy` olmadığı için 6+ görevi olan kullanıcıda hangi 5’inin geleceği belirsiz. (c) `progress >= target` olup claim edilmemiş görevler %100 çubukla “aktif” görünür ama claim butonu yok — kullanıcı ödülünü burada fark etmez. (d) Açıklama metni “Tamamlanmaya yakın görevleri önceleyin” derken sıralama yapılmıyor.
- **Öneri:** Görev çekimini `getUserQuestBoard(userId)` gibi tek bir servis fonksiyonuna taşıyıp hem `/api/gamification/quests` hem bu hub tarafından kullanın. Hub için: `isActive && (expiresAt null || > now)`, durum üçlüsü `claimable | inProgress | locked`, sıralama `claimable` önce, sonra `progress/target` azalan, sonra `expiresAt` artan. Claimable olanlarda satır içi “Ödülü al” butonu mevcut `/api/gamification/quests/[id]/claim` ucunu çağırsın (iyimser güncelleme + konfeti, ekonominin atomik claim kuralı korunur).

### 5. Modül kapısı sayfa ve API’de uygulanmıyor
- **Önem:** orta · **Kategori:** yetki / ürün kontrolü · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:27` (`progress_hub` modülü tanımlı), `components/dashboard/sidebar.tsx:450-454` (yalnız menüde gizleme); `page.tsx` ve `app/api/customer/stats/route.ts` içinde `assertModuleEnabled` yok; karşılaştırma `app/api/gamification/quests/route.ts:16`.
- **Sorun:** Admin “Gelişim merkezi”ni kapattığında sayfa doğrudan URL’den ve Keşfet linkinden açılmaya devam eder. Aynı şekilde `quests`, `journey_score`, `spending_overview`, `rewards` modülleri kapalıyken sayfa bunlara link vermeyi sürdürür.
- **Öneri:** Sayfayı ince bir server component sarmalayıcısına alın: `getModuleControls()` ile `progress_hub` kapalıysa `notFound()`/bilgilendirme ekranı; alt link ve kartları modül haritasına göre koşullu render edin. Hub’a özel API (bkz. bulgu 7) `assertModuleEnabled('progress_hub', { role: 'customer' })` ile korunmalı. `/api/customer/stats` dashboard tarafından da kullanıldığı için orada kapı koymayın.

### 6. Progress bileşeni ekran okuyucuya değer iletmiyor
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `components/ui/progress.tsx:16-24` — `value` props’tan ayrıştırılıyor ama `ProgressPrimitive.Root`’a geçirilmiyor; yalnız inline `style.width` ile çiziliyor.
- **Sorun:** Radix Root `value` almayınca `aria-valuenow` üretmez ve `data-state="indeterminate"` olur; ekran okuyucu XP ve görev çubuklarını “meşgul/belirsiz” olarak duyurur. Ayrıca çubukların erişilebilir adı yok (`aria-label`/`aria-labelledby`). Bu bileşen 30 dosyada kullanılıyor, etki sistem çapında.
- **Öneri:** `value` ve `max`’ı Root’a geri geçirin, `getValueLabel` ile yerelleştirilmiş metin (“Seviye 4 ilerlemesi: %22”) üretin; hub’da her çubuğu başlık metnine `aria-labelledby` ile bağlayın. Yükleme spinner’ına `motion-safe:animate-spin` ve `role="status"` ekleyin.

### 7. Sayfa genel amaçlı, ağır bir API’yi kullanıyor; hata yutuluyor
- **Önem:** orta · **Kategori:** mimari / performans · **Efor:** M
- **Kanıt:** `app/api/customer/stats/route.ts:17-76` (11 sorgu: 200 kart, 5 son feedback + include, 5 son tüketim + 3 include, e-posta/resim alanları); sayfa yalnız `user.level/points/xp*`, 4 sayaç, görevler ve rozetleri okuyor (`page.tsx:20-33`). `route.ts:74-76` kart sistemi hatasını `console.log` ile yutup 0 döndürüyor; `route.ts:44-49,119` `any[]`.
- **Sorun:** Her ziyarette kullanılmayan veriler çekiliyor; kart sistemi tablosu geçici olarak erişilemezse “Tüketim 0 / Bekleyen yorum 0” yanlış ama güvenle gösteriliyor. `streak: 0` sabit (`route.ts:157`). Tipler sayfada elle tanımlı ve API ile senkron değil (sayfa `slice(0, 8)` yaparken API zaten `take: 6`).
- **Öneri:** `GET /api/customer/progress` adında hub’a özel, Zod şemalı (paylaşılan tip `lib/contracts/progress.ts`) bir uç: seviye bloğu (bulgu 1), sayaçlar, `claimable/inProgress` görevler, son rozetler (ikon, nadirlik anahtarı, açıklama, `earnedAt`), streak (`User.loginStreakCount/Longest`), lig. Kısmi hataları `partial: ['consumptions']` gibi işaretleyip UI’da “şu an hesaplanamadı” göstersin. İstemcide dashboard ile aynı React Query anahtarını (`['customer','progress']`) kullanarak sayfalar arası önbellek paylaşımı ve odakta tazeleme sağlayın. Kısa TTL’li Upstash önbelleği (kullanıcı başına 30 sn, puan kredilendiğinde etiketle düşürme) isteğe bağlı.

### 8. Rozet nadirliği ve hata mesajları yerelleştirilmemiş
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `route.ts:140` (`rarity.toLowerCase()`), `page.tsx:259-260` (`badgeRarityLabel.replace('{rarity}', previewBadge.rarity)`), `route.ts:80,181` (Türkçe sabit API hataları).
- **Sorun:** TR arayüzde “Nadirlik: legendary”, EN arayüzde gelebilecek sunucu hataları Türkçe.
- **Öneri:** `rarity` anahtarını `customerBadges.rarity.<key>` çevirisine eşleyin (rozet sayfasında zaten nadirlik konfigürasyonu var, `app/customer/badges/badges-client.tsx:66-108`); nadirliği metin yerine renkli etiket + ikon olarak gösterin.

### 9. Sayaç kartları ve alt link şeridi aksiyona dönüşmüyor
- **Önem:** düşük · **Kategori:** UX / bilgi mimarisi · **Efor:** S
- **Kanıt:** `page.tsx:130-147` (dört sayaç düz `div`), `page.tsx:225-247` (bağlamsız üç link).
- **Sorun:** “Bekleyen yorum: 3” en değerli aksiyon sinyali (yorum = puan + karakter rozeti ilerlemesi) ama tıklanamıyor. Alt şerit “Yolculuk skoru / Harcama özeti / Ödüller” neden burada olduğunu anlatmıyor; puan bakiyesi ile “Ödüller” arasındaki doğal bağ (“şu ödüle 120 puan kaldı”) kurulmamış. “Toplam puan” etiketi aslında harcanabilir bakiye.
- **Öneri:** Sayaçları `Link` kartlarına çevirin (“Bekleyen yorum” → `/customer/consumptions` pending filtresi, “Rozet” → `/customer/badges`). Puan kartına “Bir sonraki ödüle X puan” hedef satırı ekleyin (rewards kataloğundan en yakın erişilebilir ödül). Etiketi “Puan bakiyesi” yapın.

### 10. İlk yüklemede düzen sıçraması ve tekrar dene yok
- **Önem:** düşük · **Kategori:** UX / performans algısı · **Efor:** S
- **Kanıt:** `page.tsx:85-91`.
- **Sorun:** `py-20` spinner → içerik geldiğinde tüm ızgara belirir (CLS); hata durumunda kullanıcının tek seçeneği sayfayı yenilemek.
- **Öneri:** Kart iskeletleri (mevcut `CustomerDashboardSkeleton` desenine uygun) ve “Tekrar dene” butonu; 401 → giriş yönlendirmesi, 403 (modül kapalı) → açıklayıcı boş durum.

---

## Eksik özellikler (kıyas ürünlerle)

- **Seviye/ödül yol haritası (Starbucks Rewards “Stars” barı):** Mevcut seviyeden sonraki 2–3 kilometre taşını ve her birinde açılan ayrıcalıkları gösteren yatay yol; “bir sonraki ödüle X puan” hedefi.
- **Seri ve günlük hedef (Duolingo):** `User.loginStreakCount/Longest` zaten tutuluyor; alev ikonu, haftalık takvim noktaları, seri koruma bilgisi bu ekranda yok.
- **Lig konumu ve haftalık yarış (Duolingo Ligleri):** Kullanıcının ligi, haftalık sıralaması, terfi/düşme bölgesine uzaklığı.
- **Karakter rozeti “gizemli bar”ı ve koleksiyon ilerlemesi:** Sistemin imza mekaniği (yalnız ConsumptionReview sayar) ilerleme merkezinde temsil edilmiyor; “bir karakter yaklaşıyor” sinyali yorum yazmaya en güçlü teşvik olurdu.
- **Zaman içinde ilerleme / dönemsel özet (Spotify Wrapped, Monzo trends):** Bu hafta/ay kazanılan XP-puan grafiği, önceki döneme göre değişim, `my-year` ekranına köprü.
- **Görevlerde claim, geri sayım ve ödül önizlemesi:** Revolut/Duolingo görev kartlarındaki gibi “Ödülü al”, “3 saat kaldı”, “+50 puan” etiketleri.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı ekranı açtığında 3 saniyede şunu anlamalı: “Neredeyim, bir sonraki ödüle ne kadar kaldı, bugün ne yapabilirim?” Sayfa bir sayaç panosu değil, bir **sonraki adım** motoru olmalı.

**Yerleşim (mobil öncelikli, tek kolon → masaüstünde 12 kolon):**
1. **Seviye halkası (üst kahraman):** Dairesel XP halkası (doğru geometrik eğriyle), ortada seviye numarası, altında “Seviye 5’e 1.240 XP”; yanında puan bakiyesi ve “En yakın ödül: Ücretsiz kahve — 120 puan kaldı” çipi (rewards kataloğundan).
2. **Bugün yapabileceklerin (aksiyon şeridi):** Öncelik sırasıyla en fazla 3 kart — claimable görev (“Ödülü al”), bekleyen yorum (“3 tüketimini değerlendir, karakter barın ilerlesin”), seriyi koru. Her kart tek dokunuşla aksiyona gider.
3. **Görevler:** İkon + isim + ödül + geri sayım + çalışan ilerleme çubuğu; claimable olanlar üstte, vurgulu.
4. **Seri ve lig:** Yan yana iki kompakt kart (haftalık nokta takvimi; lig rozeti + sıralama + terfi çizgisine mesafe).
5. **Rozetler:** Son kazanılan 6 rozet gerçek SVG madalyon olarak, nadirlik halkasıyla; altında karakter rozeti “gizemli bar” (kategori gizli, doluluk görünür).
6. **Dönem özeti:** Bu ay kazanılan XP/puan mini grafiği, “Yılım” ekranına köprü.

**Motion / 3D (ölçülü):**
- Sayfa girişinde seviye halkası ve sayaçların bir kez `AnimatedNumber` ile sayması (mevcut `components/customer` içinde var); `useReducedMotion` true ise anında son değer.
- Claim anında mevcut `triggerConfetti` + halka “dolma” animasyonu; seviye atlarsa tek seferlik tam ekran olmayan bir kutlama kartı.
- three.js burada **gereksiz**; 3D sürpriz kutusu/karakter reveal kendi ekranlarında kalmalı. Rozet madalyonlarında yalnızca hover/press’te hafif parıltı (CSS), azaltılmış harekette kapalı.
- Global `LazyMotion` / `m as Motion` deseni kullanılmalı; ayrı `LazyMotion` sarmalayıcısı eklenmemeli.

**Veri / API değişiklikleri:**
- `lib/leveling.ts` tek kaynak seviye eğrisi (bulgu 1) ve tüm tüketicilerin buna geçişi.
- `GET /api/customer/progress` (modül kapılı, Zod şemalı, paylaşılan tip): `level{level, xpIntoLevel, xpForLevel, xpToNext, progress}`, `points{balance, nextReward{id,name,cost}}`, `streak{current, longest, todayDone}`, `league{key, rank, promoteAt}`, `quests[{id, name, icon, reward, target, progress, status, expiresAt}]`, `badges[{id, name, icon, rarityKey, color, earnedAt}]`, `characterBar{fill}`, `pendingReviews`, `partial[]`.
- İstemci: React Query, dashboard ile ortak anahtar, odakta tazeleme, claim sonrası `invalidateQueries`.
- Paylaşılan bileşenler: `BadgeGlyph`, düzeltilmiş `Progress`, `LevelRing`, `QuestRow` (hub + quests + dashboard aynı bileşeni kullanır).

---

## Çakışmalar / birleştirme önerisi

- **`/customer` (müşteri ana paneli, `components/customer/dashboard/customer-dashboard.tsx`):** Aynı `/api/customer/stats` ucunu kullanıyor ve seviye ilerlemesi (`:240`), aktif görevler (`:1028`), rozetler (`:242`), sayaçlar (`:237`) zaten orada — hub bunun daha yoksul bir kopyası. Ana panel bu bölümleri ayrıca daha iyi filtreliyor (`q.progress < q.target`, `:1028`).
- **`/customer/quests`** ve **`/customer/badges`:** Hub’daki görev ve rozet kartları bu sayfaların zayıf önizlemeleri; farklı veri kaynağı kullandıkları için (bulgu 4) birbirleriyle çelişiyorlar.
- **`/customer/journey-score`** (“Zaman Çizelgem”) ve **`/customer/my-year`:** Aynı “Analizler” grubunda ilerleme anlatısı sunan kardeş ekranlar; kullanıcı açısından “Gelişim merkezi / Yolculuk skoru / Yılım / Analitiğim” ayrımı net değil.

**Öneri:** `progress-hub`’ı “İlerleme” adıyla **kanonik oyunlaştırma ekranı** yapın ve yukarıdaki vizyonla yeniden kurun; ana paneldeki seviye/görev/rozet blokları bu ekrana giden kompakt bir teaser’a indirgensin (aynı React Query verisi). `journey-score`’un özet katmanı buraya “Dönem özeti” olarak alınsın, zaman çizelgesi kendi alt sayfasında kalsın. Böylece sidebar’ın “Analizler” grubundaki dört benzer giriş ikiye iner ve seviye/görev verisi tek kaynaktan gelir.

---

## Doğrulama (şüpheci inceleme)

Aşağıdaki üç iddia, çağıran/çağrılan kod baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. XP ilerleme hesabı geometrik seviye sistemiyle uyumsuz — **DOĞRULANDI**

- Seviyeyi yazan tek akış `creditPointsAndXp` (`lib/points-wallet.ts:46-55`): `calculateLevel(updatedUser.xp)` ile geometrik eğri kullanıyor (`lib/utils.ts:94-106`; eşikler 1000 → 2500 → 4750 → 8125 kümülatif XP).
- Oysa `app/api/customer/stats/route.ts:86-90` doğrusal varsayımla hesaplıyor: `xpForCurrentLevel = (level-1)*1000`, `xpNeeded = 1000`.
- **Yeniden üretim:** XP=2000 olan kullanıcı → `calculateLevel` = 2 (3. seviye için 2500 gerekli). API: `xpProgress = 2000-1000 = 1000`, `xpNeeded = 1000`, `levelProgress = 100`. Kullanıcı 500 XP daha kazanması gerekirken çubuk dolu ve "1.000 / 1.000" görüyor. XP=4750 (seviye 4 başlangıcı) → `xpProgress = 1750`, `xpNeeded = 1000`, ekranda "1.750 / 1.000" ve %100 (`page.tsx:71,117,120`). Yani sorun iddia edildiği gibi yalnız 4. seviyeden sonra değil, 2. seviyenin ortasından itibaren başlıyor; seviye 3 başında (2500 XP) ise çubuk %50 gösterilerek "yarı dolu" başlıyor.
- Aynı `levelProgress` müşteri ana panelinde de kullanılıyor (`components/customer/dashboard/customer-dashboard.tsx:240`); sidebar ise `calculateLevelProgress(session.user.points)` ile XP yerine **puan** üzerinden üçüncü bir değer hesaplıyor (`components/dashboard/sidebar.tsx:506`).
- Ek bulgu (iddiayı güçlendiriyor): admin `set_level` eylemi `xp = (level-1)*1000` yazıyor (`app/api/admin/users/route.ts:477-480`), yani doğrusal ve geometrik modeller veride bile karışıyor; örn. admin seviyeyi 4 yaparsa XP=3000 olur, bir sonraki kredide `calculateLevel(3000+δ)` = 3 çıkar ama `level: { lt: 3 }` koşulu nedeniyle seviye 4'te kalır, XP ise 4. seviyenin geometrik başlangıcının (4750) altında olur.
- **Öneri:** Seviye eğrisini tek kaynağa (`lib/leveling.ts`: `levelFromXp`, `levelBounds(level) → {start, end}`) taşıyın; stats API `xpIntoLevel = xp - start`, `xpForLevel = end - start` döndürsün; sidebar `session.user.xp` kullansın; admin `set_level` XP'yi `levelBounds(level).start` olarak yazsın. Birim test: sınır değerlerde (999/1000/2499/2500/4750) ilerlemenin 0–100 aralığında ve tutarlı olduğunu doğrulayın.

### 2. Görev ilerleme çubukları render edilmiyor (0 genişlik) — **DOĞRULANDI**

- `components/ui/progress.tsx:17-24`: bileşen Radix `Root`'u bir dış `<div className="relative">` ile sarıyor ve `className`'i (dolayısıyla `flex-1`) **iç** `Root`'a veriyor.
- `app/customer/progress-hub/page.tsx:175-176`: `flex items-center` kapsayıcısında flex öğesi dış `div.relative`; onun `flex-grow`'u 0, `flex-basis: auto` → içeriksel genişlik. İçerik `w-full` bir `Root` ve yüzde genişlikli `Indicator`'dan ibaret, max-content genişliği 0. Sonuç: dış sarmalayıcı 0 px, `Root` (`w-full`) 0 px; yalnızca "progress/target" metni görünüyor.
- Seviye çubuğu (`page.tsx:120`) etkilenmiyor çünkü orada blok bağlamında (`space-y-2` içinde) duruyor; dış div blok olarak tam genişliği alıyor.
- `app/admin/components/AnalyticsSection.tsx:86` aynı desen (`flex items-center gap-3` + `className="h-2.5 flex-1"`) — admin puan dağılımı çubukları da aynı şekilde görünmez.
- **Öneri:** `Progress`'te dış sarmalayıcıyı kaldırıp `showValue` etiketini `Root` içine/yanına taşıyın ya da `className`'i dış sarmalayıcıya, yükseklik/renk için ayrı `trackClassName` prop'u verin. Bileşen tüm projede paylaşıldığı için değişiklikten sonra `<Progress` kullanan tüm flex bağlamlarını tarayın.

### 3. Rozet ikonu SVG yolu metin olarak basılıyor — **DOĞRULANDI**

- `Badge.icon` şemada serbest `String` (`prisma/schema.prisma:608`); tüm üretim yolları dosya yolu yazıyor: seed (`prisma/seed.ts:105-134`, örn. `` `${B}/YENİ SES.svg` ``), katalog (`lib/badge-catalog.ts:7,21+`), karakter rozeti otomatik oluşturma (`lib/character-badges.ts:118-121`, yedek `/logo/logo.png`). Kardeş sayfa `/customer/badges` bu değeri `<Image src={badge.icon}>` olarak kullanıyor (`app/customer/badges/badges-client.tsx:479,585,769`) — yani değerin yol olduğu sistemce kabul edilmiş.
- API bu değeri olduğu gibi döndürüyor (`app/api/customer/stats/route.ts:139`); sayfa ise `<span aria-hidden>{b.icon}</span>` ile metin basıyor (`page.tsx:215`) ve dialog başlığında `text-2xl` ile (`page.tsx:255`).
- **Yeniden üretim:** "Yeni Ses" rozetini kazanmış müşteri → çipte "/images/badges/YENİ SES.svg Yeni Ses" görünür; ikon `span`'ı `truncate` olmadığı için uzun yol çipi şişirir, dialog başlığında 24px yazıyla ham yol çıkar.
- **Öneri:** Ortak bir `BadgeGlyph` bileşeni (yol ise `next/image`, emoji ise metin, boşsa yedek) oluşturup hub, ana panel ve rozet sayfasında aynı bileşeni kullanın; dialog'da rozet açıklaması ve nadirlik rengi de gösterilsin.

**Özet:** 3 iddianın 3'ü doğrulandı; hiçbiri çürütülemedi. 1. bulgunun etki alanı iddiadan geniş (2. seviyeden itibaren yanlış; admin `set_level` veriyi de tutarsızlaştırıyor).
