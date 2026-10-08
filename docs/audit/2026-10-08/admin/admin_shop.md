# /admin/shop

**Amaç:** Müşteri tarafındaki kozmetik mağazasının (`/customer/shop`) ürün kataloğunu yönetmek: avatar çerçevesi, profil rozeti ve profil arka planı ürünlerini oluşturmak, düzenlemek, fiyatlamak, satıştan kaldırmak ve demo seti yüklemek. Puan ekonomisinde "puan harcama" (sink) tarafının iki kataloğundan biri (diğeri `/admin/rewards` → `Reward` modeli).

**Genel puan:** 4.8 / 10 · **Karar:** yeniden tasarla (orta vadede `/admin/rewards` ile tek bir "Mağaza & Katalog" yüzeyinde birleştirilmeli)

Sayfa temel CRUD'u yapıyor ve API tarafı (zod doğrulama, rol kontrolü, audit log, rate limit) makul bir iskelete sahip. Ancak asıl sorun ürün sözleşmesinde: `imageUrl` alanı dört farklı anlam taşıyor (URL, çerçeve efekt kimliği, rozet anahtarı, Tailwind sınıfı) ve admin formu bunlardan yalnızca birini (URL) anlatıyor. Bu yüzden admin'in "Yeni ürün" ile oluşturduğu çerçeve ve arka planlar müşteride bozuk ya da varsayılan görünüyor, admin önizlemesi ise doğruymuş gibi gösteriyor. Üstüne "Satışta / aktif" anahtarı satın alma API'sinde uygulanmıyor ve "Demo ürünleri yükle" admin düzenlemelerini sessizce eziyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | CRUD çalışıyor, ama "aktif değil" satın almada uygulanmıyor, URL'li çerçeve ve arka plan müşteride bozuk görünüyor, seed düzenlemeleri eziyor; silme/arşiv, arama ve metrik hiç yok. |
| UX | 4/10 | Ham enum değerleri (`avatar_frame`, `common`), yanlış birim ("XP"), serbest metin nadirlik, boş durum yok, önizleme müşteriyle tutarsız; fiyat değişikliğinde onay ya da etki bilgisi yok. |
| Görsel | 5/10 | Hero ve kartlar diğer admin sayfalarıyla tutarlı; ancak sol şerit rengi indekse göre dönüyor (anlamsız), nadirlik görsel dile yansımıyor, kartlar katalog için fazla büyük. |
| Mimari | 4/10 | `imageUrl` aşırı yüklenmiş, nadirlik ve tür DB'de serbest string, render mantığı admin ile müşteri arasında kopyalanmış; audit kısmi, slug çakışması 500'e düşüyor. |
| Performans | 7/10 | Tek GET, `take: 500`, istemci tarafında hafif; sayfalama ve sanallaştırma yok ama katalog küçük. Seed 8 ardışık upsert yapıyor (kabul edilebilir). |
| Erişilebilirlik + mobil | 5/10 | Grid ve hero aksiyonları mobilde sarılıyor, global reduced-motion var; ama düzenle ikon butonunun etiketi yok, Tür `Label`'ı kontrole bağlı değil, görseller `alt=""`. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Kenar çubuğu girişi ("avatar_shop") | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:198` | Etiket anahtarı "avatar_shop": kapsam artık rozet ve arka planı da içeriyor. |
| 2 | Sayfa erişimi (rol + gizli kapı) | ÇALIŞIYOR | `proxy.ts:60-87` | `/admin/*` sayfası için ADMIN rolü ve gate cookie zorunlu. |
| 3 | API erişimi (rol kontrolü) | KISMİ | `app/api/admin/cosmetics/route.ts:24,39`, `lib/api-auth.ts:53-79`, `proxy.ts:102-116` | Rol kontrolü ve token-replay var, **gate cookie kontrolü yok** (bkz. Bulgu 2). |
| 4 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `app/admin/shop/page.tsx:173-178` | Ortak `AdminPremiumHero`, `tone="auto"`. |
| 5 | "Yenile" butonu | ÇALIŞIYOR | `page.tsx:181-184` | Yüklenirken disabled ve dönen ikon var. |
| 6 | "Demo ürünleri yükle" | KISMİ (riskli) | `page.tsx:86-99,185-194`; `lib/cosmetic-seed-server.ts:19-27` | Onay yok; mevcut demo ürünlerin fiyat, ad ve aktifliğini ezip yeniden aktif ediyor. |
| 7 | "Yeni ürün" butonu | ÇALIŞIYOR | `page.tsx:101-105,195-198` | Formu sıfırlayıp dialog açıyor. |
| 8 | Liste yükleme (GET) | ÇALIŞIYOR | `page.tsx:68-84`; `route.ts:23-36` | `take: 500`, sayfalama yok; sıralama aktif önce, sonra yeni önce. |
| 9 | Yükleniyor durumu | KISMİ | `page.tsx:203-207` | Spinner ve metin var. Her yenilemede grid tamamen kayboluyor (layout zıplaması), iskelet yok. |
| 10 | Hata durumu | KISMİ | `page.tsx:75-77` | Yalnızca toast gösteriliyor; ekranda hata ya da tekrar dene bloğu yok, eski liste kalıyor. |
| 11 | Boş durum | EKSİK | `page.tsx:209-267` | `items.length === 0` iken boş grid çiziliyor; "ilk ürünü oluştur / demo yükle" yönlendirmesi yok. |
| 12 | Kart: Aktif/Kapalı rozeti | ÇALIŞIYOR | `page.tsx:216-218` | |
| 13 | Kart: ürün adı | ÇALIŞIYOR | `page.tsx:219` | |
| 14 | Kart: slug ya da kısa id | ÇALIŞIYOR | `page.tsx:220-222` | Kopyalama aksiyonu yok. |
| 15 | Kart: düzenle (kalem) butonu | KISMİ | `page.tsx:224-226` | Çalışıyor; `aria-label` ve tooltip yok, ekran okuyucu "button" diye okur. |
| 16 | Kart: sol renk şeridi | SAHTE | `page.tsx:212` | Renk `i % 3` ile dönüyor, nadirlik, durum ya da türle ilgisi yok; bilgi taşımayan dekor. |
| 17 | Önizleme: `diamond_badge` / `ruby_badge` | ÇALIŞIYOR | `page.tsx:231-234` | Sabit kodlanmış iki anahtar. |
| 18 | Önizleme: `*_effect` çerçeve | KISMİ | `page.tsx:235-240`; `components/ui/avatar-frame.tsx:124-132` | Tanımlı 6 efekt dışında `_effect` ile biten değer sessizce DefaultFrame'e düşüyor, uyarı yok. |
| 19 | Önizleme: URL görseli | KISMİ (yanıltıcı) | `page.tsx:241-249`; `avatar-frame.tsx:124-132` | Admin URL'yi görsel olarak gösteriyor, ama müşteride `avatar_frame` URL'si render edilmiyor (DefaultFrame). `next/image` host allowlist'i R2'yi içermiyor (`next.config.js:272-291`). |
| 20 | Önizleme: `profile_background` | BOZUK | `page.tsx:231-257`; `app/customer/shop/shop-client.tsx:146-147`; `components/customer/dashboard/customer-dashboard.tsx:441-444` | Müşteri tarafı `imageUrl`'yi **Tailwind className** olarak kullanıyor; admin bunu ham metin ya da "görsel yok" olarak gösteriyor. |
| 21 | Önizleme fallback'i | KISMİ | `page.tsx:252` | `'No Image'` İngilizce sabit; TR arayüzde dil karışıklığı. |
| 22 | Kart: tür rozeti | KISMİ | `page.tsx:260` | Ham enum gösteriliyor (`avatar_frame`); çeviri yok. |
| 23 | Kart: nadirlik rozeti | KISMİ | `page.tsx:261` | Ham değer (`common`, `legendary`); renk ya da ikon kodlaması yok. |
| 24 | Kart: fiyat | BOZUK (etiket) | `page.tsx:262` vs `lib/points-wallet.ts:75-99` | "XP" yazıyor, satın alma ise `points` düşüyor; form "Fiyat (puan)" diyor (`messages/tr.json`). |
| 25 | Dialog: yeni/düzenle başlığı ve ipucu | KISMİ | `page.tsx:272-275` | İpucu "Dicebear veya CDN" diyor; efekt kimliği ve sınıf semantiğinden hiç bahsetmiyor. |
| 26 | Alan: Ad | ÇALIŞIYOR | `page.tsx:277-280`; zod `min(1).max(200)` | Boşken Kaydet disabled (`page.tsx:349`). |
| 27 | Alan: Slug | KISMİ | `page.tsx:281-289`; `route.ts:14`; `schema.prisma:570` | İstemci doğrulaması yok. Regex hatası İngilizce zod mesajıyla dönüyor. Benzersizlik çakışması (P2002) generic 500 "Oluşturulamadı" (`route.ts:72-75`). |
| 28 | Alan: Açıklama | KISMİ | `page.tsx:290-297` | Tek satırlık `Input`; 2000 karakterlik metin için `Textarea` olmalı, sayaç yok. |
| 29 | Alan: Tür (Select) | KISMİ | `page.tsx:299-311` | Ham enum etiketleri; `<Label>` `htmlFor`'suz, SelectTrigger `id`'siz. Sahibi olan ürünün türü değişebiliyor (bkz. Bulgu 9). |
| 30 | Alan: Fiyat | KISMİ | `page.tsx:312-321`; `route.ts:17` | Ondalık girince sunucu İngilizce "Expected integer" döner. Fiyat değişikliğinde etki ya da onay bilgisi yok. |
| 31 | Alan: Görsel URL | BOZUK (sözleşme) | `page.tsx:323-331` | Tek serbest metin alanına 4 farklı semantik yükleniyor; yükleme, seçim ya da doğrulama yok. |
| 32 | Alan: Nadirlik | KISMİ | `page.tsx:332-339`; `route.ts:19` | Serbest metin; müşteri `=== 'legendary'` kontrol ediyor (`shop-client.tsx:127`). "Legendary" yazımı efektleri kapatır. |
| 33 | Alan: Satışta / aktif anahtarı | KISMİ | `page.tsx:340-343` | Admin ve listede doğru; **satın alma API'si `isActive`'i kontrol etmiyor** (bkz. Bulgu 1). |
| 34 | İptal | ÇALIŞIYOR | `page.tsx:346-348` | Kirli form uyarısı yok. |
| 35 | Kaydet (oluştur: POST) | ÇALIŞIYOR | `page.tsx:143-160`; `route.ts:38-76` | Zod, rate limit ve audit var. |
| 36 | Kaydet (güncelle: PATCH) | ÇALIŞIYOR | `page.tsx:125-142`; `[id]/route.ts:23-83` | Her seferinde tüm alanları gönderiyor (dirty-diff yok); eşzamanlı düzenleme koruması yok. |
| 37 | Audit log (oluştur/güncelle/seed) | KISMİ | `route.ts:61-70`; `[id]/route.ts:59-77`; `seed-demos/route.ts:20-29` | PATCH'te old/new yalnızca `name/price/isActive`; tür, görsel, nadirlik ve slug değişimi iz bırakmıyor. Seed hangi ürünleri ezdiğini kaydetmiyor. |
| 38 | Admin rate limit | KISMİ | `lib/rate-limit.ts:303-318` | Bellek içi Map, serverless'ta instance başına; sistemik zayıflık. |
| 39 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:12-19` | "Basarili: " (ş eksik) ve "Dikkat: " önekleri EN dilinde de Türkçe. Sunucu hata metinleri yalnızca Türkçe ve doğrudan gösteriliyor. |
| 40 | Silme / arşivleme | EKSİK | `[id]/route.ts` (yalnızca PATCH) | Silme yok (cascade `UserCosmetic`'i siler, bu yüzden doğru olan arşiv), arşiv/çoğalt da yok. |
| 41 | Arama / filtre / sıralama | EKSİK | `page.tsx:209-266` | Tür, durum ve nadirliğe göre filtre ya da arama yok. |
| 42 | Satış ve sahiplik metrikleri | EKSİK | `route.ts:27-30` | `owners` ilişkisi var (`schema.prisma:580`) ama sayılmıyor; kaç kişi aldı, kaç puan harcandı görünmüyor. |
| 43 | Görsel yükleme (R2) | EKSİK | `page.tsx:323-331` | Projede R2 altyapısı var, burada kullanılmıyor. |
| 44 | Müşteri görünümü önizlemesi | EKSİK | — | Müşteri kartının birebir önizlemesi yok; admin render'ı farklı mantıkla kopyalanmış. |
| 45 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:180,209,271,298` | Grid 1→2→3 sütun, aksiyonlar `flex-wrap`, dialog `max-h-[90vh]` ve kaydırma var. |
| 46 | Azaltılmış hareket | ÇALIŞIYOR | `app/globals.css:801-807,824-830` | Global CSS, çerçeve animasyonlarını (`avatar-frame.tsx`, 21 `animate-*`) da bastırıyor. |
| 47 | i18n | KISMİ | `messages/tr.json:3304-3335` | Sayfa metinleri çevrilmiş, ama enum'lar, "No Image", "XP", sunucu ve zod mesajları çevrilmemiş. |

**Durum sayımı (47 özellik):** ÇALIŞIYOR 16 (#1, 2, 4, 5, 7, 8, 12, 13, 14, 17, 26, 34, 35, 36, 45, 46) · KISMİ 21 · BOZUK 3 (#20, 24, 31) · SAHTE 1 (#16) · EKSİK 6 (#11, 40, 41, 42, 43, 44)

---

## Bulgular

### 1. Pasif ("satıştan kaldırılmış") ürünler satın alma API'sinden hâlâ satın alınabiliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** S
- **Kanıt:** `app/api/customer/shop/route.ts:89-112`. `cosmeticItem.findUnique({ where: { id: itemId } })` sonrası yalnızca `!item`, `alreadyOwned` ve bakiye kontrolü var, `item.isActive` kontrolü yok. Karşılaştırma için hediye uç noktası bunu yapıyor: `app/api/customer/shop/gift/route.ts:39` (`if (!cosmetic || !cosmetic.isActive)`). Müşteri vitrini pasifleri SSR'da gizliyor (`app/customer/shop/page.tsx:24-27`), ama API doğrudan çağrılabilir.
- **Sorun:** Admin'in bu sayfadaki "Satışta / aktif" anahtarı (`page.tsx:340-343`) bir sunucu garantisi değil, yalnızca vitrin filtresi. Fiyatı hatalı girilip acilen kapatılan bir ürün (ör. 0 puana düşürülmüş "Golden Crown") ID'yi bilen herkes tarafından satın alınmaya devam eder. Bu, puan ekonomisinin "admin kapatırsa harcama da kapanır" varsayımını bozuyor.
- **Öneri:** Satın alma sorgusunu `findFirst({ where: { id, isActive: true } })` olarak değiştirin ve pasif için 404 ya da 409 dönün. Daha sağlamı, satın alma işlemini `$transaction` içinde `isActive` ve fiyatı yeniden okuyarak yapın. İstemcinin gördüğü fiyatı `expectedPrice` olarak POST'a ekleyip uyuşmazlıkta 409 dönün; böylece admin fiyatı yükselttiği anda eski fiyatla satın alma da engellenir. Admin sayfasında da anahtarın etkisini yazın: "Kapalı ürün satın alınamaz ve hediye edilemez; sahipleri kullanmaya devam eder."

### 2. Admin API'leri gizli kapıyı (gate cookie) uygulamıyor; yalnızca rol yetiyor (sistemik)
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `proxy.ts:102-116`. `/api/` ile başlayan her istek yalnızca güvenlik ve CORS başlıklarıyla `NextResponse.next()` alıyor; gate kontrolü (`proxy.ts:79-87`) yalnızca `pathname.startsWith('/admin')` için çalışıyor. `lib/api-auth.ts:53-79` (`requireAuth`) rol ve token-replay'e bakıyor, gate'e bakmıyor. `app/api/admin/cosmetics/route.ts:24,39` ve `[id]/route.ts:24` yalnızca `requireAuth(['ADMIN'])` çağırıyor.
- **Sorun:** Proje hafızasındaki ilke "rol yetmez, gizli cevap da gerekir". Rolü kazara ya da kötü niyetle ADMIN yapılmış bir hesap sayfayı açamaz, ama `PATCH /api/admin/cosmetics/:id` ile tüm ürünleri 0 puana çekebilir ya da seed tetikleyebilir. Bu sayfaya özgü değil, tüm `/api/admin/*` için geçerli.
- **Öneri:** Gate doğrulamasını (`gateCookieBelongsTo`) `requireAuth`'a ADMIN rolü istendiğinde zorunlu bir adım olarak ekleyin (Node runtime'da `cookies()` ile), ya da proxy'de `/api/admin/` önekine aynı kontrolü uygulayıp 403 JSON dönün. Proxy yaklaşımı tek noktadan kapatır; `requireAuth` yaklaşımı derinlemesine savunma sağlar. İkisi birlikte idealdir. Değişiklikten sonra gate'siz bir oturumla bir admin uç noktasına istek atan bir entegrasyon testi ekleyin.

### 3. `imageUrl` alanı dört farklı semantik taşıyor; admin'in oluşturduğu çerçeve ve arka planlar müşteride bozuk görünüyor
- **Önem:** yüksek · **Kategori:** mimari / işlevsellik · **Efor:** L
- **Kanıt:**
  - Çerçeve: `components/ui/avatar-frame.tsx:124-132` yalnızca 6 sabit `*_effect` kimliğini tanıyor, URL verilirse `DefaultFrame` dönüyor. Admin önizlemesi ise aynı URL'yi `next/image` ile görsel olarak gösteriyor (`app/admin/shop/page.tsx:241-249`).
  - Arka plan: müşteri `imageUrl`'yi CSS sınıfı olarak basıyor: `app/customer/shop/shop-client.tsx:146-147` (`cn("absolute inset-0 z-0", item.imageUrl)`), `components/customer/dashboard/customer-dashboard.tsx:441-444`. Admin ise bunu görsel ya da ham metin gibi ele alıyor (`page.tsx:241-257`).
  - Rozet: yalnızca `diamond_badge` ve `ruby_badge` anahtarları ya da URL (`page.tsx:231-234`, `shop-client.tsx:190-197`).
  - Form ipucu yalnızca "Görsel URL'si (Dicebear veya CDN)" diyor (`messages/tr.json`, `adminShop.dialogHint`); placeholder `https://api.dicebear.com/...` (`page.tsx:329`).
- **Sorun:** Admin talimatı izleyip URL'li bir çerçeve oluşturursa müşteri boş varsayılan çerçeve satın alır. URL'li bir arka plan oluşturursa arka plan hiç uygulanmaz; DB'den gelen Tailwind sınıfları da build'de derlenmediği için sınıf yazsa bile büyük olasılıkla görünmez (safelist doğrulanmadı). Admin önizlemesi "her şey yolunda" mesajı veriyor; bu yalan söyleyen önizleme en tehlikeli UX biçimi.
- **Öneri:** Ürünü tipli bir "görsel kaynak" sözleşmesine taşıyın:
  - `CosmeticItem`'a `assetKind` enum'u (`EFFECT | BADGE_PRESET | IMAGE | GRADIENT_PRESET`) ve `assetRef` alanı ekleyin, ya da en azından `imageUrl`'yi türe göre zod `discriminatedUnion` ile doğrulayın (çerçeve: `z.enum(FRAME_EFFECT_IDS) | url`, arka plan: `z.enum(BACKGROUND_PRESETS)`).
  - Efekt ve preset kayıtlarını tek bir `lib/cosmetics/registry.ts` dosyasında toplayın; hem `UserAvatarFrame`, hem müşteri kartı, hem admin bunu okusun.
  - Formda türe göre değişen bir **"Görünüm" seçici** olsun: çerçeve için 6 efekt galerisi artı "özel görsel yükle", rozet için preset galerisi artı yükleme, arka plan için preset gradient galerisi. Serbest metin alanı kaldırılsın.
  - `UserAvatarFrame` URL'li çerçeveyi gerçekten desteklesin (görsel overlay), ya da URL seçeneği çerçeve türü için hiç sunulmasın.
  - Admin önizlemesi müşteri kartı bileşeninin **kendisini** render etsin (aşağıdaki Bulgu 12).

### 4. "Demo ürünleri yükle" admin düzenlemelerini sessizce eziyor ve kapatılmış ürünleri yeniden satışa açıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `lib/cosmetic-seed-server.ts:19-27`. `upsert.update` bloğu `name, description, type, price, imageUrl, rarity` alanlarını ve `isActive: true`'yu yeniden yazıyor. Butonda onay yok (`app/admin/shop/page.tsx:185-194`) ve üretimde görünür. Audit yalnızca `{count: n}` kaydediyor (`seed-demos/route.ts:26`).
- **Sorun:** Admin "Golden Crown"u 10000'den 8000'e indirip ya da satıştan kaldırıp sonra bu butona basarsa (ya da başka bir admin basarsa) değişiklikler geri alınır, ürün yeniden satışa çıkar ve hangi değerlerin ezildiği kayıtta görünmez. Buton etiketi ("yükle") bu yıkıcı etkiyi anlatmıyor.
- **Öneri:** Seed'i **yalnızca eksik olanları ekle** (`createMany({ skipDuplicates: true })` ya da `upsert` içinde `update: {}`) moduna çevirin. "Demo değerlerine sıfırla" ayrı ve açıkça yıkıcı bir aksiyon olsun: hangi ürünlerin hangi alanlarının değişeceğini gösteren bir diff onay diyalogu kullanın. Butonu üretimde gizleyin ya da katalog boşken boş durumun içine taşıyın. Audit'e ezilen ürünlerin önceki değerlerini yazın.

### 5. Fiyat birimi yanlış: kartta "XP", satın almada `points` düşülüyor
- **Önem:** orta · **Kategori:** UX / ekonomi doğruluğu · **Efor:** S
- **Kanıt:** `app/admin/shop/page.tsx:262` (`{item.price} XP`). Satın alma `debitPoints` ile `points` düşüyor (`app/api/customer/shop/route.ts:119`, `lib/points-wallet.ts:75-99`). Form etiketi "Fiyat (puan)" (`messages/tr.json`, `adminShop.fieldPrice`). Şema yorumu belirsiz: "XP / Puan bedeli" (`prisma/schema.prisma:574`).
- **Sorun:** Sistemde XP ve puan ayrı kavramlar (`creditPointsAndXp`, `lib/points-wallet.ts:27`). Fiyatı XP diye okuyan admin, ekonomi dengesini yanlış ayarlar (XP seviye için birikir, harcanmaz).
- **Öneri:** Kartta i18n'li "puan" birimi ve `toLocaleString` kullanın; şema yorumunu "Puan (points) bedeli; XP değil" diye düzeltin. Fiyat alanının yanında ekonomi bağlamı gösterin: "Ortalama müşteri bakiyesi: X · medyan haftalık kazanım: Y. Bu ürün ≈ N haftalık kazanım". Bu veriyi `/admin/points-matrix` veya `/admin/economy-sim` ile ortak bir uçtan alın.

### 6. Nadirlik serbest metin; müşteri tarafı tam eşleşme ve alfabetik sıralama kullanıyor
- **Önem:** orta · **Kategori:** veri bütünlüğü / UX · **Efor:** S
- **Kanıt:** Form `Input` (`page.tsx:332-339`); zod `z.string().max(40)` (`route.ts:19`, `[id]/route.ts:19`). Müşteri `item.rarity === 'legendary'` kontrolü yapıyor (`app/customer/shop/shop-client.tsx:127`) ve `orderBy: [{ rarity: 'desc' }]` ile sıralıyor (`app/customer/shop/page.tsx:26`). Demo tipi ise `'common' | 'rare' | 'epic' | 'legendary'` (`lib/cosmetic-demos.ts:12`).
- **Sorun:** "Legendary", "efsanevi" ya da sondaki boşluk efsanevi parıltısını kapatır. String desc sıralaması "rare > legendary > epic > common" verir; vitrin sırası anlamsızlaşır.
- **Öneri:** Nadirliği zod `z.enum(RARITIES)` ile sınırlayın (ileride Prisma enum'una ya da `rarityRank Int` alanına geçin). Formda renk kodlu bir segment kontrol kullanın: Common gri, Rare mavi, Epic mor, Legendary altın. Müşteri sıralamasını `rarityRank` üzerinden yapın. Mevcut verideki serbest değerleri normalize eden tek seferlik bir kontrol listesi çıkarın (DB'ye dokunmadan önce rapor; burada doğrulanmadı).

### 7. Slug çakışması ve doğrulama hataları kötü yönetiliyor (500, İngilizce zod mesajı)
- **Önem:** orta · **Kategori:** hata yönetimi / i18n · **Efor:** S
- **Kanıt:** `slug String? @unique` (`prisma/schema.prisma:570`). POST ve PATCH'te `P2002` yakalanmıyor, generic 500 "Oluşturulamadı" ya da "Güncellenemedi" dönüyor (`route.ts:72-75`, `[id]/route.ts:79-82`). Zod hatası `parsed.error.errors[0]?.message` ile ham İngilizce olarak dönüyor (`route.ts:49`), örneğin büyük harfli slug için "Invalid" ya da ondalık fiyat için "Expected integer, received float". İstemci bunu doğrudan toast'luyor (`page.tsx:165`).
- **Sorun:** Admin hangi alanın neden reddedildiğini anlamıyor; benzersizlik çakışması sunucu hatası gibi görünüyor.
- **Öneri:** `P2002`'yi 409 `{ field: 'slug', code: 'SLUG_TAKEN' }` olarak dönün. Zod hatalarını `flatten().fieldErrors` ile alan bazında döndürüp formda ilgili alanın altında gösterin (`react-hook-form` + `zodResolver`, aynı şemayı `lib/cosmetics/schema.ts`'ten paylaşarak). Slug'ı addan otomatik üretin (slugify), istemci tarafında canlı doğrulayın, fiyatı `step=1` ve tamsayıya yuvarlanmış tutun.

### 8. Audit kaydı kısmi: tür, görsel, nadirlik ve slug değişiklikleri iz bırakmıyor
- **Önem:** orta · **Kategori:** gözlemlenebilirlik / uyum · **Efor:** S
- **Kanıt:** `app/api/admin/cosmetics/[id]/route.ts:65-74`. `oldData` ve `newData` yalnızca `name, price, isActive` içeriyor. Audit yazımı update ile aynı transaction'da değil (`55-77`). Seed audit'i yalnızca sayı içeriyor (`seed-demos/route.ts:26`).
- **Sorun:** "Bu çerçevenin görseli kim, ne zaman değiştirdi?" ya da "nadirlik neden değişti?" sorularının cevabı yok. Fiyat değişikliği kayıtlı, ama ekonomi açısından kritik olan tür değişikliği kayıtsız.
- **Öneri:** Değişen alanların tam diff'ini (`changedFields`, önce/sonra) yazın; update ile audit'i `$transaction` içine alın. Sayfaya ürün bazında bir "Geçmiş" sekmesi ekleyin (`AuditLog where entity='CosmeticItem' and entityId=…`).

### 9. Sahipli ve kuşanılmış ürünlerin türü değiştirilebiliyor; kuşanma tutarlılığı bozulur
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** PATCH `type`'ı koşulsuz güncelliyor (`[id]/route.ts:46`). Kuşanma "aynı türden tek ürün" kuralını yalnızca kuşanma anında uyguluyor (`app/api/customer/shop/[id]/equip/route.ts:42-55`). Okuyucular `find(type === …)` ile ilk eşleşeni alıyor (`app/api/customer/equipped-cosmetics/route.ts:26-27`, `lib/auth.ts:246-249`).
- **Sorun:** Bir müşteri X rozetini ve Y çerçevesini kuşanmışken admin X'in türünü `avatar_frame` yaparsa kullanıcıda iki kuşanılmış çerçeve olur; hangisinin görüneceği belirsizleşir. Ayrıca rozet olarak satın alınan ürün bir anda çerçeveye dönüşür.
- **Öneri:** `owners` sayısı 0'dan büyükse tür alanını kilitleyin (UI'da disabled ve açıklama, API'de 409). Gerçekten gerekiyorsa "yeni ürün olarak çoğalt" akışı sunun.

### 10. Önizleme `next/image` host allowlist'ine bağımlı; müşteri ise `unoptimized` kullanıyor
- **Önem:** düşük · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** Admin `unoptimized`'ı yalnızca `.svg` uzantısında açıyor (`page.tsx:242-249`). Müşteri her zaman `unoptimized` kullanıyor (`shop-client.tsx:195-204`). `remotePatterns`'ta R2 ya da genel CDN host'u yok (`next.config.js:272-291`). Dicebear URL'leri genelde `/svg?seed=` biçiminde ve `.svg` ile bitmiyor.
- **Sorun:** Allowlist dışındaki bir host'tan eklenen görsel admin'de kırık görünür (prod'da optimizer 400 döner; dev'de hata fırlatır), müşteride ise çalışır; tersine tutarsızlık. Dicebear SVG'sinin optimizer üzerinden davranışı burada doğrulanmadı.
- **Öneri:** Görselleri R2'ye yükleme akışına bağlayın (Bulgu 3) ve R2 public host'unu `remotePatterns`'a ekleyin. Kullanıcı girdisi URL'ler için admin'de de `unoptimized` ya da `<img>` kullanın. Kaydetmeden önce `HEAD` isteğiyle erişilebilirlik ve content-type kontrolü yapın.

### 11. Durum yönetimi eksik: boş durum yok, hata yalnızca toast, yenilemede grid kayboluyor
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:203-268`. Boş liste için dal yok. `catch` yalnızca toast atıyor (`75-77`). `loading` true iken grid tamamen unmount oluyor (`203-207`).
- **Öneri:** Üç ayrı durum tasarlayın:
  - **Boş:** illüstrasyon, "İlk ürünü oluştur" ve "Demo setini ekle" butonları.
  - **Hata:** satır içi uyarı ve "Tekrar dene".
  - **Yeniden yükleme:** mevcut gridi koruyun, yalnızca üstte ince bir ilerleme çubuğu gösterin; ilk yüklemede kart iskeletleri kullanın.

  Veri katmanını projede zaten bulunan `@tanstack/react-query`'ye (`next.config.js:297`) taşıyın: `useQuery` ve mutasyonlarda `invalidateQueries`, isteğe bağlı optimistic toggle.

### 12. Render mantığı admin ile müşteri arasında kopyalanmış ve sapmış
- **Önem:** düşük · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `app/admin/shop/page.tsx:230-258` ve `app/customer/shop/shop-client.tsx:142-210` aynı `imageUrl` dallanmasını farklı biçimde yapıyor. Müşteride arka plan dalı var, admin'de yok; müşteri `unoptimized`, admin değil; fallback metinleri farklı.
- **Öneri:** `components/cosmetics/cosmetic-preview.tsx` adında tek bir bileşen çıkarın (`item`, `size`, `context: 'shop' | 'admin' | 'profile'`). Admin dialogunda bunun sağ panelde canlı "müşteri kartı" sürümünü gösterin.

### 13. Erişilebilirlik açıkları
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:**
  - Düzenle ikon butonunda `aria-label` yok (`page.tsx:224-226`).
  - Tür `<Label>`'ı kontrole bağlı değil (`page.tsx:300-303`; `htmlFor` ve `id` yok).
  - Ürün görselleri `alt=""` (`page.tsx:244`): ürünün tek görsel temsili dekoratif sayılmış.
  - Kart sol şeridi bilgi taşımıyor (`page.tsx:212`).
- **Öneri:** `aria-label={t('adminShop.editItem', { name })}` ekleyin. Select'e `id` verip `Label htmlFor` ile bağlayın. `alt` olarak ürün adını kullanın. Şeridi nadirlik rengine bağlayıp yanına metin rozeti koyun (renk tek başına bilgi taşımasın). Kartın tamamını klavyeyle odaklanabilir yapın: Enter düzenler.

### 14. Dil karışıklığı ve küçük kod kalitesi sorunları
- **Önem:** düşük · **Kategori:** i18n / kod kalitesi · **Efor:** S
- **Kanıt:**
  - `'No Image'` sabit metni (`page.tsx:252`) ve ham enum'lar (`page.tsx:260-261,306-308`).
  - `lib/admin-toast.ts:12-19` önekleri "Basarili: " (ş eksik) ve "Dikkat: " EN dilinde de görünüyor.
  - Sunucu hata metinleri yalnızca Türkçe (`route.ts:34,43,74`).
  - `app/api/admin/cosmetics/route.ts:8` `import { Prisma }` kullanılmıyor (ölü import).
  - `type: 'avatar_frame' as const` (`page.tsx:51`) yüzünden form tipi tek literal oluyor ve `as typeof form.type` cast'leri gerekiyor (`113,301`).
- **Öneri:** Hata kodlarını (`code`) sunucudan döndürüp istemcide i18n ile çevirin. Enum etiketlerini `adminShop.types.*` ve `adminShop.rarity.*` anahtarlarına taşıyın. Toast öneklerini i18n'e alın ya da kaldırın (sonner zaten ikonla durumu belirtiyor). Ölü import'u silin. Form tipini `z.infer<typeof cosmeticSchema>`'dan türetin.

---

## Eksik özellikler (kıyas: Stripe Dashboard Products, Linear, Retool, PostHog)

1. **Ürün performans metrikleri (Stripe Products ve PostHog tarzı):** ürün başına sahip sayısı (`_count.owners`), toplam harcanan puan, son 7 ve 30 gün satış, kuşanma oranı ve hediye oranı. Sayfanın üstünde bir KPI şeridi: aktif ürün sayısı, haftalık puan yakımı, en çok satan ürün. Bunlar mağazanın puan ekonomisindeki "sink" rolünü görünür kılar.
2. **Tablo/ızgara görünümü, arama, filtre ve sıralama (Linear ve Retool tarzı):** tür, durum ve nadirlik filtreleri; ad ve slug araması; fiyat, satış ve tarihe göre sıralama; URL'de kalıcı filtre durumu; çoklu seçimle toplu aksiyonlar (toplu aktif/pasif, toplu fiyat yüzdesi).
3. **Yaşam döngüsü: taslak → yayında → arşiv, zamanlı yayın ve sınırlı stok:** `publishAt` ve `unpublishAt` (sezonluk etkinliklerle entegre), `stock` ya da "limited edition" sayacı (`Reward` modelinde zaten `stock` var), "yeni" etiketi, indirim ve kampanya fiyatı.
4. **Görsel yükleme ve preset galerisi:** R2'ye sürükle-bırak yükleme, boyut ve oran doğrulaması; çerçeve efektleri ve arka plan presetleri için görsel seçici (bkz. Bulgu 3).
5. **Ürün detay çekmecesi ve geçmiş (Stripe tarzı):** sağdan açılan bir drawer'da sekmeler: Genel, Görünüm (canlı müşteri önizlemesi), Sahipler (sayfalı kullanıcı listesi ve "bu kullanıcıya hediye et"), Geçmiş (audit diff).
6. **Güvenli değişiklik kontrolleri:** fiyat değişikliğinde onay ("Bu ürünün 142 sahibi var; yeni fiyat yalnızca yeni satın alımları etkiler"), çoğalt, iyimser kilit (`updatedAt` ile eşzamanlı düzenleme çakışma tespiti; şu an `CosmeticItem`'da `updatedAt` alanı yok, `schema.prisma:567-583`).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin, mağazayı bir "ürün kataloğu ve ekonomi aracı" olarak yönetir. Ne sattığını, ne kadar sattığını ve müşterinin tam olarak ne gördüğünü tek ekranda bilir. Hiçbir değişiklik sessizce yıkıcı olmaz.

**Yerleşim:**
1. **Üst şerit:** kompakt hero (başlık ve birincil "Yeni ürün" aksiyonu) ve altında 4 KPI kutusu (aktif ürün · 30 günlük satış adedi · 30 günlük yakılan puan · en çok satan). Hero'nun büyük dekoratif alanı bu sayfada küçültülmeli; burası bir operasyon ekranı.
2. **Araç çubuğu:** arama, Tür segmenti (Tümü/Çerçeve/Rozet/Arka plan), Durum (Aktif/Kapalı/Taslak), Nadirlik çoklu seçimi, sıralama, ızgara/tablo geçişi. Tablo görünümü varsayılan olsun: küçük önizleme, ad ve slug, tür, nadirlik, fiyat, sahip, 30 günlük satış, durum anahtarı (satır içi, onaylı).
3. **Detay drawer'ı** (dialog yerine, Stripe Products gibi): solda form (react-hook-form ve paylaşılan zod şeması, alan bazında hata), sağda **canlı müşteri kartı önizlemesi** (paylaşılan `CosmeticPreview`, açık/koyu tema geçişi). Görünüm alanı türe göre preset galerisi ya da R2 yükleyici olsun. Alt sekmeler: Sahipler, Geçmiş.
4. **Boş durum:** "Katalog boş", "Demo setini ekle (yalnızca eksikleri ekler)" ve "İlk ürünü oluştur".

**Motion / 3D (ölçülü):**
- Çerçeve efektlerinin CSS animasyonları önizlemede **yalnızca hover ya da focus anında** oynasın. 30 kartlık bir ızgarada aynı anda 20+ sonsuz `animate-spin`/`animate-ping` (`avatar-frame.tsx`) görsel gürültü ve gereksiz GPU yükü yaratıyor. `IntersectionObserver` ve `data-playing` ile kontrol edilebilir.
- Satır içi aktif/pasif değişiminde `m as Motion` ile kısa bir layout geçişi ve rozet renginin yumuşak değişimi yeterli.
- 3B gerekmez. Projedeki imza sürpriz kutusu ya da karakter küresi gibi three.js varlıkları bu operasyon ekranına uygun değil; olsa olsa "Legendary" önizlemesinde müşteriyle aynı parıltı efektini göstermek yeterli. Global reduced-motion (`globals.css:801-830`) korunur.

**Veri / API değişiklikleri:**
- `GET /api/admin/cosmetics?type=&status=&rarity=&q=&sort=&cursor=` uç noktası; yanıtta `_count: { owners }` ve bir `stats` toplamı. Satış sayısı için `UserCosmetic.acquiredAt` ve `giftedByUserId` üzerinden `groupBy` kullanılır; harcanan puan için ayrı bir ledger yoksa `price × sahip` yaklaşımı "yaklaşık" etiketiyle gösterilir. İdeali, satın alma ve hediyede bir puan hareketi kaydı tutmaktır (doğrulanmadı: projede genel bir point-ledger modelinin olup olmadığı bu denetimde incelenmedi).
- Şema: `rarity` enum'u (ya da `rarityRank`), `assetKind` ve `assetRef`, `updatedAt`, `status (DRAFT|ACTIVE|ARCHIVED)`, opsiyonel `stock`, `publishAt` ve `unpublishAt`.
- `PATCH`: `If-Match: updatedAt` ile iyimser kilit, sahipli ürünlerde tür kilidi, tam diff audit'i ve transaction.
- `POST /seed-demos`: "yalnızca eksikleri ekle"; ayrı `POST /seed-demos/reset` (diff onaylı).
- Müşteri `POST /api/customer/shop`: `isActive` ve `expectedPrice` kontrolü transaction içinde (Bulgu 1).
- Tüm `/api/admin/*` için gate zorunluluğu (Bulgu 2).
- Liste uç noktası için Upstash cache gerekmiyor (admin, düşük trafik); ama müşteri vitrini (`/customer/shop`) her istekte tüm aktif kataloğu çekiyor, admin mutasyonları sonrası `revalidateTag('cosmetics')` ile önbelleklenebilir.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/rewards` (`Reward` modeli, `prisma/schema.prisma:680-695`, `/api/gamification/rewards`):** Aynı işi yapan ikinci bir "puanla satın alınan katalog". Orada `cost`, `stock`, `type: digital|physical|coupon` ve `isActive` var; burada `price` ve `isActive` var. İki ayrı fiyat alanı adı, iki ayrı admin akışı, iki ayrı müşteri vitrini var; puan ekonomisinin "harcama" tarafı bölünmüş durumda. **Öneri:** `/admin/shop` ve `/admin/rewards`'ı **"Mağaza & Katalog"** başlığı altında tek sayfada sekmeli birleştirin: Kozmetikler · Ödüller · (ileride) Kampanyalar. Ortak KPI şeridi (toplam puan yakımı), ortak tablo, filtre ve drawer bileşenleri kullanılsın. Veri modelleri ayrı kalabilir; UI ve "puan harcama" metrikleri birleşmeli.
- **`/admin/coupons` ve `/admin/surprise-boxes`:** Ekonomiye dokunuyorlar ama farklı akışlar (kupon ve ödül gönderimi); birleştirme önerilmez. Ürün drawer'ındaki "bu kullanıcıya hediye et" aksiyonu sürpriz kutu gönderim altyapısını yeniden kullanabilir.
- **`/admin/economy-sim`, `/admin/points-matrix`:** Fiyat alanının yanında gösterilecek "bu fiyat kaç haftalık kazanıma denk" bağlamı bu sayfalardaki veriden beslenmeli (bağlantı, birleştirme değil).
- **Kenar çubuğu etiketi:** `avatar_shop` (`sidebar.tsx:198`) kapsamı yansıtmıyor; birleşmeyle "Mağaza & Katalog" olarak yeniden adlandırılmalı.
- Sayfa **kaldırılmamalı**: müşteri mağazasının tek yönetim noktası ve aktif bir puan sink'i.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kaynak koddan yeniden okundu (kod değiştirilmedi, veritabanına dokunulmadı).

### 1. Pasif (isActive=false) kozmetikler doğrudan API ile satın alınabiliyor — **DOĞRULANDI**
- `app/api/customer/shop/route.ts:89-112`: `findUnique({ where: { id: itemId } })` sonrası yalnızca `!item`, `alreadyOwned` ve bakiye kontrol ediliyor; `item.isActive` hiçbir yerde okunmuyor. Transaction (`:118-123`) de koşulsuz `debitPoints` + `userCosmetic.create` yapıyor.
- Karşılaştırma: hediye yolu `app/api/customer/shop/gift/route.ts:39` `!cosmetic.isActive` ile reddediyor; GET listesi `route.ts:27` `isActive: true` filtreliyor. Yani filtre yalnız okuma tarafında.
- **Somut senaryo (ID tahmini bile gerekmez):** Müşteri `/customer/shop` sekmesini açık tutar (ürün kartları ve `itemId` istemcide, `shop-client.tsx:252` → `shop-interactive.tsx:41`). Admin bu sırada yanlış fiyatlanan ürünü `/admin/shop`'ta "Satışta / aktif" anahtarıyla kapatır. Müşteri aynı sekmeden "Satın al"a basar → istek 200 döner, puan düşer, ürün envantere girer. Kapatma, açık oturumlardaki satışı durdurmuyor; aynı itemId ile curl ile de tekrarlanabilir.
- Not: Fiyat, satın alma anında DB'den okunuyor (eski fiyat değil, güncel fiyat düşülüyor); risk "kapalı ürünün satışı", "eski fiyattan satış" değil.

### 2. /api/admin/* uç noktaları admin gizli kapı cookie'sini uygulamıyor — **DOĞRULANDI**
- `proxy.ts:105-119`: `/api/` ile başlayan her istek `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçiyor; gate kontrolü (`proxy.ts:79-87`) yalnız sayfa yollarında çalışıyor.
- `lib/api-auth.ts:53-79` `requireAuth` yalnız oturum + rol + token-replay kontrol ediyor; gate cookie'sine bakmıyor.
- Kod tabanında gate cookie doğrulaması (`gateCookieBelongsTo` / `verifyGateCookie`) yalnız `proxy.ts`, `lib/admin-gate*.ts`, `app/api/admin/gate/route.ts` ve `app/api/admin/settings/admin-gate/route.ts`'de geçiyor (grep ile doğrulandı); hiçbir iş API'si gate'i doğrulamıyor.
- `lib/admin-gate.ts:1-9` ve `proxy.ts:76-78` tasarımın amacını açıkça yazıyor: "rolü kazara/kötü niyetle ADMIN yapılan stajyer bile gizli rakamı bilmeden panele giremez." Bu tehdit modelinde senaryo somut: rolü ADMIN yapılmış ama cevabı bilmeyen hesap, normal giriş yapıp tarayıcı oturum cookie'siyle `PATCH /api/admin/cosmetics/<id>` gövdesi `{"price":0}` gönderir → `[id]/route.ts:24` `requireAuth(['ADMIN'])` geçer, fiyat 0 olur. Aynı şekilde `POST /api/admin/cosmetics/seed-demos` tetiklenebilir.
- Kapsam sistemik: tüm `/api/admin/*` uçları aynı `requireAuth` desenini kullanıyor. Gate'in koruduğu şey pratikte yalnız admin UI'ı.
- Ek gözlem (ayrı bulgu adayı): proxy tarafındaki `gateCookieBelongsTo` (`lib/admin-gate-edge.ts:14-22`) HMAC'i doğrulamıyor, yalnız `<userId>.<64 hex>` biçimine bakıyor; kullanıcı kendi id'sini bildiği için sayfa katmanında da cookie elle sahtelenebilir. Bu, gate'i API'de uygulamanın yanında Node runtime'da `verifyGateCookie` ile tam doğrulamayı da gerekli kılıyor.

### 3. Demo seed admin düzenlemelerini eziyor ve kapalı ürünleri yeniden satışa açıyor — **DOĞRULANDI** (önem: orta; dış saldırgan gerektirmez, admin eliyle tetiklenen veri kaybı)
- `lib/cosmetic-seed-server.ts:19-27`: `upsert.update` dalı `name`, `description`, `type`, `price`, `imageUrl`, `rarity` ve `isActive: true` alanlarını demo sabitleriyle koşulsuz yeniden yazıyor.
- `app/admin/shop/page.tsx:185-194` + `:86-99`: buton onay penceresi olmadan doğrudan `POST` atıyor; i18n metni "Demo ürünleri yükle" (`messages/tr.json:3311`) üzerine yazacağını belirtmiyor, başarı mesajı "Demo ürünler güncellendi."
- `app/api/admin/cosmetics/seed-demos/route.ts:19-28`: audit kaydı yalnız `{ count: n }`; hangi ürünün eski fiyatı/durumu neydi kaydedilmiyor, geri alma imkânı yok.
- **Senaryo:** Admin `golden-crown-frame` (`lib/cosmetic-demos.ts`, fiyat 10000) fiyatını 15000'e çeker ve `toxic-slime-frame`'i satıştan kaldırır. Daha sonra (ya da başka bir admin) katalogda eksik demo olup olmadığını görmek için "Demo ürünleri yükle"ye basar → fiyat 10000'e döner, kapalı ürün `isActive: true` ile vitrine geri gelir; audit'te yalnız "count: 8" görünür.

### 4. Admin'in oluşturduğu URL'li çerçeve ve arka plan ürünleri müşteride bozuk render ediliyor — **DOĞRULANDI**
- Çerçeve: `components/ui/avatar-frame.tsx:124-132` yalnız 6 sabit `*_effect` anahtarını tanıyor; başka her değer (URL dahil) `DefaultFrame`'e düşüyor. Müşteri vitrini `app/customer/shop/shop-client.tsx:175` `UserAvatarFrame frameId={item.imageUrl}` kullanıyor; URL'yi görsel olarak hiçbir yerde basmıyor.
- Arka plan: `shop-client.tsx:146-147` ve `components/customer/dashboard/customer-dashboard.tsx:441-444` `imageUrl`'i doğrudan `className` olarak kullanıyor (`lib/auth.ts:249` token'a da aynı değeri yazıyor). Bir URL CSS sınıfı olarak hiçbir stil üretmez; ayrıca Tailwind JIT kaynakta geçmeyen bir sınıfı derlemediği için admin elle sınıf adı yazsa bile çoğu durumda stil oluşmaz. Demo setinde hiç `profile_background` yok (`lib/cosmetic-demos.ts`: 6 çerçeve + 2 rozet), yani çalışan bir arka plan örneği de bulunmuyor.
- Admin önizlemesi yanıltıcı: `app/admin/shop/page.tsx:241-249` URL'yi türden bağımsız olarak `<Image>` ile gösteriyor; form ipucu (`messages/tr.json:3320` "Görsel URL'si (Dicebear veya CDN) vitrinde gösterilir") ve placeholder (`page.tsx:329` `https://api.dicebear.com/...`) URL girmeye yönlendiriyor.
- **Senaryo:** Admin formda tür `avatar_frame`, Görsel URL `https://cdn.../neon.png` ile ürün oluşturur; admin kartında görsel görünür. Müşteri vitrinde boş varsayılan çerçeve görür, 3000 puan harcayıp satın alıp kuşanır; profilinde hiçbir değişiklik olmaz. `profile_background` için aynı akış kart/dashboard'da hiçbir arka plan uygulamaz. URL'li `profile_badge` ise doğru çalışıyor (`shop-client.tsx:194-203`), bu yüzden sorun yalnız çerçeve ve arka plan türleri için geçerli.

**Özet:** 4 iddianın 4'ü de kodla doğrulandı. Öncelik sırası: 2 (sistemik yetki katmanı açığı) → 1 (puan ekonomisi / satış kontrolü) → 4 (müşteriye karşılıksız puan harcatma) → 3 (admin kaynaklı veri ezme, audit eksikliği).
