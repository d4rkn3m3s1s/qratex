# /customer/shop

**Amaç:** Müşterinin QR geri bildirimleriyle biriktirdiği **puanı** (XP değil) kozmetik ürünlere (avatar çerçevesi, profil rozeti, profil arka planı) harcadığı, sahip olduklarını kuşandığı ve başka bir kullanıcıya hediye ettiği kozmetik dükkânı. Puan ekonomisinde gerçek ödüllerin (`/customer/rewards`) yanındaki ikinci "harcama havuzu".

**Genel puan: 4.8 / 10** · **Karar: yeniden tasarla** (arka uç çekirdeği — atomik harcama, sahiplik kontrolü — sağlam; ama görünür hatalar, etkisiz "kuşan" eylemi, aşırı yüklenmiş `imageUrl` veri modeli, sosyal değeri olmayan kozmetikler ve ödüller sayfasıyla parçalı bilgi mimarisi sayfanın yeniden kurgulanmasını gerektiriyor.)

İncelenen dosyalar: `app/customer/shop/page.tsx`, `app/customer/shop/layout.tsx`, `app/customer/shop/shop-client.tsx`, `components/customer/shop-interactive.tsx`, `components/ui/avatar-frame.tsx`, `app/api/customer/shop/route.ts`, `app/api/customer/shop/[id]/equip/route.ts`, `app/api/customer/shop/gift/route.ts`, `app/api/customer/equipped-cosmetics/route.ts`, `lib/points-wallet.ts`, `lib/achievements.ts`, `lib/auth.ts` (JWT kozmetik alanları), `lib/cosmetic-demos.ts`, `add-shop-items.ts`, `i18n/request.ts`, `messages/tr.json` + `messages/en.json` (`customerShop`), `prisma/schema.prisma` (`CosmeticItem`, `UserCosmetic`), `app/customer/layout.tsx`, `app/customer/loading.tsx`, `app/customer/error.tsx`, `app/globals.css` (reduced-motion), `proxy.ts`, ilgili tüketiciler (`components/customer/dashboard/customer-dashboard.tsx`, `components/customer/showcase-selector.tsx`, `components/dashboard/header.tsx`). Hiçbir komut/DB/sunucu çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Satın alma/çerçeve kuşanma/hediye uçtan uca çalışıyor; ama "Tümü" ve "Sahipsin" ham i18n anahtarı olarak görünüyor, rozet kuşanmanın hiçbir görünür etkisi yok, nadirlik sıralaması alfabetik, pasif ürün API'den satın alınabiliyor. |
| UX | 4/10 | 10.000 puanlık geri alınamaz harcama tek tıkla, onaysız; hediye alıcısı "isim" ile seçiliyor ve kim olduğu gösterilmiyor; boş kategori "Dükkan boş" diyor; satın alma sonrası kutlama/kuşanma önerisi yok. |
| Görsel | 5/10 | Çerçeve önizlemesinin kullanıcının kendi avatarıyla yapılması iyi; ama 8–10px metinler, yalnızca koyu temaya göre yazılmış `white/[0.08]` sınırlar, zorla koyu hediye modalı, nadirliğin görsel dili yok. |
| Mimari | 4/10 | `imageUrl` alanı aynı anda efekt anahtarı, görsel URL'si ve Tailwind sınıfı olarak kullanılıyor; harcama defteri yok; ölü GET ucu; `as any` kaçakları; çift i18n mekanizması. |
| Performans | 7/10 | Tek turda 3 paralel sorgu, sunucu bileşeni; ama sorgu sınırsız (`take` yok), kuşanma döngüsünde ardışık UPDATE'ler, birçok sürekli CSS animasyonu aynı anda ızgarada. |
| Erişilebilirlik + mobil | 4/10 | Sekmelerde `role`/`aria-pressed` yok, modal etiketleri alanlarla ilişkisiz, "yetersiz bakiye" nedeni yalnız hover'da (dokunmatikte görünmez), Glitch çerçevesi saniyede ~5–10 yanıp sönüyor; olumlu yan: global `prefers-reduced-motion` desteği var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rol kontrolü (CUSTOMER değilse yönlendirme) | ÇALIŞIYOR | `app/customer/shop/page.tsx:12-14` | Yanlış roldeki (ör. bayi) oturum `/auth/login`'e atılıyor; kendi paneline değil. Ayrıca `proxy.ts` authMiddleware ile `/customer/*` korunuyor. |
| 2 | Segment metadata (sekme başlığı/açıklama) | ÇALIŞIYOR | `app/customer/shop/layout.tsx:3-5` | TR: "Çerçeve dükkanı". |
| 3 | Sayfa başlığı ve açıklaması | KISMİ | `page.tsx:48-54`, `messages/tr.json` `customerShop.description` | Metin "Kazandığınız XP ve puanlarla" diyor; satın alma yalnız `points` düşüyor (`app/api/customer/shop/route.ts:119`). Yanıltıcı vaat. |
| 4 | Güncel bakiye rozeti | ÇALIŞIYOR | `page.tsx:57-66` | DB'den taze okunuyor, locale'e göre biçimleniyor. |
| 5 | Paralel veri yükleme (kullanıcı, katalog, envanter) | ÇALIŞIYOR | `page.tsx:22-29` | `cosmeticItem.findMany` sınırsız (`take` yok). |
| 6 | Sahiplik / kuşanma eşlemesi | ÇALIŞIYOR | `page.tsx:34-41` | `inventory.find` O(n·m), şu ölçekte önemsiz. |
| 7 | Nadirliğe göre sıralama | BOZUK | `page.tsx:26` | `rarity` String; `desc` alfabetik: rare › legendary › epic › common. Efsaneviler değil "rare"ler en başta. |
| 8 | "Tümü" sekmesi | BOZUK | `shop-client.tsx:104`, `i18n/request.ts:36` | `customerShop.all` anahtarı TR/EN JSON'da yok; `t()` eksik anahtarda anahtarın kendisini döndürüyor (truthy) → `|| 'Tümü'` yedeği hiç devreye girmiyor, ekranda "customerShop.all" yazıyor. |
| 9 | Kategori filtreleri (Çerçeve/Rozet/Arka plan) | KISMİ | `shop-client.tsx:102-122` | Çalışıyor; ama etiketler tekil ("Çerçeve") çünkü kart çipi anahtarları yeniden kullanılmış; sayı rozeti yok; `role="tablist"`/`aria-pressed` yok; `as any` (`:111`). |
| 10 | "Arka Planlar" kategorisi içeriği | KISMİ | `lib/cosmetic-demos.ts:17-90`, `add-shop-items.ts:12-93` | Varsayılan katalogda hiç `profile_background` yok; sekme admin eklemedikçe hep boş. |
| 11 | Duyarlı ürün ızgarası | ÇALIŞIYOR | `shop-client.tsx:125` | 2→5 sütun. |
| 12 | Tür çipi (Çerçeve/Rozet/Arka plan) | ÇALIŞIYOR | `shop-client.tsx:151-161` | Yalnız `legendary` için amber renk. |
| 13 | Nadirlik gösterimi | EKSİK | `shop-client.tsx:154` | `rarity` metni/renk kademesi gösterilmiyor; common/rare/epic ayırt edilemiyor. |
| 14 | "Kuşanıldı" işareti | KISMİ | `shop-client.tsx:163-167` | Yalnız yeşil tik ikonu; metin/`aria-label` yok. `customerShop.equipped` anahtarı mevcut ama kullanılmıyor. |
| 15 | Çerçeve önizlemesi (kullanıcının kendi avatarıyla) | KISMİ | `shop-client.tsx:172-178`, `components/ui/avatar-frame.tsx:123-145` | İyi fikir; ama kullanıcının `customFrameColor` tonu uygulanmıyor (dashboard'da uygulanıyor: `customer-dashboard.tsx:457-459`) → önizleme ≠ gerçek. Admin URL'li çerçeve eklerse `DefaultFrame` düz daireye düşüyor. |
| 16 | Arka plan önizlemesi | SAHTE | `shop-client.tsx:146-148, 179-186` | Gerçek arka plan yerine sabit mini kart + sabit TR "Kart Teması" metni; `imageUrl` Tailwind sınıfı olarak basılıyor — kaynakta geçmeyen sınıf JIT tarafından üretilmez. |
| 17 | Rozet önizlemesi (diamond/ruby/URL/yedek) | KISMİ | `shop-client.tsx:189-210` | Bilinmeyen anahtarda ham `imageUrl` metni kullanıcıya monospace olarak basılıyor (`:208`) — iç tanımlayıcı sızıntısı. |
| 18 | "Animasyonlu" ürün sezgisi | SAHTE | `shop-client.tsx:130, 201` | İsimde "animasyon" geçiyor mu diye bakıyor; veri modelinde alan yok, URL'li görsellere `animate-pulse` ekliyor. |
| 19 | Yetersiz bakiye örtüsü | KISMİ | `shop-client.tsx:216-221` | Yalnız `group-hover` ile görünür; dokunmatik cihazda kullanıcı nedenini göremez. "Kaç puan eksik" bilgisi yok. |
| 20 | Ürün adı / açıklaması | KISMİ | `shop-client.tsx:226-231` | Açıklama 10px + tek satır kırpma; ürün içerikleri DB'de tek dilde (isim İngilizce, açıklama Türkçe: `cosmetic-demos.ts:20-21`) → iki dilde de karışık. |
| 21 | Fiyat etiketi | KISMİ | `shop-client.tsx:238`, `:304` | `toLocaleString()` locale'siz: SSR (Node) ve tarayıcı farklı ayraç üretirse hidrasyon uyuşmazlığı riski (doğrulanmadı — çalıştırılmadı). Başlıktaki bakiye locale'li (`page.tsx:63`), kartlar değil → tutarsız. |
| 22 | "Sahipsin" etiketi | BOZUK | `shop-client.tsx:243` | `customerShop.owned` anahtarı yok → ekranda "customerShop.owned" yazıyor (madde 8 ile aynı kök neden). |
| 23 | Satın Al butonu | KISMİ | `components/customer/shop-interactive.tsx:31-55, 107-116` | Onay adımı yok; başarı/hatada sunucunun İngilizce mesajı öncelikli gösteriliyor ("Successfully purchased …", "Not enough points": `route.ts:103,110,137`). Dark modda `hover:bg-amber-50` parlak beyaz zemin. |
| 24 | Satın alma atomikliği (çift harcama koruması) | ÇALIŞIYOR | `app/api/customer/shop/route.ts:114-123`, `lib/points-wallet.ts:90-106`, `schema.prisma:599` | Guarded `updateMany` + `@@unique([userId, cosmeticId])` aynı tx içinde; yarışta ikinci istek geri alınır (ama 500 + "Internal Server Error" döner). |
| 25 | Pasif ürün koruması (satın alma) | BOZUK | `app/api/customer/shop/route.ts:89-112` | `item.isActive` kontrol edilmiyor; hediye ucu ediyor (`gift/route.ts:39`). Kaldırılmış ürün doğrudan API ile satın alınabilir. |
| 26 | "Koleksiyoncu" başarımı ilerlemesi | KISMİ | `route.ts:134`, `lib/achievements.ts:92-123` | Hatalar yutuluyor (iyi); ama oku-değiştir-yaz atomik değil, `completedAt: null` koruması yok → eşzamanlı iki satın almada ödül (75 puan) iki kez kredilenebilir. |
| 27 | Kuşan/Çıkar — çerçeve | ÇALIŞIYOR | `shop-interactive.tsx:57-89`, `[id]/equip/route.ts:27-62`, `lib/auth.ts:279` | Sahiplik kontrolü var (IDOR yok); JWT anında güncelleniyor; header + dashboard'da görünüyor. |
| 28 | Kuşan/Çıkar — rozet | SAHTE | `lib/auth.ts:246-249`, `equipped-cosmetics/route.ts:26-27` | DB'de `isEquipped` değişiyor ama hiçbir tüketici kuşanılmış rozeti okumuyor (yalnız frame/background JWT'ye alınıyor). Rozetler yalnız Ayarlar › Vitrin'de "iğneleme" ile görünür. Buton etkisiz. |
| 29 | Kuşan/Çıkar — arka plan | KISMİ | `customer-dashboard.tsx:438-444` | Dashboard hero'ya `className` olarak uygulanıyor; değer derlenmiş bir Tailwind sınıfı değilse görünmez. |
| 30 | Kuşanma API'si | KISMİ | `[id]/equip/route.ts:41-66` | Aynı türdekiler döngüde tek tek UPDATE (`updateMany` olmalı); eşzamanlı iki kuşanma iki aktif çerçeve bırakabilir; mesajlar İngilizce ("Equipped"/"Unequipped") ve istemcideki çevrilmiş metni eziyor (`shop-interactive.tsx:65`). |
| 31 | Hediye butonu | ÇALIŞIYOR | `shop-client.tsx:260-268` | Modal açıyor. `title` sabit TR ("Arkadaşına Hediye Et"), i18n yok; bakiye yetmese de aktif. |
| 32 | Hediye — alıcı alanı | KISMİ | `shop-client.tsx:308-320`, `gift/route.ts:67-76` | Ad **veya** e-posta ile `findFirst` — `name` benzersiz değil, `orderBy` yok → aynı isimli kullanıcılardan rastgele birine gidebilir. Alıcı önizlemesi/onayı yok. `<label>` alanla ilişkili değil. |
| 33 | Hediye — kişisel mesaj | KISMİ | `shop-client.tsx:322-331`, `gift/route.ts:25` | İstemci 200, sunucu 280 karakter; mesaj `UserCosmetic.giftMessage`'a yazılıyor ama hiçbir arayüzde gösterilmiyor (yalnız bildirim metnine gömülü). |
| 34 | Hediye gönderimi (API) | KISMİ | `gift/route.ts:107-142` | Harcama + sahiplik + bildirim tek tx'te (iyi). Rate limit yok (`proxy.ts:105-118` yalnız başlık ekliyor); "kullanıcı bulunamadı" ile kayıtlı e-posta sorgulanabiliyor (maliyetli ama mümkün oracle). |
| 35 | Alıcıya hediye bildirimi | ÇALIŞIYOR | `gift/route.ts:125-132` | Metin sabit TR + emoji; alıcının dil tercihi dikkate alınmıyor. |
| 36 | "Hediye Ustası" başarımı | ÇALIŞIYOR | `gift/route.ts:145-146` | Madde 26'daki yarış notu burada da geçerli. |
| 37 | Hediye modalı görünümü | KISMİ | `shop-client.tsx:288-361` | Tamamen sabit TR (başlık, etiketler, butonlar, toast'lar `:58,76,82,85`); `bg-slate-950` zorla koyu → açık temada kopuk. |
| 38 | Boş durum | KISMİ | `shop-client.tsx:275-283` | Filtrelenmiş kategori boşken de "Dükkan Henüz Boş" diyor; filtreyi temizle eylemi yok. |
| 39 | Yükleniyor durumu | KISMİ | `app/customer/loading.tsx:1` | Genel panel iskeleti; ızgara iskeleti yok. Butonlarda "İşleniyor..." var. |
| 40 | Hata durumu | ÇALIŞIYOR | `app/customer/error.tsx` | Genel sınır + Sentry. Sayfada özel bir yeniden dene yok. |
| 41 | İşlem sonrası tazeleme | ÇALIŞIYOR | `shop-interactive.tsx:46, 80`, `shop-client.tsx:80` | `router.refresh()` bakiyeyi ve sahipliği tazeliyor; iyimser güncelleme yok. |
| 42 | Azaltılmış hareket | ÇALIŞIYOR | `app/globals.css:801-809, 824-831` | Global kural tüm CSS animasyonlarını kesiyor. Varsayılan kullanıcıda Glitch çerçevesi 0.1–0.3s yanıp sönme (`avatar-frame.tsx:49, 56-57`). |
| 43 | `GET /api/customer/shop` | SAHTE (ölü kod) | `app/api/customer/shop/route.ts:12-65` | Hiçbir istemci çağırmıyor (grep: yalnız POST/PATCH/gift kullanılıyor). |
| 44 | Envanter / "Dolabım" görünümü | EKSİK | — | Sahip olunanlar ayrı listelenmiyor; vitrin/renk ayarı Ayarlar'da (`app/customer/settings/page.tsx:1051`). |
| 45 | Harcama geçmişi / makbuz | EKSİK | `schema.prisma` (puan defteri modeli yok) | Harcamalar yalnız `acquiredAt` ile iz bırakıyor; `points_credited` var, harcama olayı yok. |
| 46 | Arama / fiyat sıralaması / "alabileceklerim" filtresi | EKSİK | `shop-client.tsx:41-53` | Yalnız tür filtresi. |
| 47 | Ürün detay / "üzerimde dene" | EKSİK | — | Kart tek görünüm; büyük önizleme, header/dashboard bağlamında deneme yok. |
| 48 | Kozmetiklerin başkalarına görünmesi | EKSİK | grep `UserAvatarFrame` → yalnız `header.tsx:532`, `customer-dashboard.tsx:457`, `showcase-selector.tsx:228` | Çerçeve yalnız sahibine görünüyor (liderlik tablosu, takım, profil kartında yok) → sosyal değeri sıfıra yakın. |
| 49 | Hediye alındı işareti (gönderen, mesaj) | EKSİK | grep `giftedBy|giftMessage` → UI tüketicisi yok | Alıcının kartında "X'ten hediye" bilgisi yok. |
| 50 | Satın alma kutlaması / kuşanma kısayolu | EKSİK | `shop-interactive.tsx:44-46` | Yalnız toast; "Şimdi kuşan?" akışı yok. |

**Sayım:** ÇALIŞIYOR 15 · KISMİ 19 · BOZUK 4 · SAHTE 4 · EKSİK 8 → toplam 50 (bazı satırlar birden çok mikro-özelliği kapsıyor; sayım satır bazlıdır).

---

## Bulgular

### 1. [YÜKSEK · i18n/İşlevsellik] Ekranda ham çeviri anahtarları görünüyor ("customerShop.all", "customerShop.owned")
- **Kanıt:** `shop-client.tsx:104` `tr('customerShop.all') || 'Tümü'`, `:243` `tr("customerShop.owned") || "Sahipsin"`; `i18n/request.ts:35-36` eksik anahtarda `return key`; `messages/tr.json` ve `en.json` `customerShop` altında `all` ve `owned` yok.
- **Sorun:** `||` yedeği hiç çalışmaz çünkü `t()` boş string değil anahtarı döndürür. İlk sekme ve sahip olunan her kartta teknik anahtar yazıyor — sayfanın en görünür iki noktasında "bitmemiş ürün" izlenimi.
- **Öneri:** `all`, `owned`, `ownedCount`, `categories.*` (çoğul) anahtarlarını iki dile ekleyin; projede `x || 'yedek'` kalıbını lint kuralıyla yasaklayın (eksik anahtar zaten anahtarı döndürüyor). Daha kalıcı çözüm: `t()` için tip güvenli anahtar birliği (`keyof typeof tr`), derleme anında eksik anahtarı yakalar. Sayfadaki sabit TR metinleri (hediye modalı, "Kart Teması", toast'lar) ile birlikte tek seferde temizleyin.
- **Efor:** S

### 2. [YÜKSEK · Veri bütünlüğü/UX] Hediye alıcısı benzersiz olmayan "isim" ile seçiliyor; puan yanlış kişiye gidebilir
- **Kanıt:** `gift/route.ts:67-76` — `findFirst({ OR: [{ email }, { name: { equals, mode: 'insensitive' } }], role: 'CUSTOMER' })`, `orderBy` yok; `User.name` benzersiz değil. İstemcide alıcı önizlemesi yok (`shop-client.tsx:308-320`).
- **Sorun:** "Ahmet Yılmaz" yazan kullanıcı, aynı adlı herhangi bir müşteriye 10.000 puanlık hediye gönderebilir; işlem geri alınamaz, iade yolu yok. Ayrıca uç kayıtlı e-postaları ayırt eden bir oracle (404 vs başarı/400) ve rate limit yok.
- **Öneri:** İsimle eşlemeyi kaldırın. Alıcı seçimini iki adıma bölün: (1) `GET /api/customer/shop/gift/recipients?q=` — yalnız arkadaş/takım (squad) üyeleri ve referans ağı içinden, maskelenmiş e-posta + avatar döndürür; (2) POST gövdesi `recipientUserId` alır. Modalda seçilen alıcının avatar+adı ile "X kullanıcısına 5.000 puanlık Hellfire Frame gönderilecek" onay ekranı gösterin. Uç için kullanıcı başına Upstash rate limit (ör. 10/saat) ve idempotency anahtarı ekleyin.
- **Efor:** M

### 3. [YÜKSEK · İşlevsellik] Rozet "Kuşan" butonunun hiçbir görünür etkisi yok
- **Kanıt:** `[id]/equip/route.ts:41-62` rozet için de `isEquipped` değiştiriyor; ama `lib/auth.ts:246-249` ve `equipped-cosmetics/route.ts:26-27` yalnız `avatar_frame` ve `profile_background` okuyor; `isEquipped` başka tüketicisi yok (grep). Rozetler dashboard'da yalnız `isPinned` ile görünüyor (`customer-dashboard.tsx:329-343`).
- **Sorun:** Kullanıcı 2.000 puanla rozeti alıp "Kuşan"a basıyor, "Equipped" toast'ı görüyor ve hiçbir yerde değişiklik olmuyor. İki ayrı kavram (kuşanma vs vitrine iğneleme) kullanıcıya açıklanmadan iki sayfaya bölünmüş.
- **Öneri:** Rozet için "Kuşan" yerine doğrudan "Vitrine ekle" eylemi (mevcut `/api/customer/showcase` ucunu kullanarak, 3 slot sınırıyla) gösterin; ya da `equippedBadge`'i JWT'ye ekleyip kullanıcının adının yanında (header, liderlik, takım listesi) tek bir "imza rozeti" olarak render edin. Ürün kararı: "kuşanma = başkalarına görünen tek öğe, vitrin = profilde 3 öğe" ayrımını netleştirip arayüzde etiketleyin.
- **Efor:** M

### 4. [YÜKSEK · UX] Geri alınamaz büyük harcamalar onaysız, tek tıkla yapılıyor
- **Kanıt:** `shop-interactive.tsx:31-55` — `handleBuy` doğrudan POST atıyor; fiyatlar 1.500–10.000 puan (`cosmetic-demos.ts`).
- **Sorun:** Starbucks/Duolingo gibi ürünler büyük harcamada daima bir onay sayfası (önizleme + kalan bakiye) gösterir. Burada yanlış dokunuş, özellikle mobilde 2 sütunlu sıkışık ızgarada, kalıcı kayıp demek; iade akışı yok.
- **Öneri:** Satın Al → alt sayfa (mobilde `Drawer`, masaüstünde `Dialog`): büyük önizleme (kendi avatarıyla, kendi renk tonuyla), "Bakiye 12.400 → 7.400", sahiplik sonrası ne olacağı ("Çerçeve header ve profilinde görünür"). Onayda istek + başarıda kısa kutlama ve "Şimdi kuşan" birincil eylemi. POST'a `Idempotency-Key` başlığı ekleyin.
- **Efor:** M

### 5. [ORTA · Güvenlik/Ekonomi] Pasif (kaldırılmış) ürün API üzerinden satın alınabiliyor
- **Kanıt:** `app/api/customer/shop/route.ts:89-112` — `findUnique({ where: { id: itemId } })` sonrası `isActive` kontrolü yok; hediye ucu kontrol ediyor (`gift/route.ts:39`).
- **Sorun:** Admin'in fiyatı hatalı girip pasife aldığı veya sezonu biten ürünler doğrudan `itemId` ile alınabilir; katalog yönetimi delinir.
- **Öneri:** `findFirst({ where: { id: itemId, isActive: true } })`; ayrıca body'yi zod ile doğrulayın (`itemId: z.string().cuid()`), yarış sonucu oluşan P2002'yi 409 "Zaten sahipsin" olarak eşleyin (şu an 500).
- **Efor:** S

### 6. [ORTA · Mimari] `imageUrl` alanı üç farklı anlama yükleniyor; admin'in eklediği ürünler yanlış render ediliyor
- **Kanıt:** Çerçeve: efekt anahtarı (`shop-client.tsx:175` → `avatar-frame.tsx:125-132`); rozet: anahtar veya URL (`:190-204`); arka plan: Tailwind sınıfı (`:147`, `customer-dashboard.tsx:443`). Admin formu placeholder olarak URL öneriyor (`app/admin/shop/page.tsx`, `placeholder="https://api.dicebear.com/..."`).
- **Sorun:** Admin URL'li bir çerçeve eklerse müşteri düz daire görür; arka plan için girilen sınıf JIT'te üretilmediyse görünmez; bilinmeyen rozet anahtarı ham metin olarak kullanıcıya basılır (`:208`). Yeni kozmetik eklemek kod değişikliği gerektiriyor, ama bu admin'e söylenmiyor.
- **Öneri:** `CosmeticItem`'a `renderKind` (`effect | image | gradient`) + `assetKey` / `assetUrl` / `style Json` (gradient durakları, animasyon bayrağı, `isAnimated` boolean) alanları ekleyin; tek bir `<CosmeticRenderer item size context>` bileşeni yazıp mağaza, admin, dashboard, vitrin ve header'da onu kullanın (şu an 4 yerde kopya `diamond_badge`/`ruby_badge` dalı var: `customer-dashboard.tsx:530-534`, `showcase-selector.tsx:326-329, 398-401`). Efekt anahtarlarını bir registry'de (`lib/cosmetics/registry.ts`) tutup admin formunda açılır liste olarak sunun. İsim tabanlı "animasyon" sezgisini (`:130`) kaldırın.
- **Efor:** L

### 7. [ORTA · İşlevsellik] Nadirlik sıralaması alfabetik ve nadirlik görünmüyor
- **Kanıt:** `page.tsx:26` `orderBy: [{ rarity: 'desc' }, …]`; `rarity` `String` (`schema.prisma:576`). Kartta yalnız `legendary` renk alıyor (`shop-client.tsx:154`).
- **Sorun:** Sıra "rare → legendary → epic → common" çıkıyor; vitrinin tepesinde en değerli ürünler yerine orta seviye ürünler. Nadirlik, oyunlaştırmanın ana arzu motoru olduğu hâlde kullanıcıya iletilmiyor.
- **Öneri:** `rarity`'yi Prisma enum'a çevirin veya `rarityRank Int` ekleyip ona göre sıralayın. Kartlarda tutarlı nadirlik dili: renkli üst kenar/parıltı + "Efsanevi" etiketi; sıralama seçeneği (Önerilen / Fiyat ↑↓ / Nadirlik / Yeni).
- **Efor:** S

### 8. [ORTA · Ürün] Kozmetikler yalnız sahibine görünüyor — sosyal değer yok
- **Kanıt:** `UserAvatarFrame` kullanımı yalnız `components/dashboard/header.tsx:532`, `customer-dashboard.tsx:457`, `showcase-selector.tsx:228` (hepsi kendi oturumu); liderlik/takım/kategori liderlik sayfalarında yok (grep).
- **Sorun:** Duolingo/Discord kozmetiklerinin değeri başkalarının görmesinden gelir. Burada 10.000 puanlık "Golden Crown" yalnız kullanıcının kendi header'ında; puan harcamak için motivasyon zayıf, ekonominin puan yutağı işlevsiz kalıyor.
- **Öneri:** Liderlik tablosu, squad üyeleri, lig ekranı ve geri bildirim/yorum kartlarında kullanıcının kuşandığı çerçeveyi gösterin. Liste sorgularına `equippedCosmetics: { where: { isEquipped: true }, select: { cosmetic: { select: { type, imageUrl } } } }` ekleyip Redis'te kısa TTL ile önbellekleyin; tek `CosmeticRenderer` küçük boyut varyantıyla.
- **Efor:** M

### 9. [ORTA · i18n] Sunucu mesajları İngilizce, hediye akışı sabit Türkçe; içerik tek dilde
- **Kanıt:** `route.ts:103,110,127,137` ("Already own this item", "Not enough points", "Successfully purchased …"); `[id]/equip/route.ts:65` ("Equipped"/"Unequipped"); istemci önce `data.message`'ı gösteriyor (`shop-interactive.tsx:45,65`). Hediye modalı ve toast'ları sabit TR (`shop-client.tsx:58,76,82,85,265,292-356`). Ürün adı İngilizce/açıklama Türkçe (`cosmetic-demos.ts:20-21`).
- **Sorun:** TR kullanıcı İngilizce toast görüyor, EN kullanıcı Türkçe modal görüyor. Çevrilmiş `purchaseSuccess`/`equipSuccess` anahtarları hiç devreye girmiyor.
- **Öneri:** API'ler insan metni yerine makine kodu dönsün (`{ success:false, code:'INSUFFICIENT_POINTS', required, current }`), istemci koda göre çevirsin. Ürün içeriği için `nameI18n Json`/`descriptionI18n Json` alanları (admin formunda TR/EN). Bildirim metni alıcının `preferredLanguage`'ına göre üretilsin.
- **Efor:** M

### 10. [ORTA · Ekonomi invariantı] Başarım ödülü eşzamanlı isteklerde iki kez kredilenebilir
- **Kanıt:** `lib/achievements.ts:92-123` — `upsert` ile okuma, bellekte `progress + amount`, sonra `update({ where: { id } })`; `completedAt: null` koşulu yok. Çağıranlar: `route.ts:134`, `gift/route.ts:146`.
- **Sorun:** "Koleksiyoncu" ilerlemesi 2'deyken paralel iki satın alma ikisinde de `isNowCompleted` true üretir → 75 puan + 150 XP iki kez. Maliyet kazancı aştığı için istismar ekonomik değil, ama proje kuralı "her puan basan yol atomik tek seferlik olmalı" ile çelişiyor.
- **Öneri:** İlerlemeyi `increment` ile atomik yapın, tamamlamayı `updateMany({ where: { id, completedAt: null, progress: { gte: target } }, data: { completedAt } })` ile koşullu yapın ve ödülü yalnız `count === 1` olduğunda kredileyin.
- **Efor:** S

### 11. [ORTA · Erişilebilirlik/Mobil] Bilgi hover'a, işaretler ikonlara bağlı; form etiketleri ilişkisiz
- **Kanıt:** Yetersiz bakiye örtüsü yalnız `group-hover` (`shop-client.tsx:217`); kuşanıldı yalnız ikon (`:163-167`); sekmelerde rol/durum yok (`:109-120`); `<label>` `htmlFor` yok (`:309, 323`); 8–10px metinler (`:153, 185, 208, 229`).
- **Sorun:** Dokunmatik kullanıcı neden satın alamadığını görmez; ekran okuyucu "kuşanıldı" durumunu ve seçili kategoriyi duyurmaz; 10px açıklamalar mobilde okunaksız.
- **Öneri:** Kartın altında her zaman görünen durum satırı ("1.200 puan eksik" + ilerleme çubuğu), `ToggleGroup`/`Tabs` (Radix) ile `aria-selected`, Badge + görünür "Kuşanıldı" metni, shadcn `Label`+`Input`/`Textarea`. Minimum 12px gövde metni.
- **Efor:** S

### 12. [ORTA · Erişilebilirlik] Glitch çerçevesi hızlı yanıp sönüyor
- **Kanıt:** `components/ui/avatar-frame.tsx:49` `animate-pulse` + `animationDuration: '0.2s'`, `:56-57` `animate-ping` 0.1s/0.3s.
- **Sorun:** Saniyede 3'ten fazla parlaklık değişimi (WCAG 2.3.1) — fotosensitif kullanıcı riski; reduced-motion tercih etmeyen herkeste aktif ve ızgarada diğer çerçevelerle aynı anda oynuyor.
- **Öneri:** Döngüleri ≥ 1s'ye çekin, parlaklık değişimini düşük kontrastlı tutun; mağaza ızgarasında animasyonu yalnız hover/odak/görünür-olan kartta oynatın (IntersectionObserver), detay görünümünde tam animasyon.
- **Efor:** S

### 13. [DÜŞÜK · İşlevsellik] Boş kategori yanlış mesaj veriyor; "Arka Planlar" varsayılan olarak hep boş
- **Kanıt:** `shop-client.tsx:275-283` filtre farkı gözetmeden `emptyTitle` ("Dükkan Henüz Boş"); varsayılan katalogda `profile_background` yok (`cosmetic-demos.ts`).
- **Öneri:** Boş olan kategoriyi sekmede gizleyin veya "Bu kategoride henüz ürün yok — yakında" + "Tümünü göster" eylemi. Ürün sayılarını sekmede gösterin.
- **Efor:** S

### 14. [DÜŞÜK · Performans/Mimari] Ölü kod, ardışık UPDATE'ler, sınırsız sorgu, `any` kaçakları
- **Kanıt:** Kullanılmayan `GET` (`route.ts:12-65`); `[id]/equip/route.ts:44-54` döngüde tek tek update; `page.tsx:24-27` `take` yok; `page.tsx:16`, `shop-client.tsx:111,257` `as any`; `page.tsx:4` `Sparkles` kullanılmıyor; `ShopItem` tipi Prisma tipini elle kopyalıyor (`shop-client.tsx:15-27`).
- **Öneri:** GET'i silin veya yeni tasarımda SWR kaynağı yapın; `updateMany({ where: { userId, isEquipped: true, cosmetic: { type } } })`; katalog sorgusunu `select` ile daraltıp `take` ekleyin ve katalog (kullanıcıdan bağımsız) kısmını Upstash'te kısa TTL ile önbellekleyin; tipi `Prisma.CosmeticItemGetPayload` türetin.
- **Efor:** S

### 15. [DÜŞÜK · Tutarlılık] Fiyat biçimi locale'siz, hidrasyon riski; tema kopuklukları
- **Kanıt:** `shop-client.tsx:238, 304` `toLocaleString()` (argümansız); başlıkta locale'li (`page.tsx:63`). Hediye modalı `bg-slate-950` sabit (`:288`); kart sınırları `white/[0.08]` (açık temada görünmez); satın al butonu dark'ta `hover:bg-amber-50` (`shop-interactive.tsx:110`).
- **Öneri:** Ortak `formatPoints(locale)` yardımcısı; tema token'ları (`border-border`, `bg-card`, `bg-popover`). Hidrasyon uyuşmazlığı doğrulanmadı (çalıştırılmadı), ama risk gerçek.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dolabım / envanter sekmesi** (Duolingo "Shop" + "Inventory", Discord Profile Customization): sahip olunanlar, kuşanılanlar, vitrin ve renk tonu tek yerde; şu an Ayarlar'a dağılmış.
2. **Harcama geçmişi ve makbuz** (Starbucks Rewards "Stars History", Revolut işlem akışı): her harcama/hediye için tarih, tutar, kalan bakiye; bunun için bir puan defteri (`PointLedger`) modeli gerekli.
3. **"Hedefe kalan" ilerlemesi ve istek listesi** (Starbucks "Stars to next reward"): alınamayan ürünlerde "1.200 puan eksik · ~3 QR okutma" tahmini; favoriye ekle ve yeterli bakiyede push bildirimi.
4. **Zamanlı/rotasyonlu vitrin** (Fortnite Item Shop, Duolingo sezonluk): "Haftanın öne çıkanı", sınırlı süreli/sınırlı stoklu ürünler, sezon etkinlikleriyle bağ — ekonominin puan yutağını canlı tutar.
5. **Sosyal görünürlük + hediye deneyimi** (Discord Nitro gift, Spotify Wrapped paylaşımı): alınan hediyenin açılış animasyonu, gönderen ve mesaj kartı, teşekkür et eylemi; çerçevelerin liderlik/takım listelerinde görünmesi.
6. **"Üzerimde dene" önizlemesi** (Discord Profile Preview): ürünü header, dashboard hero ve liderlik satırı bağlamında canlı önizleme, kendi renk tonuyla.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Puanımı neye harcasam?" sorusunu 5 saniyede cevaplayan, ödüller ile kozmetikleri tek bir **Mağaza** çatısında toplayan, satın almayı bir *an* (moment) olarak kutlayan ve aldığın şeyin **başkalarına görünmesini** sağlayan bir deneyim. Ton: Revolut'un net bakiye/işlem hissi + Duolingo'nun koleksiyon arzusu.

**Yerleşim (mobil öncelikli):**
1. **Bakiye başlığı (yapışkan):** büyük tabular sayı, "son 7 günde +340" mini trendi, "Geçmiş" bağlantısı (harcama defteri).
2. **Öne çıkan şerit:** haftanın ürünü / sınırlı süreli ürün — büyük önizleme, geri sayım, kalan stok.
3. **Segment kontrol:** `Ödüller` · `Kozmetik` · `Dolabım` (Radix Tabs, URL `?tab=` ile senkron, paylaşılabilir).
4. **Kozmetik ızgarası:** tür çipleri (sayılı, boş olan gizli) + sıralama menüsü + "Alabileceklerim" anahtarı. Kart: üstte nadirlik şeridi, ortada kullanıcının kendi avatarı/ton ile önizleme, altta fiyat + her zaman görünen durum satırı ("Sahipsin · Kuşanıldı" / "1.200 puan eksik" mini ilerleme).
5. **Ürün detay sayfası/alt sayfası:** büyük animasyonlu önizleme, "header'da / liderlikte nasıl görünür" bağlam sekmeleri, açıklama, nadirlik, kaç kişinin sahip olduğu; birincil eylem Satın Al → onay → kutlama → "Şimdi kuşan" / "Hediye et".
6. **Dolabım:** kuşanılan çerçeve, vitrin 3 slotu (sürükle-bırak), renk tonu kaydırıcısı (Ayarlar'dan taşınır), hediye edilenler "X'ten" etiketiyle.

**Motion / 3D (ölçülü):**
- Izgarada animasyonlar yalnız görünür + hover/odaklı kartta oynasın; diğerleri durağan poster karesi — hem pil hem odak için.
- Satın alma başarısında tek seferlik, 600–800ms'lik kutlama: kart yerinde "mühürlenir" (scale 1→1.04→1, nadirlik renginde parıltı), bakiye sayacı geriye sayar. framer-motion `m` + `useReducedMotion` ile; reduced-motion'da yalnız renk geçişi.
- 3D yalnız **efsanevi** ürünlerin detay görünümünde ve hediye açılışında anlamlı; projedeki imza sürpriz kutusu (three.js, `ssr:false` code-split) hediye açılışı için yeniden kullanılabilir. Izgarada three.js kullanılmamalı.
- Glitch gibi stroboskopik efektler 1s+ döngüye çekilmeli.

**Veri / API değişiklikleri:**
- `CosmeticItem`: `rarity` → enum + `rarityRank`, `renderKind`, `assetKey`, `assetUrl`, `style Json`, `nameI18n`, `descriptionI18n`, `availableFrom/Until`, `stockLimit`.
- Yeni `PointLedger` (userId, delta, reason enum: `SHOP_PURCHASE | GIFT_SENT | REWARD_REDEEM | …`, refId, balanceAfter) — `debitPoints` ve `creditPointsAndXp` aynı tx içinde kayıt yazsın; "Geçmiş" ekranı ve dolandırıcılık analizi buradan beslenir.
- `POST /api/customer/shop` → zod gövde, `isActive` + zaman penceresi kontrolü, `Idempotency-Key`, makine kodlu hata yanıtları, P2002 → 409.
- `POST /api/customer/shop/gift` → `recipientUserId` (isimle eşleme yok), alıcı arama ucu (yalnız arkadaş/squad), Upstash rate limit, alıcının diline göre bildirim; alıcı tarafında `GET /api/customer/inventory` gönderen + mesajla.
- `PATCH /equip` → `updateMany`, tür başına tek kuşanma garantisi (kısmi benzersiz indeks: `UNIQUE (userId, type) WHERE isEquipped` — tür alanı `UserCosmetic`'e denormalize edilerek), rozet için ürün kararı uyarınca `equippedBadge` JWT alanı veya vitrin eylemi.
- Katalog (kullanıcıdan bağımsız) Upstash'te 5 dk TTL; admin değişikliğinde tag ile geçersiz kılma.
- Liste uçlarına (liderlik, squad) kuşanılmış çerçeve/rozet alanı; tek `CosmeticRenderer` bileşeni.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/rewards` ile çakışma (güçlü):** İkisi de aynı `User.points` bakiyesini harcayan katalog sayfası; `rewards` da `ShoppingBag`/`Store` ikonlarıyla "mağaza" dilini kullanıyor (`app/customer/rewards/page.tsx:9-20`). Kullanıcı açısından "puanımı nereye harcarım" tek soru. **Öneri:** `/customer/rewards` altında `Ödüller | Kozmetik | Dolabım` sekmeli tek Mağaza hub'ı; `/customer/shop` → `/customer/rewards?tab=cosmetics` yönlendirmesi. Sidebar'da tek "Mağaza" girişi (`components/dashboard/sidebar.tsx:303`), `lib/visibility-controls.ts:94` ve `lib/qra-knowledge-base.ts:30,99` eşlenmeli.
- **`/customer/settings` › Vitrin (`components/customer/showcase-selector.tsx`, `app/customer/settings/page.tsx:1051`) ile parçalanma:** Sahip olunan kozmetiklerin iğnelenmesi ve çerçeve renk tonu Ayarlar'da, kuşanma Mağaza'da. Bunlar "Dolabım" sekmesinde birleşmeli; Ayarlar'da yalnız bir kısayol kalmalı.
- **`/customer/discover`** (`app/customer/discover/page.tsx:39`) yalnız bağlantı veriyor — sorun değil, hedef URL güncellenmeli.
- **İsimlendirme tutarsızlığı:** aynı sayfa "Çerçeve & Rozet Dükkanı" (başlık), "Çerçeve dükkanı" (metadata), "Avatar Dükkanı" (`visibility-controls.ts:94`), "Çerçeve Dükkanı" (`qra-knowledge-base.ts:30`) olarak geçiyor — birleşmede tek ad seçilmeli.
- Kaldırma önerilmez: puan ekonomisinin dijital yutağı olarak değerli; ancak sosyal görünürlük olmadan bu değer gerçekleşmez (Bulgu 8).

---

## Doğrulama (şüpheci inceleme)

### 1. Hediye alıcısı isimle `findFirst` — aynı isimli rastgele kullanıcıya geri alınamaz puan harcaması — **DOĞRULANDI**
- `prisma/schema.prisma:31` `User.name String?` — ne `@unique` ne de indeks; yalnız `email` benzersiz (`:32`).
- `app/api/customer/shop/gift/route.ts:67-76`: `findFirst` + `OR [email equals insensitive, name equals insensitive]` + `role: 'CUSTOMER'`, `orderBy` yok → birden fazla eşleşmede Postgres'in döndürdüğü sıra belirsizdir (planlayıcıya/fiziksel sıraya bağlı).
- `:107-133` tek tx içinde `debitPoints` + `userCosmetic.create` + bildirim; kodda hediyeyi geri alan/iade eden hiçbir yol yok (`giftedByUserId` yalnız bu dosyada geçiyor; admin tarafında `userCosmetic.delete` yok).
- İstemci: `app/customer/shop/shop-client.tsx:55-88, 308-320` — serbest metin alanı, alıcı önizlemesi/onayı yok; istek doğrudan gönderiliyor. Alıcının kim olduğu ancak başarı tostundan (`route.ts:149`) sonradan anlaşılıyor; o da çoğu zaman yine aynı ismi gösterir, yani yanlış kişiye gittiği fark edilmez.
- **Yeniden üretim:** "Ahmet Yılmaz" adlı iki CUSTOMER olsun. Gönderen, arkadaşı ikinci Ahmet'e hediye etmek için alana "ahmet yılmaz" yazar → `findFirst` ilk satırı (ör. birinci Ahmet) döndürür → gönderenin puanı (ürün fiyatı) düşer, kozmetik yanlış kişiye yazılır, gönderen "Ahmet Yılmaz kullanıcısına başarıyla hediye edildi" görür. Geri dönüş yok.
- Ek alt iddialar: (a) `proxy.ts` içinde `/api/customer/shop` için rate limit yok, rotada da yok — doğru. (b) E-posta numaralandırma: 404 "kullanıcı bulunamadı" vs. 400 "Yetersiz puan"/"zaten sahip"/başarı farkı, oturum açmış bir CUSTOMER'ın bir e-postanın kayıtlı CUSTOMER olup olmadığını sorgulamasına izin verir; ancak sorgulamadan önce gönderenin bakiyesinin fiyatı karşılaması gerekir (`:59-64`) ve başarı durumunda puan harcanır. Yan bulgu olarak gerçek ama düşük önemde. Ayrıca başarı mesajı `recipient.name` yoksa alıcının e-postasını gönderene döndürür (`:149`) — isimle aranıp e-postası açığa çıkmaz çünkü isim eşleşmesinde name doludur; risk ihmal edilebilir.
- **Öneri (rapordaki ile uyumlu):** Uç yalnız `recipientUserId` kabul etmeli; alıcı seçimi ayrı bir arama ucuyla (arkadaş/squad kapsamı, maskelenmiş e-posta + avatar ile) yapılmalı ve diyalog "Şu kişiye gönderilecek: [avatar, ad, maskeli e-posta]" onay adımı göstermeli. Uca Upstash rate limit ve tek tip hata yanıtı eklenmeli.

### 2. Pasif kozmetik ürün doğrudan API ile satın alınabiliyor — **DOĞRULANDI**
- `app/api/customer/shop/route.ts:90` `cosmeticItem.findUnique({ where: { id: itemId } })`, `:95-112` yalnız `!item`, sahiplik ve bakiye kontrolü; `isActive` kontrolü yok. Karşılaştırma: `gift/route.ts:39` `!cosmetic.isActive` kontrol ediyor; `GET` (`route.ts:27`) ve sayfa (`page.tsx:25`) yalnız aktifleri listeliyor.
- Admin `isActive`'i `PATCH /api/admin/cosmetics/[id]` ile kapatabiliyor (`app/api/admin/cosmetics/[id]/route.ts:20,49`) — yani pasife alma gerçek bir yönetim aracı.
- **Yeniden üretim (teknik beceri gerekmez):** Kullanıcı mağaza sekmesini açık bırakır; admin hatalı fiyatlı/sezonu biten ürünü pasife alır; kullanıcı sayfayı yenilemeden "Satın al"a basar (`components/customer/shop-interactive.tsx:38` → `POST /api/customer/shop`) → istek başarılı olur, pasif ürün envantere yazılır. Aynısı önceki bir `GET` yanıtından itemId'yi bilen biri tarafından curl ile de yapılabilir.
- Etki: katalog yönetimi delinir (özellikle hatalı düşük fiyatlı ürün geri çekildiğinde). Önem: orta/yüksek.
- **Öneri:** Satın alma sorgusunu `findFirst({ where: { id, isActive: true } })` yap; ileride `availableFrom/Until` eklenirse aynı yardımcıyla (`getPurchasableCosmetic`) hem satın alma hem hediye ucunda tek noktadan doğrula.

### 3. Başarım ödülü eşzamanlı satın alma/hediyede iki kez kredilenebilir — **DOĞRULANDI** (ekonomik etkisi düşük, invariant ihlali gerçek)
- `lib/achievements.ts:92-102` `upsert(update: {})` ile mevcut satırı okur; `:109-112` ilerleme ve `isNowCompleted` bellekte hesaplanır; `:116-122` `update({ where: { id } })` — `completedAt: null` veya `progress` koşulu yok; `:131-135` `creditPointsAndXp` koşulsuz `increment` yapar (`lib/points-wallet.ts:36-43`), idempotency anahtarı yok.
- Çağıranlar tx DIŞINDA ve sonra: `app/api/customer/shop/route.ts:134`, `gift/route.ts:146`.
- **Yeniden üretim:** `quest-cosmetic-collector` ilerlemesi 2/3 olan kullanıcı iki FARKLI ürünü aynı anda satın alır (aynı ürün `@@unique([userId, cosmeticId])` — `schema.prisma:599` — ile engellenir). Her iki istek de satın alma tx'ini tamamlar, ardından ikisi de `progress=2` okur → ikisi de `newProgress=3`, `isNowCompleted=true` → 75 puan + 150 XP iki kez kredilenir, iki `points_credited` olayı ve iki bildirim yazılır. Daha da kolayı `quest-gift-master` (hedef 1): ilk iki eşzamanlı hediye 0→1'i iki kez görür, 100 puan + 200 XP iki kez basılır.
- Ekonomik istismar zayıf: her tekrar için 1500+ puanlık gerçek bir harcama gerekir ve başarım tek seferliktir (bir kez tamamlandıktan sonra `:104` erken döner), yani kullanıcı başına en fazla birkaç yüz fazladan puan. Ancak "her puan basan yol atomik tek seferlik" proje invariantını açıkça ihlal ediyor ve aynı yardımcı diğer başarımlarda da (`quest-color-wizard`, `quest-showcase-master`) kullanılıyor.
- **Öneri:** İlerlemeyi atomik `increment` ile yaz, tamamlanmayı koşullu geçişle tek sefere bağla: tx içinde `updateMany({ where: { id, completedAt: null, progress: { gte: target - amount } }, data: { completedAt: now } })` → `count === 1` ise kredi ver; aksi halde hiçbir şey basma. `set` modu için de aynı `completedAt: null` koruması.
