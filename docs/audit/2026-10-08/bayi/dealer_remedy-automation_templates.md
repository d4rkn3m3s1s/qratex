# /dealer/remedy-automation/templates

**Amaç:** Bayinin telafi tekliflerinde müşteriye sunulacak seçenekleri (indirim %, puan, ücretsiz ürün) "işletme geneli" ya da "mekana (şubeye) özel" şablonlar olarak tanımlaması; aynı sayfada şube (DealerLocation) kayıtlarının oluşturulması/silinmesi.

**Genel puan: 4/10** · **Karar: yeniden tasarla** (Mekanlar bölümü buradan çıkarılıp işletme ayarları / QR yönetimine taşınmalı; şablon kısmı tam bir "teklif kataloğu" editörüne dönüşmeli)

Dosyalar: `app/dealer/remedy-automation/templates/page.tsx` (344 satır, tamamı `'use client'`), `app/dealer/remedy-automation/layout.tsx`, `app/api/dealer/locations/route.ts`, `app/api/dealer/locations/[id]/route.ts`, `app/api/dealer/remedy-templates/route.ts`, `app/api/dealer/remedy-templates/[id]/route.ts`, tüketici: `lib/remedy-options.ts`, `app/customer/remedy/[offerId]/page.tsx`, `app/api/customer/remedy/[offerId]/route.ts`. Modeller: `RemedyTemplate` (`prisma/schema.prisma:1360`), `DealerLocation` (`prisma/schema.prisma:747`), `QRCode.locationId` (`prisma/schema.prisma:729`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Ekle/listele/sil çalışıyor; ama sayfanın ana vaadi olan "mekana özel şablon" hiçbir QR'a mekan atanamadığı için hiç devreye girmiyor, düzenleme/aktiflik/sıralama yok. |
| UX | 4/10 | Yıkıcı silmeler onaysız, öncelik kuralı (mekan şablonu geneli tamamen ezer) anlatılmıyor, müşterinin ne göreceğinin önizlemesi yok. |
| Görsel | 4/10 | Üç düz shadcn kartı; üst sayfadaki (`app/dealer/remedy-automation/page.tsx:97`) başlık kartı diliyle tutarsız, hiyerarşi ve tür ikonografisi yok. |
| Mimari | 4/10 | API'ler sahiplik kontrolüyle temiz; fakat PATCH uçları kullanılmıyor, i18n yok, mekan kavramı yanlış sayfada ve sistemde ikinci bir "lokasyon" kavramı (`lib/discovery-config.ts:7`) ile paralel. |
| Performans | 7/10 | İki küçük paralel fetch, ağır bağımlılık yok; her mutasyonda iki listenin tamamı yeniden çekiliyor (küçük veri için kabul edilebilir). |
| Erişilebilirlik + Mobil | 4/10 | İkon butonlarında `aria-label` yok, `Label`'lar alanlara bağlı değil, `<a>` içinde `<button>`, 32px dokunma hedefleri; yerleşim mobilde düzgün istifleniyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Geri butonu (otomasyon sayfasına) | ÇALIŞIYOR | `page.tsx:174-178` | `Link` içinde `Button` → `<a><button>` iç içe etkileşimli öğe; `aria-label` yok. |
| 2 | Sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:180-184` | Sabit Türkçe; üst sayfa `t()` kullanıyor. |
| 3 | İlk veri yükleme (mekanlar + şablonlar, paralel) | KISMİ | `page.tsx:57-73` | `success:false` / 401 / 403 / 500 yanıtında sessizce boş liste kalır, toast yalnızca ağ/JSON hatasında. |
| 4 | Mekan adı girişi | ÇALIŞIYOR | `page.tsx:200-207` | `maxLength` istemcide yok (sunucu 80, `locations/route.ts:10`). |
| 5 | Mekan ekle butonu | ÇALIŞIYOR | `page.tsx:79-101`, `208-210` | `<form>` yok → Enter ile gönderilemez. |
| 6 | Boş mekan adı doğrulaması | ÇALIŞIYOR | `page.tsx:80-83` | |
| 7 | Aynı isimli mekan engeli (409) | ÇALIŞIYOR | `locations/route.ts:65-71`, şema `@@unique([dealerId, name])` `schema.prisma:762` | |
| 8 | Mekan listesi | ÇALIŞIYOR | `page.tsx:220-240`, `locations/route.ts:21-25` | |
| 9 | Mekan başına "X QR · Y şablon" sayacı | KISMİ | `page.tsx:226`, `locations/route.ts:24` | QR sayısı her zaman 0: `QRCode.locationId`'yi yazan hiçbir kod yok (bkz. Bulgu 1). |
| 10 | Mekan silme | KISMİ | `page.tsx:103-116`, `233` | Onay yok; mekana özel şablonlar Cascade ile sessizce silinir (`locations/[id]/route.ts:85-88`, `schema.prisma:1374`). |
| 11 | Yükleniyor / boş durumları | KISMİ | `page.tsx:213-218`, `307-313` | Düz metin, iskelet yok; API hatasında yanıltıcı "Henüz mekan yok" gösterilir. |
| 12 | Mekan yeniden adlandırma | EKSİK | API var: `locations/[id]/route.ts:41-83` | UI'da PATCH çağrısı yok. |
| 13 | Mekan adres / koordinat | EKSİK | Şema `schema.prisma:751-753`, API `locations/route.ts:11-13` | UI hiç alan sunmuyor. |
| 14 | Mekan aktif/pasif | EKSİK | `schema.prisma:754` | UI yok; `getRemedyOptions` da mekanın `isActive`'ine bakmıyor (`lib/remedy-options.ts:49-52`). |
| 15 | QR kodunu mekana bağlama | EKSİK | `app/api/qr-codes/route.ts:122-128` (create'te `locationId` yok), `app/api/qr-codes/[id]/route.ts:63-73` (update'te yok) | Projede `locationId` yazan tek yer şablon API'si; mekan-QR bağı kurulamıyor. |
| 16 | Kapsam seçimi (İşletme geneli / mekan) | KISMİ | `page.tsx:258-271` | Kayıt oluşur ama mekan kapsamlı şablon pratikte hiç çözülmez (Bulgu 1). |
| 17 | Tür seçimi (İndirim/Puan/Ücretsiz ürün) | ÇALIŞIYOR | `page.tsx:274-284`, `37-41` | |
| 18 | Değerler (virgülle) girişi | KISMİ | `page.tsx:119-122`, `288-292` | Geçersiz parçalar sessizce atılır; tekrar eden değerler, %100 üstü indirim, 0 / 1,5 adet ürün, sınırsız puan kabul edilir; sıralanmaz. |
| 19 | Şablon ekle butonu | ÇALIŞIYOR | `page.tsx:118-151`, `295-297` | Spinner global `busy`'ye bağlı; mekan silinirken bu butonda spinner döner. |
| 20 | 9+ değer hata mesajı | KISMİ | `remedy-templates/route.ts:16` (`.max(8)` özel mesajsız) | zod 3 varsayılanı İngilizce "Array must contain at most 8 element(s)" toast'a düşer (dil karışıklığı). |
| 21 | Etiket / birim özelleştirme | EKSİK | `page.tsx:127`, `136-137` | Etiket ve birim preset'ten sabit; "Ücretsiz kahve" gibi tanım yapılamaz, ürün kataloğuna (`app/api/dealer/products`) bağ yok. |
| 22 | Mevcut şablonlar listesi | ÇALIŞIYOR | `page.tsx:315-337`, `remedy-templates/route.ts:36-39` | |
| 23 | Şablonun kapsam etiketi | ÇALIŞIYOR | `page.tsx:168-169`, `325` | |
| 24 | Şablon aktiflik göstergesi | EKSİK | `TemplateRow.isActive` tipte var (`page.tsx:33`) ama render edilmiyor | |
| 25 | Şablon düzenleme | EKSİK | API var: `remedy-templates/[id]/route.ts:41-76` | UI'da hiç kullanılmıyor; değişiklik için sil + yeniden oluştur gerekiyor. |
| 26 | Şablon aktif/pasif anahtarı | EKSİK | API destekliyor (`remedy-templates/[id]/route.ts:14`) | |
| 27 | Şablon sıralama | EKSİK | `order` hep 0 gönderiliyor (`remedy-templates/route.ts:90`) | Müşteri ekranındaki sıra = oluşturma sırası. |
| 28 | Şablon silme | KISMİ | `page.tsx:153-166`, `331` | Onay / geri al yok. |
| 29 | Aynı kapsamda aynı türün tekrar engeli | BOZUK | Sunucuda kontrol yok (`remedy-templates/route.ts:82-93`); müşteri tarafı `options.find(o => o.type === …)` + `key={opt.type}` (`app/customer/remedy/[offerId]/page.tsx:95`, `216`) | İki "İndirim" şablonu → müşteri ikinciyi seçemez, React yinelenen key uyarısı. |
| 30 | Öncelik kuralının açıklanması | KISMİ | `page.tsx:181-184` vs `lib/remedy-options.ts:47-61` | Mekan şablonu varsa genel şablonlar BİRLEŞMEZ, tamamen yok sayılır; sayfa bunu söylemiyor. |
| 31 | Müşteri görünümü önizlemesi | EKSİK | — | Bayinin teklifin müşteride nasıl görüneceğini görme imkânı yok. |
| 32 | Toast bildirimleri | KISMİ | `page.tsx:17`, `lib/admin-toast.ts:17-20` | "Basarili: " / "Dikkat: " ASCII ön ekleri (ş, ı eksik); bayi sayfasında "admin" toast'u. |
| 33 | Çok dillilik (i18n) | EKSİK | Tüm metinler sabit (`page.tsx:38-40`, `180-184`, `192-217`, `249-313`); üst sayfa `t('dealerRemedyAutomation.*')` | Üst sayfadaki "Şablonlar & Mekanlar" bağlantısı da sabit (`app/dealer/remedy-automation/page.tsx:106`). |
| 34 | Yetki + sahiplik kontrolü | ÇALIŞIYOR | `requireAuth(['DEALER'])` her uçta; `assertOwned` (`locations/[id]/route.ts:17-38`, `remedy-templates/[id]/route.ts:17-38`); POST'ta mekan sahipliği (`remedy-templates/route.ts:68-79`) | IDOR bulunmadı. |
| 35 | Modül kapısı (`remedy_offers`) | EKSİK | Sidebar `moduleKey: 'remedy_offers'` (`components/dashboard/sidebar.tsx:257`); şablon/mekan uçlarında `assertModuleEnabled` yok | Modül kapalıyken de doğrudan URL/API ile yönetilebilir. |
| 36 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:199-200`, `256` (`flex-wrap`, `sm:grid-cols-3`) | Silme hedefleri 32px (`h-8 w-8`), önerilen 44px altında. |
| 37 | Erişilebilirlik etiketleri | EKSİK | `Label`'larda `htmlFor` yok (`page.tsx:201`, `258`, `274`, `287`); ikon butonlarında `aria-label` yok (`175`, `229-237`, `327-335`) | Ekran okuyucu "düğme" der, hangi mekanın silineceğini söylemez. |
| 38 | Kabulde seçimin şablona karşı sunucu doğrulaması | BOZUK | `app/api/customer/remedy/[offerId]/route.ts:15-18`, `160-168` | Müşteri `selectedType/selectedValue`'yu serbest metin olarak gönderir, `offer.options` ile karşılaştırılmaz; şablon "izin verilen değerler" (`schema.prisma:1367`) fiilen zorlanmaz. |
| 39 | "Puan" türü telafinin gerçekten yüklenmesi | SAHTE | `selectedType` kullanan tek yerler müşteri GET/PATCH ve listeleme (`app/api/customer/remedy/route.ts:57`); puan defterine yazan kod bulunamadı (`grep selectedType lib app/api`) | Şablonda tanımlanan puan, kabulden sonra hiçbir yerde kullanıcıya kredilenmiyor; yalnızca kayıt olarak kalıyor. |

**Durum özeti:** ÇALIŞIYOR 13 · KISMİ 10 · BOZUK 2 · SAHTE 1 · EKSİK 13 (toplam 39)

---

## Bulgular

### 1. Mekana özel şablonlar fiilen hiç devreye girmiyor
- **Önem:** kritik · **Kategori:** işlevsellik / veri bütünlüğü · **Efor:** M
- **Kanıt:** `QRCode.locationId` alanı var (`prisma/schema.prisma:729`) ama QR oluşturma `data: { code, name, description, dealerId }` (`app/api/qr-codes/route.ts:122-128`), güncelleme yalnız `name/description/isActive/expiresAt/revoke/segmentConfig` (`app/api/qr-codes/[id]/route.ts:63-73`). Projede `locationId` yazan başka kod yok (grep: yalnız şablon/mekan API'leri ve `lib/remedy-options.ts`). Çözücü mekan şablonunu yalnız `qr.locationId` doluysa kullanır (`lib/remedy-options.ts:48-54`, `80-84`). Tüketim yorumları zaten `null` ile çağırıyor (`app/api/dealer/consumption-reviews/[id]/remedy/route.ts:79-82`).
- **Sorun:** Sayfanın başlığındaki ve kartındaki ana vaat ("teklifleri mekana özel yapabilirsiniz", `page.tsx:195`) gerçekleşemez. Bayi Kadıköy şubesine özel şablon tanımlar, hiçbir teklifte görünmez; mekan listesindeki "0 QR" sayacı da hiç değişmez. Kullanıcı bunu fark edemez çünkü hata yok, sadece etki yok.
- **Öneri:** Mekan-QR ilişkisini birinci sınıf hale getirin: (a) `app/api/qr-codes` create/update şemalarına `locationId` ekleyip sahiplik kontrolü (mekanın `dealerId === session.user.id`) yapın; (b) QR kodları sayfasında QR kartına "Şube" seçicisi ve toplu atama (`app/api/qr-codes/bulk`) ekleyin; (c) bu sayfada her mekan satırında "QR ata" kısa yolu ve "Bu mekana bağlı QR yok — şablonlar etkisiz" uyarı rozeti gösterin. Bağ kurulana kadar mekan kapsamı seçeneğini devre dışı bırakıp nedenini yazın.

### 2. Müşteri kabulü şablon değerlerine karşı doğrulanmıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** S
- **Kanıt:** `patchSchema = { selectedType: z.string().min(1), selectedValue: z.string().min(1) }` (`app/api/customer/remedy/[offerId]/route.ts:15-18`); `updateMany` doğrudan bu değerleri yazar (`160-168`); `offer.options` sorgulanmaz bile (`126-129` yalnız `id/userId/status` seçiyor). Değer kısıtı yalnız istemcide (`app/customer/remedy/[offerId]/page.tsx:99-102`).
- **Sorun:** Bu sayfada tanımlanan "izin verilen değerler" (`schema.prisma:1367` yorum) bir tavsiyeden ibaret. Müşteri devtools ile `{"selectedType":"discount","selectedValue":"100"}` gönderip %100 indirim kabul edilmiş teklif üretebilir; personel kabul edilen teklifi uygularken bunu görür.
- **Öneri:** PATCH'te `options`'u çekip `options.some(o => o.type === selectedType && o.values.map(String).includes(selectedValue))` kontrolü yapın, eşleşmezse 400. Ayrıca `selectedValue`'yu sayı olarak saklayın. Şablon → teklif anlık görüntüsü zaten `options` JSON'unda olduğu için (`app/api/dealer/feedbacks/[id]/remedy/route.ts:87`) doğrulama kaynağı hazır.

### 3. "Puan" türü telafi hiçbir zaman kredilenmiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / güven · **Efor:** M
- **Kanıt:** `selectedType`/`selectedValue` yalnız müşteri GET/PATCH/listesinde okunuyor (`app/api/customer/remedy/route.ts:57`, `app/customer/remedy/page.tsx:221`); `lib/` altında remedy + puan defteri ilişkisi bulunamadı. Teklif durum makinesi `awaiting_dealer_approval → pending → accepted` ile bitiyor (`app/api/dealer/remedy-offers/[id]/route.ts:15-18`); "kullanıldı/kredilendi" durumu yok.
- **Sorun:** Bayi bu sayfada "100, 150 puan" tanımlıyor, müşteri seçiyor, sonra hiçbir şey olmuyor. İndirim/ücretsiz ürün de bir kupon kodu veya kullanım kaydı üretmiyor. Telafi yaşam döngüsü yarım.
- **Öneri:** Kabulde türe göre yerine getirme (fulfilment) adımı: `points` için puan ekonomisi kurallarına uygun (escrow/net-sıfır, tek seferlik atomik kredi, `points_credited` görünürlüğü) bir ledger hareketi; `discount`/`free_item` için tek kullanımlık kupon kodu + QR ve `redeemedAt`. Bu sayfada her türün yanında "nasıl yerine getirilir" açıklaması ve puan için bayi bakiyesinden düşüleceği bilgisi gösterilmeli. Bu değişiklik puan basan bir yol olduğu için ekonomi değişmezleri denetiminden geçmeli.

### 4. Aynı kapsamda aynı tür birden fazla kez eklenebiliyor, müşteri ekranı bozuluyor
- **Önem:** yüksek · **Kategori:** hata · **Efor:** S
- **Kanıt:** Sunucuda tekillik kontrolü yok (`app/api/dealer/remedy-templates/route.ts:82-93`, şemada `@@unique` yok `schema.prisma:1376-1378`); müşteri ekranı `options.find((o) => o.type === selectedType)` (`app/customer/remedy/[offerId]/page.tsx:95`) ve `<SelectItem key={opt.type}>` (`216`).
- **Sorun:** "İndirim 10,15" ve "İndirim 25,30" iki ayrı satır olarak kaydedilir; müşteri iki "İndirim" görür, hangisini seçerse seçsin ilkinin değerleri gelir, React yinelenen key uyarısı verir. Değerler de tekilleştirilmiyor (`page.tsx:119-122`), "10, 10" iki aynı seçenek üretir.
- **Öneri:** Model düzeyinde (dealerId, locationId, type) başına tek şablon kuralı: POST'ta mevcutsa 409 + UI'da "zaten var, düzenle" yönlendirmesi; kısmi unique index (NULL locationId için ayrı) eklenmeli. İstemci ve sunucuda değerleri `Array.from(new Set(values)).sort((a,b)=>a-b)` ile normalize edin.

### 5. Değer doğrulaması türe duyarsız ve sessiz
- **Önem:** orta · **Kategori:** veri kalitesi / UX · **Efor:** S
- **Kanıt:** İstemci yalnız `Number.isFinite(n) && n >= 0` (`page.tsx:122`), sunucu yalnız `nonnegative()` (`remedy-templates/route.ts:16`).
- **Sorun:** %150 indirim, 0 adet ürün, 2,5 adet ürün, 1.000.000 puan kabul ediliyor; "10, abc, 20" girildiğinde "abc" uyarısız atılıyor. 9 değer girildiğinde İngilizce zod mesajı toast'a düşüyor.
- **Öneri:** Türe göre şema: `discount` 1–100 tamsayı, `free_item` 1–10 tamsayı, `points` 1–(platform politikası üst sınırı) tamsayı. Serbest metin yerine "chip" girişi (Enter ile değer ekle, her chip tek tek doğrulanır, max 8 göstergesi). Tüm zod mesajlarını Türkçe/i18n anahtarı olarak özelleştirin.

### 6. Yıkıcı işlemler onaysız; mekan silme şablonları sessizce siliyor
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `onClick={() => deleteLocation(loc.id)}` (`page.tsx:233`), `onClick={() => deleteTemplate(tpl.id)}` (`331`); Cascade notu `locations/[id]/route.ts:85-88`. Projede `components/ui/alert-dialog.tsx` mevcut ve `app/dealer/qr-codes/page.tsx` kullanıyor.
- **Sorun:** Tek yanlış dokunuş bir şubenin tüm şablonlarını kalıcı siler; geri alma yok.
- **Öneri:** `AlertDialog` ile "Kadıköy Şubesi ve ona bağlı 3 şablon silinecek; 5 QR kodu işletme geneline düşecek" gibi etkisini sayılarla anlatan onay. Şablon için toast içinde "Geri al" (soft-delete: önce `isActive=false`, 10 sn sonra kalıcı sil) ya da doğrudan pasifleştirmeyi varsayılan yapın.

### 7. Düzenleme, aktif/pasif ve sıralama UI'ı yok; mevcut PATCH uçları ölü
- **Önem:** orta · **Kategori:** işlevsellik / mimari · **Efor:** M
- **Kanıt:** `PATCH /api/dealer/remedy-templates/[id]` (`route.ts:41-76`) ve `PATCH /api/dealer/locations/[id]` (`route.ts:41-83`) hiçbir istemci tarafından çağrılmıyor; `isActive` tipte var ama render edilmiyor (`page.tsx:33`, `316-336`); `order` hiç gönderilmiyor (`page.tsx:133-139`).
- **Sorun:** Bayinin bir şablonu geçici kapatması (ör. kampanya dönemi) ya da değer eklemesi için sil-yeniden oluştur yapması gerekiyor; müşteri ekranındaki seçenek sırası kontrol edilemiyor.
- **Öneri:** Her şablon satırını satır içi düzenlenebilir kart yapın (değer chip'leri, `Switch` ile aktiflik, sürükle-bırak sıralama → toplu `order` PATCH). Mekan satırına yeniden adlandırma + adres.

### 8. Bilgi mimarisi: mekan (şube) yönetimi yanlış yerde, ikinci bir lokasyon kavramı paralel
- **Önem:** orta · **Kategori:** mimari / IA · **Efor:** M
- **Kanıt:** Mekan oluşturma/silme yalnız bu sayfada (`grep /api/dealer/locations` → yalnız `templates/page.tsx`); sidebar'da bu sayfanın kendi girdisi yok, yalnız üst sayfadaki küçük buton (`app/dealer/remedy-automation/page.tsx:103-108`). Ayrıca admin keşif yapılandırmasında ayrı `DealerLocationConfig` (lat/lng/adres/saat) JSON'u (`lib/discovery-config.ts:7-16`).
- **Sorun:** Çok şubeli bir işletme şubelerini "Telafi Otomasyonu → Şablonlar" altında aramaz. Şube; QR, analitik, ekip, keşif gibi birçok modülün ortak boyutu olmalı, ama şu an iki ayrı ve birbirinden habersiz kayıtta tutuluyor.
- **Öneri:** `DealerLocation`'ı tek kaynak yapın: "İşletme Ayarları → Şubeler" sayfası (ad, adres, harita konumu, çalışma saatleri, aktiflik, bağlı QR sayısı). Keşif yapılandırmasını bu modelden okuyun. Bu sayfada yalnız şube filtresi/kapsam seçici kalsın.

### 9. Öncelik kuralı ve anlık görüntü davranışı anlatılmıyor
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** Çözücü: mekan şablonu varsa yalnız onlar, yoksa genel, yoksa sistem varsayılanı (`lib/remedy-options.ts:6`, `47-61`); teklif oluşturulurken seçenekler `options` JSON'una kopyalanır (`app/api/dealer/feedbacks/[id]/remedy/route.ts:87`, `lib/remedy-automation-core.ts:95-104`). Sayfa yalnız "Şablon yoksa varsayılan teklifler kullanılır" diyor (`page.tsx:182-183`).
- **Sorun:** Bayi Kadıköy için yalnız "Puan" şablonu eklerse, o şubede genel "İndirim" seçeneği de kaybolur; bekleyen tekliflerin eski seçeneklerle kalacağı da bilinmiyor. Sistem varsayılanının ne olduğu (ör. %10–30) gösterilmiyor.
- **Öneri:** Kapsam başına "Etkin teklif seti" özet kartı: "Kadıköy'de müşteri şunları görecek: …(kaynak: mekan şablonu)". Varsayılanlar okunur kartta gösterilsin, "Varsayılanı özelleştir" ile tek tıkta şablona dönüştürülsün. "Değişiklikler yeni tekliflere uygulanır" notu.

### 10. Erişilebilirlik ve i18n eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / tutarlılık · **Efor:** S
- **Kanıt:** `Label`'larda `htmlFor`/`id` yok (`page.tsx:201`, `258`, `274`, `287`); ikon butonları etiketsiz (`175`, `229-237`, `327-335`); `<Link><Button>` iç içe (`174-178`) — üst sayfa doğru deseni (`Button asChild`) kullanıyor (`app/dealer/remedy-automation/page.tsx:103-104`); tüm metin sabit Türkçe; toast ön ekleri `Basarili:` (`lib/admin-toast.ts:17`).
- **Öneri:** `useId` ile etiket bağlama, `aria-label={\`${loc.name} mekanını sil\`}`, `Button asChild` deseni, 44px dokunma hedefi, `<form onSubmit>` ile Enter desteği, tüm metinleri `dealerRemedyTemplates.*` anahtarlarına taşıma. Toast ön ekini `lib/admin-toast.ts`'te düzgün Türkçe yapın (ayrı iş, tüm panelleri etkiler).

### 11. Modül kapısı ve hata durumu
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** Sidebar `moduleKey: 'remedy_offers'` (`components/dashboard/sidebar.tsx:257`) ama şablon/mekan uçlarında `assertModuleEnabled('remedy_offers')` yok (feedback telafi ucunda var: `app/api/dealer/feedbacks/[id]/remedy/route.ts:36`). `load()` `success:false` durumunu sessiz geçer (`page.tsx:66-67`).
- **Öneri:** Şablon uçlarına modül kapısı (mekan uçları şubeler sayfasına taşınınca kapı dışında kalmalı). İstemcide yükleme hatasını ayrı "Yeniden dene" durumuyla göster; `r.ok` kontrolü ekle.

---

## Eksik özellikler (kıyas ürünlerle)

- **Teklif kataloğu ve yerine getirme:** Toast / Square Loyalty / Yelp for Business'ta telafi bir kupon ya da puan hareketi olarak gerçekten oluşur ve kullanım takibi yapılır (kod, son kullanma, kullanıldı). Burada şablon yalnız bir seçenek listesi, kupon kodu, son kullanma tarihi, kullanım limiti yok.
- **Kural tabanlı uygunluk:** Medallia / Qualtrics "close-the-loop" akışlarında telafi değeri skor, müşteri değeri (LTV), tekrar şikâyet ve maliyet tavanına göre otomatik seçilir. Şablona "1 yıldız + ilk ziyaret → %10; sadık müşteri → ücretsiz ürün" gibi koşul eklenemiyor; aylık bütçe/maliyet tavanı tanımlanamıyor.
- **Ürün kataloğuna bağlı ücretsiz ürün:** Toast/Square'de "ücretsiz ürün" belirli bir menü kalemi (ve maliyeti) olarak seçilir; burada "1 adet" genel ifadesi var, `products` API'sine bağ yok.
- **Önizleme ve test:** Müşterinin telefonda göreceği teklif ekranının canlı önizlemesi ve "kendime test teklifi gönder" yok.
- **Performans ölçümü:** Şablon başına kabul oranı, seçilen değer dağılımı, telafi sonrası geri dönüş (7 gün tekrar ziyaret) ve maliyet; Medallia/Qualtrics bunu kapanış döngüsü raporu olarak sunar.
- **Çok şubeli yönetim:** Google Business Profile tarzı şube listesi (adres, harita, saatler, toplu düzenleme, şubeye QR atama); burada yalnız isim.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi, "müşteri şikâyet ettiğinde ona ne teklif edebilirim?" sorusunu tek ekranda, şube bazında, maliyetini ve etkisini görerek yanıtlar. Sayfa adı "Telafi Kataloğu" olur; şube yönetimi buradan çıkar.

**Yerleşim:**
1. **Üst şerit:** Kapsam seçici (segment kontrol: "İşletme geneli" + şubeler; bağlı QR'ı olmayan şubede uyarı rozeti) ve "Etkin teklif seti" özeti (kaynak etiketiyle: Sistem varsayılanı / İşletme / Şube).
2. **Sol sütun (ana):** Tür başına bir kart (İndirim, Puan, Ücretsiz ürün; tür başına tek şablon). Kart içinde değer chip'leri (ekle/sil, türe göre sınırlı), aktiflik `Switch`'i, sürükle-bırak sıra tutamağı, ücretsiz üründe ürün seçici, opsiyonel son kullanma süresi ve aylık bütçe/kota. Değişiklikler kart başına "Kaydet" ile `PATCH`.
3. **Sağ sütun (yapışkan):** Müşteri telefon önizlemesi; seçilen kapsamda müşterinin göreceği türler ve değerler, gerçek bileşenle (`app/customer/remedy/[offerId]/page.tsx`'teki seçicinin paylaşılan sürümü) render edilir. Altında şablon performansı mini istatistikleri (kabul oranı, en çok seçilen değer).
4. **Mobil:** Önizleme bir alt sayfa (sheet) olarak açılır, kartlar tek sütun, 44px hedefler.

**Motion / 3D:** 3D gerekmez; bu bir yapılandırma ekranı. Ölçülü framer-motion (`m as Motion`): chip ekleme/silmede `layout` animasyonu, kapsam değişince önizlemenin kısa çapraz geçişi (150–200 ms), sürükle-bırak sıralamada `Reorder`. `useReducedMotion` ile hepsi anında geçişe düşmeli.

**Veri / API değişiklikleri:**
- `RemedyTemplate`: (dealerId, locationId, type) tekilliği (NULL için kısmi index), `values` → `Int[]` ya da doğrulanmış JSON, opsiyonel `productId`, `expiresInDays`, `monthlyBudget`.
- `GET /api/dealer/remedy-templates/effective?locationId=` → `getRemedyOptions` sonucunu ve kaynağını döndüren uç (önizleme ve özet için tek doğru kaynak).
- `PATCH /api/dealer/remedy-templates/reorder` (toplu `order`).
- QR create/update/bulk uçlarına `locationId` + sahiplik kontrolü (Bulgu 1).
- Müşteri kabul ucunda `options`'a karşı doğrulama (Bulgu 2) ve tür bazlı fulfilment (Bulgu 3).
- Tüm zod mesajları Türkçe/i18n; şablon uçlarında `assertModuleEnabled('remedy_offers')`.
- İstemci: SWR/React Query ile önbellekli liste + iyimser güncelleme; sayfa kabuğu server component, düzenleyici client adası.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/remedy-automation` (üst sayfa):** Kurallar orada, teklif içeriği burada; ikisi aynı akışın parçaları ve tek bağlantı butonuyla ayrılmış. Öneri: üst sayfayı "Kurallar" ve "Teklif kataloğu" sekmelerine böl ya da en azından üst sayfada etkin teklif setinin özetini gösterip buraya derin bağlantı ver.
- **Mekan (şube) yönetimi:** Bu sayfadan çıkarılıp işletme ayarlarında bağımsız "Şubeler" sayfasına taşınmalı; QR kodları sayfası (`/dealer/qr-codes`) şube atamasını oradan almalı. Admin keşif yapılandırmasındaki `DealerLocationConfig` (`lib/discovery-config.ts`) aynı `DealerLocation` modelinden beslenmeli; iki paralel lokasyon kaydı birleştirilmeli.
- **Telafi kuyruğu / teklif ekranları:** `/api/dealer/feedbacks/[id]/remedy` ve tüketim yorumu ucu `options` gövdesiyle şablonları atlayabiliyor (`app/api/dealer/feedbacks/[id]/remedy/route.ts:72-75`); bu manuel geçersiz kılma da aynı katalog doğrulamasından geçmeli ki şablon gerçekten "izin verilen değerler" olsun.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; kod değiştirilmedi, veritabanına/sunucuya dokunulmadı. Her iddia çağıran ve çağrılan taraflar okunarak çürütülmeye çalışıldı.

### İddia 1 — Mekana özel telafi şablonları ölü özellik: `QRCode.locationId` hiçbir kod yolunda yazılmıyor
- **Karar: DOĞRULANDI** (işlevsel hata; güvenlik açığı değil. Önem "kritik" yerine **yüksek** daha isabetli: veri kaybı/yetki sorunu yok, ama sayfanın ana vaadi sessizce boşa çıkıyor).
- **Çürütme denemesi ve kanıt:**
  - Şemada alan var: `prisma/schema.prisma:729` (`locationId String?`), ilişki `:734` (`onDelete: SetNull`).
  - `QRCode`'a yazan bütün yollar tek tek okundu: oluşturma `app/api/qr-codes/route.ts:122-128` (`data: { code, name, description, dealerId }`); güncelleme `app/api/qr-codes/[id]/route.ts:63-73` (yalnız `name/description/isActive/expiresAt/revokedAt/segmentConfig`); toplu işlem `app/api/qr-codes/bulk/route.ts:48` (yalnız `isActive`); döndürme (rotate) `app/api/qr-codes/[id]/rotate/route.ts:50-55` (yeni QR'ı `locationId` olmadan oluşturuyor — bağ olsaydı bile rotate'te kaybolurdu); `app/api/feedbacks/route.ts:263` (yalnız `scanCount`).
  - Depo genelinde (`node_modules`/`generated-prisma-client` hariç) `locationId` / `location_id` araması: yazan tek yer `app/api/dealer/remedy-templates/route.ts:85` (şablonun kendi `locationId`'si). Mekan uçlarında (`app/api/dealer/locations/**`) `qrCodes: { connect }` yok; `prisma/migrations` içinde QR'ı mekana bağlayan veri göçü yok.
  - Okuyan taraflar hep `qr.locationId`'ye bakıyor: `lib/remedy-options.ts:48-54`, `:80-84`; `app/api/dealer/feedbacks/[id]/remedy/route.ts:75`; `app/api/dealer/remedy-automation/apply-scan/route.ts:114`. Tüketim yorumu ucu bilinçli olarak `null` geçiyor (`app/api/dealer/consumption-reviews/[id]/remedy/route.ts:79-82`).
  - Sayaç: `app/api/dealer/locations/route.ts:24` `_count.qrCodes`, UI `app/dealer/remedy-automation/templates/page.tsx:226`.
- **Yeniden üretim:** Bayi bu sayfada "Kadıköy" mekanını ekler → kapsam "Kadıköy" ile yalnız `points` şablonu oluşturur → işletme genelinde `discount` şablonu da vardır. Kadıköy'deki masadaki QR'dan gelen 1 yıldızlı geri bildirime telafi başlatılır → `getRemedyOptions(dealerId, null)` çalışır (çünkü `qrCode.locationId` her zaman `null`) → müşteri işletme geneli `discount` seçeneklerini görür, Kadıköy şablonu hiç görünmez. Mekan satırında "0 QR" sabit kalır. Hata mesajı ya da log yok.
- **Not:** Önerilen düzeltme (QR create/update/bulk şemasına `locationId` + mekan sahiplik kontrolü, rotate'te `locationId`'nin yeni QR'a taşınması, bağlı QR'ı olmayan mekanda kapsam seçicinin uyarıyla kısıtlanması) yerinde; rotate yolunun da kapsanması gerektiği mevcut öneriye eklenmeli.

### İddia 2 — Telafi kabulünde seçilen tür/değer şablona karşı doğrulanmıyor
- **Karar: DOĞRULANDI** (sunucu tarafı doğrulama eksikliği gerçek; ancak etki rapordaki "yüksek/güvenlik" çerçevesinden biraz düşük — **orta-yüksek**: otomatik puan basımı ya da para hareketi yok, bozulan şey kaydın bütünlüğü ve personelin güvendiği uygulama içi "kabul edilmiş teklif" kanıtı).
- **Çürütme denemesi ve kanıt:**
  - `patchSchema` iki serbest string, uzunluk üst sınırı bile yok: `app/api/customer/remedy/[offerId]/route.ts:15-18`.
  - PATCH teklifi yalnız `id/userId/status` ile çekiyor, `options` seçilmiyor: `:126-129`. Sahiplik (`:137`) ve `pending` durumu (`:143`, ayrıca `updateMany` koşulu `:161`) kontrol ediliyor — yani yalnız teklifin sahibi müşteri yapabilir, IDOR yok.
  - Değerler doğrudan yazılıyor: `:160-168`; zaman çizelgesine de aynen ekleniyor: `:187-190`.
  - Değer kısıtı yalnız istemcide: `app/customer/remedy/[offerId]/page.tsx:95-102`; sunucu bunu tekrar etmiyor.
  - Etki sınırı (çürütmeye en yakın nokta): `selectedType/selectedValue` tüketicileri arandı — yalnız müşteri GET/PATCH, müşteri listesi (`app/api/customer/remedy/route.ts:56-57`) ve müşteri ekranları (`app/customer/remedy/page.tsx:221`, `app/customer/remedy/[offerId]/page.tsx:203`). Puan defterine yazan, kupon üreten ya da bayi panelinde seçimi gösteren kod yok (`app/dealer/**` altında eşleşme yok). Dolayısıyla sahte değer **otomatik bir ekonomik kayba dönüşmüyor**; zarar, müşterinin kasada "uygulamada kabul edilmiş %100 indirim" ekranını göstermesi ve bayinin bunu sunucu tarafında doğrulayacak bir görünümünün olmaması üzerinden doğuyor.
- **Yeniden üretim:** Müşteri, seçenekleri `discount: [10,15,20]` olan `pending` teklifinin sahibi olarak oturum çerezleriyle `PATCH /api/customer/remedy/<offerId>` gövdesi `{"selectedType":"discount","selectedValue":"100"}` gönderir → 200 `success:true`, kayıt `status:'accepted', selectedValue:'100'` olur; `app/customer/remedy/[offerId]/page.tsx:203` resmi kabul ekranında "discount / 100" gösterir, zaman çizelgesi "Seçiminiz kaydedildi — teklif kullanıma hazır" der. Aynı yolla `selectedType` şablonda hiç olmayan bir tür veya çok uzun bir metin de olabilir.
- **Not:** Öneri (PATCH'te `options` seçip tür+değer eşleşmesi, eşleşmezse 400; değeri sayı olarak saklama) doğru ve küçük efor. Ek olarak `selectedType`'ı `z.enum(['discount','points','free_item'])`, `selectedValue`'yu `max` sınırıyla daraltın. Bulgu 3'teki yerine getirme (fulfilment/kupon) adımı eklendiğinde bu doğrulama **zorunlu** hale gelir; aksi halde gerçek puan basımına dönüşür (puan ekonomisi değişmezleri).

---

## Uygulama (Dalga 2)

**Yeni yer:** `/dealer/automation/remedy#katalog` ("Teklif kataloğu"); eski rota yönlendirir. Şube (mekan) yönetimi bu yüzeyden ÇIKARILDI — tek kaynak QR kodlar › Şubeler (`/dealer/qr-codes?tab=locations`). Eski `app/api/dealer/remedy-templates/**` ve `app/api/dealer/locations/**` kaldırıldı; yerine `app/api/dealer/automation/remedy/templates/**` (modül kapısı, kiracı, zod, denetim kaydı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Geri butonu | ÇALIŞIYOR — Otomasyon gezinmesi (iç içe etkileşimli öğe yok) |
| 2 | Başlık | ÇALIŞIYOR |
| 3 | İlk yükleme | ÇALIŞIYOR — SSR; hata görünür |
| 4–7 | Mekan adı / ekle / boş ad / aynı ad | KALDIRILDI — QR kodlar › Şubeler |
| 8 | Mekan listesi | ÇALIŞIYOR — kapsam seçicide şubeler |
| 9 | QR sayacı | ÇALIŞIYOR — arşivsiz QR sayısı; 0 ise "set etkisiz" uyarısı + bağlama bağlantısı |
| 10 | Mekan silme | KALDIRILDI — cascade riski bu yüzeyden çıktı |
| 11 | Yükleniyor/boş | ÇALIŞIYOR |
| 12–14 | Yeniden adlandırma / adres / aktiflik | KALDIRILDI — Şubeler sekmesinin işi; pasif şube bilgisi gösterilir |
| 15 | QR'ı mekana bağlama | ÇALIŞIYOR — QR kodlar yüzeyinde |
| 16 | Kapsam seçimi | ÇALIŞIYOR |
| 17 | Tür | ÇALIŞIYOR — tür başına kart |
| 18 | Değer girişi | ÇALIŞIYOR — çip editörü, türe göre sınır, tekil + sıralı, geçersizler adıyla bildirilir |
| 19 | Ekle | ÇALIŞIYOR — kart başına bekleme |
| 20 | 9+ değer hatası | ÇALIŞIYOR — Türkçe, en çok 8 göstergesi |
| 21 | Etiket/birim | ÇALIŞIYOR — etiket özelleştirilebilir ("Ücretsiz kahve"); ürün kataloğu bağı kalan |
| 22–23 | Liste / kapsam etiketi | ÇALIŞIYOR |
| 24 | Aktiflik göstergesi | ÇALIŞIYOR |
| 25 | Düzenleme | ÇALIŞIYOR |
| 26 | Aktif/pasif | ÇALIŞIYOR |
| 27 | Sıralama | ÇALIŞIYOR — yukarı/aşağı (müşteri ekranındaki sıra) |
| 28 | Silme | ÇALIŞIYOR — ConfirmAction, etkisi anlatılır |
| 29 | Aynı tür tekrarı | ÇALIŞIYOR — kilit altında 409; eski fazlalıklar uyarı + sil |
| 30 | Öncelik kuralı | ÇALIŞIYOR — "şube seti işletme setinin yerine geçer (birleşmez)" + etkin set kaynağı |
| 31 | Müşteri önizlemesi | ÇALIŞIYOR — kapsam başına etkin set + mesaj önizlemesi |
| 32 | Toast | ÇALIŞIYOR — doğru Türkçe |
| 33 | i18n | ÇALIŞIYOR (TR); EN çevirisi kalan |
| 34 | Yetki | ÇALIŞIYOR |
| 35 | Modül kapısı | ÇALIŞIYOR |
| 36 | Mobil | ÇALIŞIYOR — 44px hedefler |
| 37 | Erişilebilirlik | ÇALIŞIYOR — etiketli alanlar, adlı ikon butonlar |
| 38 | Kabul doğrulaması | ÇALIŞIYOR — önceki dalgada (`findRemedySelection` allowlist) |
| 39 | Puan teslimi | ÇALIŞIYOR — önceki dalgada (`acceptRemedyOffer` + lib/economy) |

### Bulgular
- **Kapandı (11):** 1 (QR yüzeyi + 0-QR uyarısı), 2 ve 3 (önceki dalga), 4, 5, 6, 7, 8, 9, 10 (TR), 11.
- **Kalan:** ürün kataloğuna bağlı ücretsiz ürün, son kullanma/bütçe alanları (ŞEMA İSTEĞİ: `RemedyTemplate.productId`, `expiresInDays`, `monthlyBudget`, `(dealerId, locationId, type)` kısmi tekil index), şablon başına kabul oranı.
