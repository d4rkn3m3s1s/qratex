# /admin/discovery

**Amaç:** Müşteri tarafındaki keşif yüzeylerini (`/customer/nearby`, `/customer/trends`, müşteri ana paneli "Size Özel Fırsatlar") besleyen tek bir JSON ayar blobunu (`Settings.key = 'discovery_config'`) yönetmek: "Haftanın Enleri" başlıkları, bayi konum/kategori/çalışma saati satırları ve sponsor/indirim duyuruları. Ek olarak müşteri `nearby` çıktısını admin panelinden önizleme.

**Genel puan:** 3.5 / 10 · **Karar:** yeniden tasarla (konum bölümü bayi profiline birleştirilmeli, sponsor bölümü kendi veri modeline taşınmalı)

Kapsam: `app/admin/discovery/page.tsx` (985 satır, tek dosya, `'use client'`), `app/admin/layout.tsx`, `components/dashboard/page-header.tsx`, `lib/admin-toast.ts`, `lib/discovery-config.ts`, `lib/validations-admin.ts`, `app/api/admin/discovery/route.ts`, `app/api/admin/users/route.ts` (GET), `app/api/customer/discovery/route.ts`, `lib/module-gate.ts`, `proxy.ts`, tüketici sayfalar (`app/customer/trends/page.tsx`, `app/customer/nearby/page.tsx`, `components/customer/dashboard/customer-dashboard.tsx`), `prisma/schema.prisma` (`Settings`, `User.businessHours`), `tailwind.config.ts`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Kaydet/yükle/audit omurgası çalışıyor; ama bayi listesi yanlış veri getiriyor, kategori ve gün alanlarına normal yazım yapılamıyor, sponsor id alanı her tuşta odağı kaybediyor, "Açık/Kapalı" UTC ile hesaplanıyor ve girilen koordinatlar müşteri tarafında çoğu bayi için yok sayılıyor. |
| UX | 3/10 | Ham JSON/ISO/virgüllü metin girişleri, harita yok, onaysız toplu üzerine yazma ("Bayilerden doldur"), kaydedilmemiş değişiklik uyarısı yok, önizleme kaydedilmemiş taslağı değil canlı ayarı test ediyor. |
| Görsel | 3/10 | Konum satırının grid'i (`md:grid-cols-16`) Tailwind 3.4'te üretilmiyor; satırlar masaüstünde dağınık otomatik yerleşime düşüyor; diğer admin sayfalarının çoğunun kullandığı `AdminPremiumHero` yerine eski `PageHeader`. |
| Mimari | 3/10 | Bayi profilinde zaten bulunan konum/adres/çalışma saati verisi ayrı bir JSON blobunda ikinci kez tutuluyor; sunucu şeması `z.unknown()`; eşzamanlılık koruması yok; sponsor alanlarının yarısı hiçbir yerde tüketilmiyor. |
| Performans | 6/10 | Sayfa küçük ve tek istekle yükleniyor; her tuşta tüm config `JSON.stringify` ediliyor ve satır başına `dealers.find` çalışıyor (küçük veri için kabul edilebilir). Önizleme, ağır müşteri ucunu (25k feedback + 20k review taraması) her tıklamada önbelleksiz çalıştırıyor. |
| Erişilebilirlik + Mobil | 3/10 | Konum/sponsor/önizleme alanlarının neredeyse hiçbirinde `Label` yok (yalnız placeholder), ikon-yalnız sil butonlarında `aria-label` yok, `Switch` etiketle bağlı değil, yardım butonunda `aria-expanded` yok; mobilde 9 alanlı satırlar alt alta uzun bir form sütununa dönüşüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı ve açıklaması (`PageHeader`) | ÇALIŞIYOR | page.tsx:400-402 | Başlık "Discovery Yönetimi" — TR/EN karışık; admin sayfalarının ~47'si `AdminPremiumHero`, yalnız 9'u `PageHeader` kullanıyor. |
| 2 | "Yenile" butonu | KISMİ | page.tsx:405-408, 211-225 | Kaydedilmemiş değişiklikleri onaysız siler. |
| 3 | "Bayilerden doldur" toplu doldurma | BOZUK | page.tsx:379-396, 234; users/route.ts:107; validations-admin.ts:10 | `pageSize=200` > max 100 → sorgu şeması düşer, `role` filtresi kaybolur; en yeni 20 kullanıcı (müşteri/admin dahil) "bayi" diye alınır. Koordinatı olmayanlara sahte İstanbul koordinatı uydurur, mevcut tüm satırları onaysız siler. |
| 4 | "Kaydet" butonu | KISMİ | page.tsx:418, 254-280 | Çalışıyor; ama GET hatasında boş varsayılan config ile kaydetmeye açık (bkz. Bulgu 1). |
| 5 | Kirli durum takibi (`isDirty`) | KISMİ | page.tsx:132, 146-147, 219 | `initialSignature` başlangıçta `''`; yalnız başarılı yüklemede set ediliyor. |
| 6 | "Nasıl kullanılır?" açılır yardım | ÇALIŞIYOR | page.tsx:426-451 | `aria-expanded`/`aria-controls` yok; metinde "Pine Uygula" ifadesi. |
| 7 | İstemci tarafı doğrulama + hata kartı | ÇALIŞIYOR | page.tsx:153-183, 453-467 | Bayi tekrarı, enlem/boylam aralığı, sponsor id/başlık. Saat formatı, gün listesi, indirim aralığı, tarih geçerliliği, sponsor id tekilliği, 0/0 koordinatı kontrol edilmiyor. |
| 8 | Düzenlemede doğrulama listesinin temizlenmesi | ÇALIŞIYOR | page.tsx:149-151 | `exhaustive-deps` uyarısı alacak bir efekt; işlevsel olarak doğru. |
| 9 | Haftanın Enleri — Ambiyans başlığı | ÇALIŞIYOR | page.tsx:475-486; customer/discovery/route.ts (weeklyBest) | Uzunluk sınırı yok; i18n desteklemiyor (müşteri UI'ı `t()` kullanırken bu etiket tek dilli). |
| 10 | Haftanın Enleri — Yemek başlığı | ÇALIŞIYOR | page.tsx:487-498 | Aynı not. |
| 11 | Haftanın Enleri — Hizmet başlığı | ÇALIŞIYOR | page.tsx:499-510 | Aynı not. |
| 12 | JSON dışa aktar | KISMİ | page.tsx:311-323 | İndirme çalışır; ancak istemci tipi `imageUrl`'ü taşımadığından dışa aktarılan JSON sunucudaki veriyi tam yansıtmaz; kaydedilmemiş taslağı dışa aktarır (belirtilmiyor). |
| 13 | JSON içe aktar (textarea yapıştırma) | KISMİ | page.tsx:325-334, 530-535 | Şema doğrulaması, fark önizlemesi, dosya seçici yok; tüm config'i sessizce değiştirir; `imageUrl` düşer. |
| 14 | Pin kaynağı ayrıştırma (koordinat / Maps linki) | KISMİ | page.tsx:336-355 | `lat,lng` ve `@lat,lng` biçimleri; `maps.app.goo.gl` kısa linkleri, `!3d..!4d..` biçimi desteklenmez; aralık kontrolü yok. |
| 15 | Pin hedef satır seçici | ÇALIŞIYOR | page.tsx:543-553 | Etiketi yok; satırda bayi adı yerine ham `dealerId` gösterir; satır silindikten sonra indeks kayar. |
| 16 | "Pine Uygula" | KISMİ | page.tsx:357-377, 554-563 | Çalışır; ama müşteri tarafında profil koordinatı olan bayilerde etkisizdir (Bulgu 4). |
| 17 | Konum satırı — bayi seçici | BOZUK | page.tsx:581-598, 231-252 | Liste Bulgu 3 nedeniyle bayi olmayan kullanıcıları içerir; listede olmayan kayıtlı bayi "Bayi seç" olarak görünür, dokunulursa kaybolur. |
| 18 | Bayi e-posta alt yazısı | KISMİ | page.tsx:599-601 | Listede yoksa ham id, o da yoksa literal "dealerId" metni. |
| 19 | "Bayi Profilinden Doldur" | KISMİ | page.tsx:185-209, 602-611 | Yalnız alan 0 ise doldurur; müşteri ucu zaten profil koordinatını öncelikli kullandığından çoğunlukla gereksiz. |
| 20 | Enlem alanı | KISMİ | page.tsx:613-625 | Boşaltınca 0 olur; müşteri ucunda profil enlemi varsa yok sayılır. |
| 21 | Boylam alanı | KISMİ | page.tsx:626-638 | Aynı. |
| 22 | Adres alanı | KISMİ | page.tsx:639-650; customer/discovery/route.ts:397 | Profil adresi varsa yok sayılır. Placeholder İngilizce ("address"). |
| 23 | Kategoriler alanı (virgüllü) | BOZUK | page.tsx:651-668 | Her tuşta `split/trim/filter/join` uygulanır: sondaki virgül ve boşluk anında silinir → elle ikinci kategori ya da çok kelimeli kategori yazılamaz (yalnız yapıştırma çalışır). |
| 24 | Açılış saati | KISMİ | page.tsx:669-680; customer/discovery/route.ts:64-73 | Serbest metin; geçersiz değer sessizce 09:00'a düşer; saat girişi kontrolü yok. |
| 25 | Kapanış saati | KISMİ | page.tsx:681-692 | Aynı; gece yarısını aşan saatler sunucuda destekleniyor ama UI'da anlatılmıyor. |
| 26 | Günler alanı (0-6 virgüllü) | BOZUK | page.tsx:693-710 | `Number('')` = 0 → alan boşaltılamaz (Pazar'a döner); virgül yazınca geçici olarak `0` (Pazar) eklenir. |
| 27 | Konum satırı silme | KISMİ | page.tsx:711-723 | Onay/geri al yok, `aria-label` yok. |
| 28 | "Konum Ekle" | ÇALIŞIYOR | page.tsx:726-750 | 0/0 ("Null Island") varsayılanla eklenir ve doğrulamadan geçer. |
| 29 | Konum satırı yerleşimi | BOZUK | page.tsx:579; tailwind.config.ts (gridTemplateColumns uzatması yok) | Tailwind 3.4 varsayılanı 1-12; `md:grid-cols-16` sınıfı üretilmez, `md:col-span-*` örtük kolonlarla düzensiz yerleşim verir. |
| 30 | Önizleme girdileri (enlem, boylam, yarıçap, kategori) | KISMİ | page.tsx:760-775 | Etiket yok; boş enlem 0 sayılır; `max=50` yalnız HTML ipucu; kategori serbest metin, `toLowerCase` Türkçe I'yı bozar ("TATLI" → "tatli"). |
| 31 | "Yakındaki Kartları Test Et" | KISMİ | page.tsx:282-309; customer/discovery/route.ts:99-110 | Kaydedilmiş canlı config'i test eder, taslağı değil; nearby menüsü/modülü müşteriye kapalıysa admin de 403 alır ve admin adına `menu_visibility_blocked` analitik olayı yazılır. |
| 32 | Önizleme sonuç listesi | KISMİ | page.tsx:782-804 | İlk 8 sonuç (API 20 döndürür, toplam belirtilmez); harita yok; aynı yanıttaki `sponsored`, `weeklyBest`, `liveBoosts`, `trendingVenues` gösterilmez. |
| 33 | Açık/Kapalı rozeti | BOZUK | page.tsx:796-798; customer/discovery/route.ts:76-87, 406 | `now.getHours()` sunucu saatini (UTC, bkz. lib/timezone.ts:2) kullanır → Türkiye için 3 saat kayık; config'te olmayan bayiler için 09-23 her gün "açık" varsayılır. |
| 34 | Sponsor — id alanı | BOZUK | page.tsx:815, 817-828 | Satır `key`'i düzenlenen `id`'den türetiliyor → her tuşta satır yeniden mount olur, odak kaybolur. |
| 35 | Sponsor — başlık | ÇALIŞIYOR | page.tsx:829-840 | Uzunluk sınırı yok. |
| 36 | Sponsor — indirim % | KISMİ | page.tsx:841-853 | Aralık (0-100) kontrolü yok; negatif/500 kaydedilebilir ve müşteride "%500 indirim" görünür. |
| 37 | Sponsor — öncelik | ÇALIŞIYOR | page.tsx:854-866; discovery-config.ts (priority clamp) | Negatif değer sunucuda 0'a sessizce çekilir. |
| 38 | Sponsor — dealerId (serbest metin) | SAHTE | page.tsx:867-878; customer-dashboard.tsx:994-1004; trends/page.tsx:489-495 | Müşteri arayüzlerinde hiçbir yerde kullanılmıyor; seçici değil, ham id. |
| 39 | Sponsor — açıklama | ÇALIŞIYOR | page.tsx:893-903; trends/page.tsx:492 | Yalnız trends sayfasında görünür, ana panel kartında yok. |
| 40 | Sponsor — link URL | SAHTE | page.tsx:905-915 | Hiçbir müşteri bileşeni `linkUrl` render etmiyor; ana panel kartı `/customer/nearby?promo=<id>`'e gider ve nearby sayfası `promo` parametresini hiç okumaz (grep: 0 eşleşme). Şema/protokol doğrulaması da yok. |
| 41 | Sponsor — başlangıç/bitiş (ISO metin) | KISMİ | page.tsx:916-937; customer/discovery/route.ts:268-269 | Tarih seçici yok; geçersiz metin `Invalid Date` olur ve karşılaştırmalar false döndüğü için kampanya "her zaman aktif" sayılır; saat dilimi belirsiz. |
| 42 | Sponsor — Aktif anahtarı | ÇALIŞIYOR | page.tsx:939-951 | `Switch` ile "Aktif" metni `id/htmlFor` ile bağlı değil. |
| 43 | Sponsor silme | KISMİ | page.tsx:879-891 | Onay/geri al yok, `aria-label` yok. |
| 44 | "Sponsor Duyurusu Ekle" | ÇALIŞIYOR | page.tsx:954-980 | `sponsored_<timestamp>` id üretir. |
| 45 | Sponsor görseli (`imageUrl`) | EKSİK | discovery-config.ts (`imageUrl` tipi ve normalize); page.tsx:25-36, 106-119 | Sunucu tipi destekliyor, istemci normalize'ı alanı atıyor → admin UI'dan kayıt, içe aktarılan/var olan görseli siler. |
| 46 | Yükleniyor durumu | EKSİK | page.tsx:129, 398-984 | İskelet yok; yükleme sürerken varsayılan form düzenlenebilir görünür, sonra yanıtla üzerine yazılır. |
| 47 | Hata durumu | KISMİ | page.tsx:220-222 | Yalnız toast; sayfa varsayılan (boş) veriyle "normal" görünür. |
| 48 | Boş durumlar (konum / sponsor yok) | EKSİK | page.tsx:578, 814 | Liste boşken yalnız "Ekle" butonu; açıklayıcı boş durum yok. |
| 49 | Yetki (sayfa + API) | ÇALIŞIYOR | proxy.ts:51, 79-84; admin/discovery/route.ts:19, 32 | Proxy ADMIN rolü + gizli kapı cookie; API `requireAuth(['ADMIN'])`. |
| 50 | Denetim kaydı (AuditLog, eski/yeni veri) | ÇALIŞIYOR | admin/discovery/route.ts:47-64 | Sayfada geçmiş/geri alma görünümü yok. |
| 51 | Eşzamanlı düzenleme koruması | EKSİK | discovery-config.ts (`upsert`); schema.prisma:899-907 | Tüm blob last-write-wins; `updatedAt` var ama sürüm kontrolünde kullanılmıyor. |
| 52 | Sunucu tarafı doğrulama | KISMİ | validations-admin.ts:91-93; discovery-config.ts (normalize) | `config: z.unknown()`; normalize tip zorlar ama uzunluk, URL, saat, tarih, indirim aralığı, dealerId varlığı kontrolü yapmaz; boş başlıklı sponsor ve boş dealerId'li konum sessizce düşer. |
| 53 | Kaydedilmemiş değişiklik uyarısı (`beforeunload` / rota değişimi) | EKSİK | page.tsx (yok) | — |
| 54 | Mobil davranış | KISMİ | page.tsx:404, 579, 816 | Başlık aksiyonlarında `flex-wrap` yok (3 buton); satırlar mobilde 9-10 alanlık dikey sütuna dönüşür. |
| 55 | Erişilebilirlik | KISMİ | page.tsx:613-710, 711-723, 760-775, 817-937, 940 | Label'sız girişler, `aria-label`'sız ikon butonlar, bağlı olmayan Switch etiketi, yardım düğmesinde ARIA durumu yok. |

**Sayım:** ÇALIŞIYOR 16 · KISMİ 25 · BOZUK 7 · SAHTE 2 · EKSİK 5 (toplam 55)

---

## Bulgular

### 1. Yükleme hatasında "Kaydet" açılıyor → canlı keşif ayarları boş config ile silinebilir
- **Önem:** kritik · **Kategori:** veri bütünlüğü
- **Kanıt:** page.tsx:132 (`initialSignature` = `''`), 146-147 (`isDirty = signature !== initialSignature`), 216-219 (imza yalnız başarılı yanıtta set ediliyor), 220-224 (hata → yalnız toast, `loading=false`), 418 (`disabled={loading || saving || !isDirty}`), 153-183 (boş config doğrulamadan geçer), admin/discovery/route.ts:47-53 (upsert ile tümüyle üzerine yazar).
- **Sorun:** GET başarısız olursa (geçici Neon/pooler hatası, 500) form `EMPTY_CONFIG` ile kalır; imza `''` olduğu için `isDirty=true` ve Kaydet etkin. Admin "kaydet"e basarsa tüm konumlar ve sponsorlar silinir, varsayılan etiketler yazılır. Audit log eski veriyi tuttuğu için kurtarılabilir ama UI'dan geri alma yok.
- **Profesyonel öneri:** Yükleme durumunu `idle | loading | ready | error` makinesi olarak modelleyin; `error`'da formu hiç render etmeyin, "Tekrar dene" içeren bir hata paneli gösterin. `initialSignature`'ı `null` başlatın ve `isDirty`'yi `initialSignature !== null && ...` yapın. Sunucuda `If-Match`/`expectedUpdatedAt` ile iyimser kilit (Bulgu 9) ekleyerek "boş taslağın dolu kaydı ezmesini" ikinci savunma hattıyla engelleyin.
- **Efor:** S

### 2. Bayi listesi rol filtresini kaybediyor; "Bayilerden doldur" müşteri/admin kayıtlarına ve sahte koordinatlara yol açıyor
- **Önem:** kritik · **Kategori:** hata / veri bütünlüğü
- **Kanıt:** page.tsx:234 (`pageSize=200`), validations-admin.ts:10 (`maxPageSize: 100`), users/route.ts:98-107 (şema başarısızsa `{ page:1, pageSize:20, role: undefined }`), page.tsx:384-393 (ilk 20 kaydı al, koordinatı yoksa `41.0082 + index*0.001`), 394 (mevcut `locations` tamamen değiştirilir), customer/discovery/route.ts:388 (config koordinatı, profil koordinatı olmayan bayilerde kullanılıyor).
- **Sorun:** (a) Bayi seçici ve otomatik doldurma, rolü ne olursa olsun en yeni 20 kullanıcıyı getirir; müşteri ve admin e-postaları "bayi" listesinde görünür. (b) Platformda 20'den fazla bayi varsa geri kalanı hiç seçilemez. (c) Otomatik doldurma, koordinatı olmayan gerçek bayiler için Sultanahmet çevresinde 100 m arayla uydurma koordinatlar üretir; kaydedilirse bu bayiler müşteriye gerçekte olmadıkları yerde "yakınınızda" gösterilir. (d) İşlem, mevcut elle girilmiş tüm satırları onaysız siler.
- **Profesyonel öneri:** Bayi seçimi için `/api/admin/users?role=DEALER&search=` üzerinden sunucu tarafı aramalı bir Combobox (shadcn `Command`) kullanın; sayfalı/ımleçli getirin, `pageSize ≤ 100`. Uç tarafında şema başarısız olursa sessizce varsayılana düşmek yerine 400 döndürün (bu desen başka sayfaları da etkiliyor olabilir — doğrulanmadı). "Bayilerden doldur"u "eksik bayileri ekle (birleştir)" olarak yeniden tanımlayın: yalnız profil koordinatı OLAN ve config'te bulunmayan bayileri ekleyin, koordinatı olmayanları "konum bekleyen" listesine koyun; asla koordinat uydurmayın; işlem öncesi kaç satırın ekleneceğini gösteren onay diyaloğu.
- **Efor:** M

### 3. Admin'in girdiği koordinat/adres, profil verisi olan bayilerde yok sayılıyor; çalışma saati ise bayinin kendi saatini hiç okumuyor
- **Önem:** yüksek · **Kategori:** mimari / doğru veri
- **Kanıt:** customer/discovery/route.ts:388-389 (`dealer.latitude ?? configLocation?.latitude`), 397 (`dealer.address || configLocation?.address`), 406 (`computeIsOpenNow(scheduleByDealerId.get(dealer.id))` — yalnız config), schema.prisma:89 (`User.businessHours` JSON), dealer/settings/page.tsx:174, 200-223 (bayi kendi konumunu ve saatini düzenliyor), users/route.ts:26-27 (admin kullanıcı düzenlemede de lat/lng var).
- **Sorun:** Aynı bilgi üç yerde tutuluyor (bayi ayarları, admin kullanıcı düzenleme, discovery blobu) ve öncelik kuralları birbirine zıt: konumda profil kazanır, saatte config kazanır, bayinin girdiği `businessHours` hiç kullanılmaz. Admin bu sayfada bir bayinin koordinatını düzeltse bile müşteri tarafında hiçbir şey değişmez; UI bunu hiç söylemez.
- **Profesyonel öneri:** Tek doğruluk kaynağı bayi profili olmalı: `User.latitude/longitude/address/businessHours` + yeni `User.discoveryCategories String[]` (veya `DealerProfile` tablosu). Bu sayfadaki "Konumlar" bölümü, düzenleme formu değil bir **kapsama tablosu** olmalı: "Konumu olan / olmayan bayiler, saati tanımlı olan / olmayan, kategorisi olan / olmayan" filtreleri ve satır tıklandığında bayi profil düzenleyicisini açan bir çekmece. Müşteri ucu `businessHours`'ı ayrıştırıp kullanmalı; tanımsızsa `isOpenNow: null` ("saat bilgisi yok") döndürmeli, 09-23 varsaymamalı.
- **Efor:** L

### 4. "Açık/Kapalı" hesabı sunucu saat dilimiyle (UTC) yapılıyor
- **Önem:** yüksek · **Kategori:** hata
- **Kanıt:** customer/discovery/route.ts:79-82 (`now.getDay()`, `now.getHours()`), lib/timezone.ts:2 ("backend UTC" standardı), route.ts:406.
- **Sorun:** Vercel fonksiyonları UTC çalışır; "09:00-23:00" config'i İstanbul saatiyle 12:00-02:00 olarak yorumlanır. Gün sınırı da 3 saat kayar (Pazartesi 00:00-03:00 arası Pazar sayılır). Admin önizlemesi ve müşteri listesi aynı yanlış rozeti gösterir. (Çalışma zamanı TZ'si bu incelemede canlıda ölçülmedi; kod tabanı standardı UTC olduğundan yüksek olasılıklı.)
- **Profesyonel öneri:** Saat hesabını `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour, minute, weekday })` ile yapın; bayi başına `timezone` alanı (varsayılan `Europe/Istanbul`) ekleyin. Fonksiyonu `lib/business-hours.ts` olarak çıkarıp birim testleyin (gece yarısını aşan aralık, gün sınırı).
- **Efor:** S

### 5. Kategori ve gün alanlarına normal yazım yapılamıyor
- **Önem:** yüksek · **Kategori:** hata / UX
- **Kanıt:** page.tsx:654-663 (her `onChange`'de `split(',').map(trim).filter(Boolean)` → `join(',')`), 696-705 (`Number('')` = 0 → filtreyi geçer).
- **Sorun:** Kategori alanında "kahve," yazıldığı anda virgül, "ev " yazıldığı anda boşluk silinir; yalnız yapıştırarak çoklu/çok kelimeli kategori girilebilir. Gün alanı boşaltılınca `[0]` (yalnız Pazar) olur; virgül yazarken geçici olarak Pazar eklenir.
- **Profesyonel öneri:** Serbest metin yerine yapılandırılmış kontroller: kategoriler için önceden tanımlı sözlükten (kahve, tatlı, yemek, ... — müşteri ucundaki `normalizeCategoryLabel` ile aynı kaynak) çoklu seçimli **Tag/Chip input**; günler için 7 adet `ToggleGroup` (Pzt-Paz); saatler için `type="time"` veya bayi profilindeki haftalık saat düzenleyicisinin tekrar kullanımı. Ham metin tutulacaksa, ayrıştırmayı `onBlur`'da yapın ve taslak metni ayrı state'te tutun.
- **Efor:** M

### 6. Sponsor id alanı her tuşta odağı kaybediyor
- **Önem:** yüksek · **Kategori:** hata
- **Kanıt:** page.tsx:815 (`key={`${item.id}-${index}`}`), 817-828 (id düzenleniyor). Benzer şekilde 579 (`key={`${row.dealerId}-${index}`}`).
- **Sorun:** React `key` değiştiği için satırın tüm DOM'u yeniden oluşturulur; id alanına bir karakter yazdıktan sonra imleç düşer. Bayi seçimi değiştiğinde de konum satırı yeniden mount olur.
- **Profesyonel öneri:** Her satıra istemci tarafında değişmeyen bir `uid` (ör. `crypto.randomUUID()`, normalize sırasında atanır, kaydederken atılır) verin ve `key` olarak onu kullanın. Sponsor id'si zaten kullanıcıya gösterilmesi gereken bir alan değil; sunucuda üretilip salt-okunur gösterilmeli.
- **Efor:** S

### 7. Konum satırı grid'i Tailwind'de mevcut değil
- **Önem:** orta · **Kategori:** görsel / bozuk yerleşim
- **Kanıt:** page.tsx:579 (`md:grid-cols-16`), tailwind.config.ts (gridTemplateColumns uzatması yok; Tailwind 3.4 varsayılanı 1-12, `none`, `subgrid`).
- **Sorun:** Sınıf üretilmez; `md:col-span-2/3/1` öğeleri örtük kolonlarla otomatik yerleşir ve masaüstünde düzensiz, hizasız bir satır oluşur. Yazarın amaçladığı tek satırlık tablo görünümü hiç oluşmuyor.
- **Profesyonel öneri:** Bu yoğunlukta veri için yatay form yerine **tablo + düzenleme çekmecesi** kullanın (bkz. yeniden tasarım vizyonu). Kısa vadede `md:grid-cols-12`'ye göre span'ları yeniden dağıtın ya da `grid-cols-[repeat(16,minmax(0,1fr))]` keyfi değerini kullanın.
- **Efor:** S (geçici) / M (tablo)

### 8. Sponsor alanlarının yarısı tüketilmiyor; ana paneldeki kart ölü bir linke gidiyor
- **Önem:** orta · **Kategori:** sahte özellik / ürün tutarlılığı
- **Kanıt:** page.tsx:867-915 (`dealerId`, `linkUrl`); customer-dashboard.tsx:995 (`href=/customer/nearby?promo=${promo.id}`); nearby/page.tsx (`promo` için 0 eşleşme); trends/page.tsx:489-495 (yalnız başlık/açıklama/indirim); discovery-config.ts (`imageUrl` destekleniyor ama UI'da yok, istemci normalize'ı page.tsx:106-119 alanı atıyor).
- **Sorun:** Admin'e "link URL" ve "dealerId" giriliyormuş hissi veriliyor ama hiçbir yüzey bunları kullanmıyor; müşteri karta tıklayınca nearby sayfası parametreyi görmezden geliyor. Gösterim/tıklama ölçümü olmadığından sponsorluk satılamaz/raporlanamaz.
- **Profesyonel öneri:** Sponsorları `SponsoredPlacement` Prisma modeline taşıyın (`id, title, description, imageUrl, dealerId FK, ctaType: DEALER|URL|PROMO, ctaTarget, discountRate 0-100, priority, startsAt/endsAt DateTime, surfaces: TRENDS|DASHBOARD|NEARBY[], audienceSegmentId?, isActive, createdBy`). `nearby` sayfası `?promo=` geldiğinde ilgili bayiyi odaklayıp kampanya rozetini göstermeli. `linkUrl` için yalnız `https:` ve iç rota beyaz listesi (zod `url()` + protokol kontrolü). Gösterim/tıklama olaylarını PostHog'a (zaten projede var) gönderip admin listesinde CTR sütunu gösterin.
- **Efor:** L

### 9. Eşzamanlılık koruması ve sunucu doğrulaması yok
- **Önem:** orta · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:** validations-admin.ts:91-93 (`config: z.unknown()`), discovery-config.ts (`saveDiscoveryConfig` koşulsuz `upsert`), schema.prisma:899-907.
- **Sorun:** İki admin aynı anda düzenlerse sonra kaydeden diğerinin tüm değişikliklerini (bütün blob) siler. Sunucu, saat formatı, indirim aralığı, tarih geçerliliği, URL protokolü, dizi uzunluğu, metin uzunluğu ya da dealerId'nin gerçek bir DEALER olduğu konusunda hiçbir kontrol yapmaz; istemci doğrulaması tek savunma.
- **Profesyonel öneri:** Gerçek bir zod şeması (`discoveryConfigSchema`) yazın ve hem istemci hem sunucuda paylaşın (`react-hook-form` + `zodResolver`). PUT gövdesine `expectedUpdatedAt` ekleyin; `updateMany({ where: { key, updatedAt } })` sonucu 0 ise 409 dönüp "başka biri değiştirdi — farkı gör" diyaloğu gösterin. dealerId'leri tek sorguda `role: 'DEALER'` ile doğrulayın.
- **Efor:** M

### 10. Önizleme, kaydedilmemiş taslağı değil canlı ayarı test ediyor ve müşteri kapılarına takılıyor
- **Önem:** orta · **Kategori:** UX / mimari
- **Kanıt:** page.tsx:297 (`/api/customer/discovery` çağrısı, taslak gönderilmiyor), customer/discovery/route.ts:99-110 (müşteri menü/modül kapıları), module-gate.ts:138-151 (engellenince `analyticsEvent` yazılır).
- **Sorun:** Admin bir satırı düzenleyip "Test et"e bastığında eski (kayıtlı) sonucu görür; arayüz bunu belirtmez. Nearby menüsü veya discovery modülü müşteri rolü için kapatılmışsa önizleme 403 döner ve admin'in kendi kimliğiyle `menu_visibility_blocked` olayı üretilerek analitik kirlenir. Ayrıca her tıklama 25k feedback + 20k review taramasını önbelleksiz tetikler.
- **Profesyonel öneri:** `POST /api/admin/discovery/preview` ucu: gövdede taslak config alır, müşteri hesaplamasını paylaşılan bir `computeDiscovery(config, { lat, lng, radiusKm, category, now })` saf fonksiyonuyla yapar, kapıları atlar (ADMIN). Yanıtı harita üzerinde (müşteri nearby'deki Leaflet bileşeni yeniden kullanılarak) ve sekmeli olarak (Yakındakiler / Sponsorlar / Haftanın Enleri / Canlı Boostlar) gösterin; "Taslak" ve "Canlı" arasında geçiş anahtarı. Trend/hafta hesaplarını Upstash'te kısa TTL ile önbelleğe alın.
- **Efor:** M

### 11. Bilgi mimarisi ve dil tutarsızlığı
- **Önem:** düşük · **Kategori:** UX / içerik
- **Kanıt:** page.tsx:401 ("Discovery Yönetimi"), 274 ("Discovery ayarları"), 446/562 ("Pine Uygula"), 573 ("Dealer kullanıcılarına"), 616/629/641 ("latitude/longitude/address"), 757 ("nearby çıktısını"), 869 ("dealerId"), 906 ("link URL"); lib/admin-toast.ts:17,19 ("Basarili:" — Türkçe karakter yok).
- **Sorun:** Türkçe arayüzde İngilizce teknik terimler ve "Pin'e" yerine "Pine" yazımı; tost önekleri Türkçe karakter içermiyor. Bölüm sırası mantıksız: araçlar kartı (JSON + pin) konumlardan önce, konuma ait pin aracı satırdan ayrı bir kartta.
- **Profesyonel öneri:** Sayfayı "Keşif" olarak adlandırın; terimleri sözlükleştirin (Enlem/Boylam/Adres/İşletme). Pin aracını satır düzenleyicisinin içine taşıyın; JSON içe/dışa aktarmayı başlıktaki "⋯" menüsüne alın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Harita tabanlı konum yönetimi:** Tüm bayileri haritada gösteren, sürüklenebilir pin ve adres otomatik tamamlama (geocoding) içeren düzenleyici; "konumu olmayan bayiler" kapsama göstergesi (Retool harita bileşeni, Stripe Terminal konumları).
2. **Taslak / yayınla akışı ve sürüm geçmişi:** Değişiklikleri taslak olarak tutma, farkı (diff) görme, yayınlama ve önceki sürüme tek tıkla geri dönme — AuditLog verisi zaten var ama UI yok (Stripe "events", Linear geçmişi).
3. **Sponsor kampanya performansı:** Gösterim, tıklama, CTR, bayi başına dönüşüm ve tarih aralığı filtresi; kampanya durum rozetleri (Planlandı / Yayında / Bitti) (PostHog insights).
4. **Hedefleme ve yüzey seçimi:** Kampanyanın hangi yüzeyde (ana panel / trends / nearby), hangi segmentte ve hangi coğrafi yarıçapta görüneceğini seçme; segment altyapısı (`/admin/segments`) zaten mevcut.
5. **Toplu işlemler ve arama:** Konum/sponsor listesinde arama, filtre, sıralama, çoklu seçim ile toplu aktif/pasif, CSV içe/dışa aktarma (doğrulama raporlu).
6. **Eşzamanlı düzenleme farkındalığı:** "Başka bir admin bu sayfayı düzenledi" uyarısı ve iyimser kilit (Linear tarzı çakışma bildirimi).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfaya girdiğinde ilk olarak "keşif sağlığını" görür: kaç bayinin konumu, saati ve kategorisi tam; kaç sponsor yayında; son 7 günde keşif yüzeylerinin gösterim/tıklama özeti. Düzenleme, ham alanlar yerine yapılandırılmış kontrollerle ve canlı taslak önizlemesiyle yapılır; yayınlama bilinçli bir adımdır.

**Yerleşim (sekmeli, `AdminPremiumHero` ile tutarlı):**
1. **Genel bakış:** 4 KPI kartı (konum kapsaması %, saat kapsaması %, aktif sponsor, 7 günlük CTR) + "eksik verisi olan bayiler" listesi (satıra tıklayınca bayi profili çekmecesi).
2. **Konumlar:** Solda sanal kaydırmalı tablo (İşletme, Adres, Kategoriler chip, Saat özeti, Kaynak: profil/admin, Durum), sağda harita (müşteri nearby'deki Leaflet bileşeni yeniden kullanılır). Düzenleme `Sheet` çekmecesinde: adres arama → pin, haftalık saat düzenleyici, kategori chip seçici. Veri **bayi profiline** yazılır (Bulgu 3).
3. **Sponsorlar:** Kart/tablo listesi, durum rozetleri, tarih aralığı seçici, görsel yükleme (R2 altyapısı mevcut), bayi Combobox'u, CTA türü seçici, hedef yüzey seçimi; satırda gösterim/tıklama mini sparkline.
4. **Haftanın Enleri:** Üç etiket + i18n sözlüğüne bağlama + "bu haftanın kazananları" canlı önizlemesi (müşteri ucunun `weeklyBest` çıktısı).
5. **Önizleme:** Konum seç (haritada tıkla) → Taslak/Canlı geçişi → müşterinin göreceği kartların birebir render'ı (müşteri bileşenleri yeniden kullanılarak).

Başlıkta sabit bir "kaydedilmemiş değişiklikler" çubuğu (Kaydet / Vazgeç / Farkı gör), `beforeunload` ve App Router gezinme koruması.

**Motion/3D:** Bu bir operasyon aracı; 3D gereksiz. framer-motion (`m as Motion`) yalnız şu yerlerde, ölçülü: çekmece açılış/kapanışı, kaydedilmemiş değişiklik çubuğunun aşağıdan kayarak girişi, harita pininin seçimde kısa bir "bounce"'u, tablo satırı eklendiğinde/silindiğinde `layout` geçişi. Tümü `useReducedMotion` ile devre dışı kalabilmeli.

**Veri/API değişiklikleri:**
- `User` (veya yeni `DealerProfile`): `discoveryCategories String[]`, `timezone String @default("Europe/Istanbul")`; `businessHours`'ı JSON tipine taşıyıp zod ile doğrulama.
- Yeni `SponsoredPlacement` modeli + `SponsoredEvent` (impression/click, günlük agregasyon).
- `Settings.discovery_config` yalnız `weeklyHighlights` ve global ayarlar için kalır; zod şeması paylaşılır; PUT'ta `expectedUpdatedAt` ile iyimser kilit.
- `GET /api/admin/discovery/coverage` (kapsama metrikleri), `POST /api/admin/discovery/preview` (taslak ile hesap, kapı atlamalı), `GET/POST/PATCH/DELETE /api/admin/discovery/sponsored` (CRUD, sayfalı), `GET /api/admin/discovery/history` (AuditLog tabanlı sürümler + geri al).
- Müşteri ucu hesaplama mantığı `lib/discovery/compute.ts` saf fonksiyonuna çıkarılır (admin önizleme ve müşteri aynı kodu kullanır); `isOpenNow` saat dilimi farkındalıklı ve bilinmiyorsa `null`.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/users` (bayi düzenleme) ve `/dealer/settings`:** Bayi konumu, adresi ve çalışma saatleri zaten bu iki yerde düzenleniyor (users/route.ts:24-27; dealer/settings/page.tsx:174, 200-223, 613). Bu sayfadaki "Yakın Mekan Konumları" bölümü aynı veriyi ayrı bir blobda tekrar tutuyor ve öncelik kuralları çelişiyor. **Öneri:** konum/saat/kategori düzenlemesini bayi profiline birleştirin; bu sayfada yalnız kapsama tablosu + profil çekmecesi kalsın.
- **`/admin/seasonal-campaigns`, `/admin/coupons`, `/admin/partners`:** Sponsor/indirim duyuruları kavramsal olarak kampanya yönetimiyle örtüşüyor (doğrulanmadı: bu sayfaların veri modelleri bu incelemede okunmadı). **Öneri:** `SponsoredPlacement` modeli tasarlanırken sezonsal kampanyalarla ortak bir "kampanya" kavramı altında birleştirilip birleştirilemeyeceği değerlendirilmeli.
- **`/admin/dealers-health`:** "Konumu/saati eksik bayiler" kapsama göstergesi bayi sağlığı sinyallerine de beslenebilir.
- Sayfanın kendisi kaldırılmamalı: "Haftanın Enleri" etiketleri ve keşif önizlemesi için başka bir yer yok; ama kapsamı "keşif yüzeylerinin yönetimi ve ölçümü"ne daraltılmalı.

---

## Doğrulama (şüpheci inceleme)

Üç iddia da çürütülmeye çalışıldı; ilgili istemci, API, doğrulama şeması ve yardımcı kütüphane baştan okundu. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. GET hatasında Kaydet etkinleşiyor ve canlı keşif config'i boş varsayılanla ezilebiliyor — **DOĞRULANDI**

- `app/admin/discovery/page.tsx:131-132`: `config` başlangıcı `EMPTY_CONFIG`, `initialSignature` başlangıcı `''`.
- `page.tsx:146-147`: `isDirty = JSON.stringify(config) !== initialSignature` → `'{"locations":[],...}' !== ''` her zaman `true`.
- `page.tsx:216-224`: `setConfig`/`setInitialSignature` yalnız başarı yolunda; `catch` sadece toast atar, `finally` `loading=false` yapar.
- `page.tsx:418`: `disabled={loading || saving || !isDirty}` → hata sonrasında Kaydet **aktif**.
- `page.tsx:153-183`: boş `locations`/`sponsored` dizileri hiçbir doğrulama kuralına takılmaz.
- `app/api/admin/discovery/route.ts:38-51`: şema `config: z.unknown()` (`lib/validations-admin.ts:91-93`); boş config normalize edilip `saveDiscoveryConfig` ile `upsert`'lenir (`lib/discovery-config.ts:162-175`). "Mevcut veriyi boşla ezme" koruması ya da iyimser kilit (sürüm/`updatedAt` karşılaştırması) yok.
- AuditLog `oldData`'yı saklıyor (`route.ts:53-63`), ancak UI'da geri alma yok. Tek kurtarma yolu, DB'den elle geri yükleme.

**Yeniden üretim:** Neon'da soğuk başlangıç ya da geçici bağlantı hatası yüzünden `GET /api/admin/discovery` 500 döner. Admin "Keşif ayarları alınamadı" uyarısını görür, ancak form varsayılan etiketlerle dolu göründüğü için bunu fark etmez. Örneğin yalnız "Yemek Başlığı"nı değiştirip Kaydet'e basar. PUT başarılı olur ve tüm `locations` ile `sponsored` kayıtları canlıda silinir. Bunun sonucunda müşteri tarafında sponsor kartları ve config'e özgü konumlar kaybolur.
**Sınır:** Hatanın tetiklenmesi için GET hatasından sonra admin'in Kaydet'e basması gerekir. Oturum düşmesi (401) durumunda PUT da reddedildiği için yalnız GET'e özgü geçici hatalar risk oluşturur. Etki gerçek, olasılık orta.

### 2. Bayi listesi pageSize=200 yüzünden rol filtresi olmadan en yeni 20 kullanıcıyı getiriyor; otomatik doldurma sahte koordinat üretiyor — **DOĞRULANDI** (alt iddialardan biri kısmen)

- `page.tsx:234`: istek `role=DEALER&page=1&pageSize=200` ile gidiyor.
- `lib/validations-admin.ts:7-11, 15-21`: `pageSize` en fazla `100` olabiliyor. 200 değeri `safeParse`'ı **bütünüyle** başarısız kılıyor.
- `app/api/admin/users/route.ts:98-107`: başarısızlık durumunda kod `{ page:1, pageSize:20, role: undefined }` değerine düşüyor. `where.role` hiç ayarlanmıyor (`:111-113`), `orderBy: createdAt desc` uygulanıyor (`:168`). Sonuç: herhangi bir roldeki **en yeni 20 kullanıcı**.
- Seçicide müşteri ve admin hesapları da yer alıyor (`page.tsx:237-245, 593-597`; `businessName || name` gösteriliyor, seçili satırın e-postası `:600`'de görünüyor). 20'den eski hiçbir gerçek bayi seçilemiyor. Veritabanında yalnız `role=DEALER` kullanıcılarına bakıldığı varsayılsa da durum değişmiyor, çünkü filtre hiç uygulanmıyor.
- `page.tsx:384-394`: "Bayilerden doldur", bu 20 kullanıcıyı (müşteri ve adminler dahil) satıra dönüştürüyor. Koordinatı olmayanlara `41.0082 + i*0.001 / 28.9784 + i*0.001` (Sultanahmet çevresi) veriliyor. `setConfig` mevcut tüm `locations` kayıtlarını **onay istemeden** değiştiriyor (`:394`).
- Müşteri tarafındaki etki (`app/api/customer/discovery/route.ts:330-343, 385-387`): config'teki ID'ler sorguya `role: 'DEALER'` filtresiyle giriyor. Bu yüzden **müşteri/admin satırları müşteriye görünmüyor**; "müşteri/adminler eklenir" iddiası yalnız config kirliliği olarak geçerli. Koordinatı olmayan **gerçek bayiler** ise `dealer.latitude ?? configLocation.latitude` ile uydurma koordinatı alıyor. Sultanahmet çevresindeki 5 km içindeki müşterilere bu bayiler "yakında" ve uydurma mesafeyle gösteriliyor.

**Yeniden üretim:** Son kayıt olanlar arasında 15 müşteri ve 5 bayi bulunsun; bu 5 bayiden 3'ünün `latitude` değeri null olsun. Admin "Bayilerden doldur"a basıp Kaydet'e tıklar. Önceki 30 doğru konum satırı silinir. Config'e 15 müşteri ID'si girer (müşteriye görünmez). 3 bayi Sultanahmet'te sahte noktalara yerleşir ve 41.0082,28.9784 yakınındaki müşterilerin "Yakınımdakiler" listesine yanlış mesafeyle girer.

### 3. isOpenNow sunucu UTC saatine göre hesaplanıyor — **DOĞRULANDI**

- `app/api/customer/discovery/route.ts:76-88`: `computeIsOpenNow` fonksiyonu `now.getDay()` ve `now.getHours()/getMinutes()` kullanıyor. Bunlar süreç saat dilimine bağlı değerler. Vercel fonksiyonları UTC'de çalışır (`TZ` platformda ayrılmış bir değişkendir). Repoda `TZ` ya da `Europe/Istanbul` ayarı yok (vercel.json, next.config, `.env.example` tarandı; `lib/timezone.ts:1-3` "backend UTC" diyor).
- `route.ts:301, 406`: `nowTime = new Date()` doğrudan bu fonksiyona veriliyor.
- Admin `09:00-23:00` değerini İstanbul saati olarak giriyor (UI'da saat dilimi notu yok, `page.tsx:669-692`). Sistem bunu fiilen 12:00-02:00 TSİ olarak yorumluyor. 09:00-12:00 TSİ arası "Kapalı", 23:00-02:00 TSİ arası "Açık" gösteriliyor. Gün sınırı 03:00 TSİ'ye kaydığı için `daysOfWeek` kontrolü de 00:00-03:00 TSİ arasında bir önceki güne göre yapılıyor. Kıyas için `lib/happy-hour-live.ts:22-34` UTC'yi bilinçli kullanıyor; ancak orada saatler UTC olarak saklanıyor, burada ise yerel saat giriliyor.
- `scheduleByDealerId` içinde kaydı olmayan bayiler için `parseTimeValue` 09:00/23:00 değerine ve tüm günlere düşüyor (`route.ts:77-80`). Böylece saat bilgisi olmayan bayiler de (yine UTC kaymasıyla) "Açık" görünüyor. Bu, bilinmeyen durumu "açık" olarak göstermek demek.
- Admin önizlemesi aynı uca istek atıyor (`page.tsx:297`), dolayısıyla aynı hatalı rozeti gösteriyor.

**Yeniden üretim:** Saat 10:30 TSİ (07:30 UTC). Bayinin config'inde 09:00-23:00 tanımlı. `currentMinutes = 450 < 540` olduğu için müşteri ve admin önizlemesi "Kapalı" gösteriyor. Saat 00:30 TSİ'de (21:30 UTC) ise aynı bayi "Açık" görünüyor.
**Önerilen düzeltme yaklaşımı:** `Intl.DateTimeFormat('en-GB', { timeZone: dealer.timezone ?? 'Europe/Istanbul', weekday, hour, minute })` ile bayinin yerel saatinden gün ve dakikayı türetin. Saat bilgisi yoksa `isOpenNow: null` döndürün ve UI'da "saat bilgisi yok" gösterin. Hesaplama `lib/discovery/compute.ts` gibi saf bir fonksiyona taşınıp saat dilimi sınır testleriyle (00:00-03:00 TSİ, gece yarısını aşan vardiya) kapsanmalı.
