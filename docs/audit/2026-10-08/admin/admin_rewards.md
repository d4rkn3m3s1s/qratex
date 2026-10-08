# /admin/rewards

**Amaç:** Müşterilerin puanla talep ettiği ödül mağazası kataloğunu (Reward modeli) yönetmek: ödül oluşturma, düzenleme, silme, stok/maliyet/aktiflik ayarı ve havuzun özet görünümü.
**Genel puan:** 4.3 / 10
**Karar:** yeniden tasarla. Veri modeli ve talep (claim) uç noktası sağlam. Ancak yönetim yüzü temel düzeyde kırık: form her tuş vuruşunda odağı kaybediyor, prod'da görsel yükleme çalışmıyor, silme kullanıcıların satın aldığı kuponları geri dönüşsüz siliyor. Ayrıca talep ve teslimat tarafı hiç yok.

Bu inceleme salt okunur yapıldı. Kanıtlar `dosya:satır` biçiminde. Hiçbir komut, build ya da DB sorgusu çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Liste ve kart görünümü çalışıyor. Ama form pratikte kullanılamıyor (odak kaybı), prod'da yükleme kırık, oluştururken "Aktif" anahtarı yok sayılıyor, silme veri kaybına yol açıyor. |
| UX | 4/10 | Rehber kartı iyi niyetli. Ama silmeden önce onay yok, çift tıklama koruması yok, hatalar genel mesajla dönüyor, aksiyonlar yalnızca hover'da görünüyor, boş durumda CTA yok. |
| Görsel | 6/10 | Diğer admin sayfalarıyla tutarlı (AdminPremiumHero, glass kartlar). Kart ızgarası temiz. Ancak sınırsız stok kırmızı "Stok: -1" olarak görünüyor ve stat ikonları anlamsal olarak zayıf. |
| Mimari | 4/10 | Bileşen render içinde tanımlanmış, PATCH'te doğrulama yok, admin ve müşteri aynı `/api/gamification` ucunu paylaşıyor, upload dosya sistemine yazıyor, ZodError 500'e düşüyor. |
| Performans | 7/10 | Küçük veri (en fazla 200 kayıt), stagger üst sınırlı, framer `m` lazy. Her mutasyondan sonra tüm liste yeniden çekiliyor ama hacim düşük. |
| Erişilebilirlik + mobil | 3/10 | Düzenle/Sil butonları `opacity-0`, klavye odağında ve dokunmatikte görünmüyor. Label'lar input'a bağlı değil. Form her tuşta yeniden mount olduğu için ekran okuyucu ve klavye akışı kopuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim koruması (ADMIN rolü + gizli kapı cookie) | ÇALIŞIYOR | proxy.ts:51, proxy.ts:79-87 | Sayfa rotası korunuyor. API'ler bu kapının dışında (bkz. B11). |
| 2 | API yazma yetkisi (POST/PATCH/DELETE için ADMIN) | ÇALIŞIYOR | app/api/gamification/rewards/route.ts:157; app/api/gamification/rewards/[id]/route.ts:49, :106 | Yalnızca rol kontrolü var, gate cookie kontrolü yok. |
| 3 | Modül kapısı (`rewards` kapalıysa) | KISMİ | route.ts:72; page.tsx:100-102 | Modül kapalıyken admin de yönetemiyor. Sayfa sessizce "Ödül bulunamadı" gösteriyor. |
| 4 | Hero başlık (AdminPremiumHero) | ÇALIŞIYOR | page.tsx:344-348 | Azaltılmış hareket destekli (admin-premium-hero.tsx:73). |
| 5 | "Ödül mantığı" rehber kartı | ÇALIŞIYOR | page.tsx:351-364 | Statik metin. "-1 = sınırsız" bilgisi yalnızca burada var, formda yok. |
| 6 | Havuz özeti (aktif sayısı, min–max maliyet) | ÇALIŞIYOR | page.tsx:338-340, :365-369 | `toLocaleString()` locale vermiyor, binlik ayırıcı tarayıcıya göre değişiyor. |
| 7 | Stat: Toplam Ödül | ÇALIŞIYOR | page.tsx:229, :382 | API'nin `take: 200` sınırına bağlı (route.ts:133). |
| 8 | Stat: Aktif | ÇALIŞIYOR | page.tsx:230, :395 | |
| 9 | Stat: Talep Edilen | KISMİ | page.tsx:231 | `_count.users` admin hediyelerini (users/route.ts:580) de sayıyor. Zaman aralığı yok. |
| 10 | Stat: Düşük Stok | KISMİ | page.tsx:232 | `stock > 0` koşulu yüzünden tükenen (0) ödüller hiçbir metrikte görünmüyor. İkon `Star` anlamsız. |
| 11 | Ödül arama | KISMİ | page.tsx:224-226, :431-438 | Yalnızca ada göre arıyor. `toLowerCase` Türkçe İ/ı'yı doğru eşlemiyor. URL'de durum tutulmuyor. |
| 12 | "Yeni Ödül" butonu + dialog | ÇALIŞIYOR | page.tsx:440-456 | Açılıyor. Formun içi kırık (13-21). |
| 13 | Form: Ödül Adı | BOZUK | page.tsx:235, :239-243, :454 | Bileşen render içinde tanımlı, her tuşta yeniden mount oluyor ve odak kayboluyor (B1). Şema `max(50)` (validations.ts:182) ama input'ta `maxLength` yok. |
| 14 | Form: Açıklama | BOZUK | page.tsx:247-251 | Aynı odak sorunu. Sunucu `min(1)/max(200)` istiyor (validations.ts:183), istemci uyarmıyor. |
| 15 | Form: İkon metni (emoji/path) | BOZUK | page.tsx:255-259 | Aynı odak sorunu. Uzunluk ve biçim doğrulaması yok. |
| 16 | Görsel yükleme (SVG/PNG) | BOZUK (prod) | page.tsx:173-196; app/api/admin/assets/upload/route.ts:81-87; vercel.json:3-4 | Vercel'in salt okunur FS'inde `public/` altına `writeFile` çalışmaz. R2 altyapısı var ama kullanılmıyor (B3). |
| 17 | "Dosya Seç" / "Yükleniyor..." kutusu | SAHTE | page.tsx:271-274 | Tıklanamayan dekoratif bir `div`. Yanında tarayıcının kendi "Choose file" düğmesi de duruyor, aynı iş iki kez görünüyor. |
| 18 | Yüklenen görsel önizlemesi | KISMİ | page.tsx:277-282 | Yalnızca `/` ile başlayan path'ler için. Emoji ya da https URL önizlemesi yok. |
| 19 | Form: Tür seçimi | KISMİ | page.tsx:287-299 | Değer uygulanıyor, ama seçim sonrası form remount oluyor ve odak sıfırlanıyor. Tür seçince davranış (ör. fiziksel → adres) değişmiyor. |
| 20 | Form: Puan Maliyeti | BOZUK | page.tsx:303-307 | Odak sorunu var. `min` yok. Alan boşalınca `parseInt('')\|\|0` 0 yapıyor. PATCH 0 ya da negatifi kabul ediyor (B5). |
| 21 | Form: Stok | BOZUK | page.tsx:312-316 | Odak sorunu var. "-1 = sınırsız" ipucu formda yok. Eski stok değeriyle üzerine yazma riski var (B6). |
| 22 | Form: Aktif anahtarı | KISMİ | page.tsx:320-323; route.ts:174 | Oluştururken sunucu `isActive: true` sabit yazıyor, anahtar yok sayılıyor. Düzenlemede çalışıyor. |
| 23 | İptal butonu | ÇALIŞIYOR | page.tsx:326-332 | İki dialog'u da kapatıp formu sıfırlıyor. |
| 24 | Oluştur (submit) | KISMİ | page.tsx:110-130; route.ts:163, :194-200 | Yükleniyor/disabled durumu yok, çift tıklama iki kayıt açar. Zod hatası 500 + "Ödül oluşturulamadı" olarak dönüyor, alan hatası gösterilmiyor. |
| 25 | Düzenle dialog'u açma | ÇALIŞIYOR | page.tsx:210-222, :560-570 | |
| 26 | Güncelle (submit) | KISMİ | page.tsx:132-154; [id]/route.ts:62-74 | Sunucuda doğrulama yok. Sunucu hata mesajı gösterilmiyor (page.tsx:149). Stok için lost-update riski var. |
| 27 | Sil | BOZUK (tehlikeli) | page.tsx:542-549, :156-171; [id]/route.ts:118; prisma/schema.prisma:708 | Onay sorulmuyor. Cascade, müşterilerin satın aldığı UserReward kayıtlarını ve kupon kodlarını da siliyor, puan iadesi yapılmıyor (B2). |
| 28 | Ödül kartı (ikon, tür rozeti, ad, açıklama, maliyet, talep sayısı) | ÇALIŞIYOR | page.tsx:490-530 | |
| 29 | Stok rozeti | KISMİ | page.tsx:522-524 | `-1` (sınırsız) kırmızı "Stok: -1" olarak görünüyor. Müşteri tarafı bunu "Sınırsız" gösteriyor (app/customer/rewards/page.tsx:449, :662). |
| 30 | Kart aksiyonları (hover'da görünür) | KISMİ | page.tsx:532 | `opacity-0 group-hover:opacity-100`: dokunmatikte ve klavye odağında görünmüyor. |
| 31 | Yükleniyor iskeleti | ÇALIŞIYOR | page.tsx:460-473 | |
| 32 | Boş durum | KISMİ | page.tsx:474-480 | "Hiç ödül yok" ile "arama sonuç vermedi" aynı ekranı kullanıyor. CTA ve "aramayı temizle" yok. |
| 33 | Hata durumu | KISMİ | page.tsx:97-107 | Yalnızca ağ hatasında toast çıkıyor. 403/500/503 yanıtında sessizce boş liste gösteriliyor. Yeniden dene yok. |
| 34 | Kart giriş animasyonu | ÇALIŞIYOR | page.tsx:484-489; components/providers.tsx:232 | Stagger üst sınırlı (`min(index,10)`), `MotionConfig reducedMotion="user"`. |
| 35 | Dialog kapanınca form sıfırlama | BOZUK | page.tsx:560 (`onOpenChange={setEditDialogOpen}`), :440 | Düzenle ekranı X veya Esc ile kapatılınca form sıfırlanmıyor. Ardından "Yeni Ödül" o ödülün verisiyle dolu açılıyor ve kopya oluşturmaya yol açıyor (B4). |
| 36 | Havuz kuralları (`perUserLimit`, `validFrom`, `validUntil`) | EKSİK | route.ts:28-68, :261-285; validations.ts:188-194 | Backend destekliyor ve talep sırasında uyguluyor, ama UI'da hiç alan yok. Yalnızca API ile ayarlanabiliyor. |
| 37 | Filtre (aktif/pasif, tür, stok durumu) | EKSİK | route.ts:77, :116 | API `status` parametresini destekliyor, sayfa kullanmıyor. |
| 38 | Sıralama | EKSİK | route.ts:132 | Yalnızca sunucunun `cost asc` sırası var. |
| 39 | Talep / teslimat defteri (UserReward listesi, fiziksel ödül teslimi) | EKSİK | schema.prisma:699-712; `claimedAt` hiçbir yerde yazılmıyor (route.ts:106-107 yalnızca okuyor) | Fiziksel ödülün kime ve nereye gönderileceği, kupon kullanıldı mı gibi bilgilerin görüleceği bir yer yok. |
| 40 | Sayfalama / 200+ ödül | EKSİK | route.ts:133 | Stat'lar 200 kayıtla sınırlı. |
| 41 | Değişiklik geçmişi (audit) görüntüleme | EKSİK | route.ts:179-188; [id]/route.ts:76-86, :120-129 | Audit kaydı yazılıyor ama sayfada görünmüyor. |
| 42 | Çoğalt / arşivle (soft delete) / toplu işlem | EKSİK | page.tsx:531-550 | Yalnızca hard delete var. |
| 43 | i18n | EKSİK | page.tsx (tüm metinler sabit TR); app/admin/shop/page.tsx:28 `useAppT` | Komşu `/admin/shop` sayfası i18n kullanıyor, bu sayfa kullanmıyor. API'de "Unauthorized" İngilizce ([id]/route.ts:50, :107). |

**Durum sayımı:** ÇALIŞIYOR 13 · KISMİ 13 · BOZUK 8 · SAHTE 1 · EKSİK 8 (toplam 43)

---

## Bulgular

### B1 · KRİTİK · Hata/UX · Form her tuş vuruşunda odağı kaybediyor
- **Kanıt:** `RewardForm`, `AdminRewardsPage` gövdesi içinde arrow-function bileşen olarak tanımlanmış (page.tsx:235) ve JSX olarak kullanılıyor (`<RewardForm …/>` page.tsx:454, :568). Her alan `setFormData` çağırıyor (page.tsx:241, :249, :257, :306, :315).
- **Sorun:** Her render'da `RewardForm` yeni bir fonksiyon kimliği alıyor. React bunu farklı bir bileşen tipi sayıyor ve tüm alt ağacı unmount edip yeniden mount ediyor. Sonuç: input'a tek karakter yazıldıktan sonra odak gidiyor, Select açıksa kapanıyor, file input sıfırlanıyor. Ödül adı gibi bir alanı doldurmak için her harften sonra yeniden tıklamak gerekiyor. Bu sayfanın ana işi olan oluşturma ve düzenleme fiilen kullanılamaz durumda. Bu yorum kod okumasıyla yapıldı (React'in bilinen davranışı). Tarayıcıda çalıştırılarak doğrulanmadı.
- **Öneri:** Formu modül seviyesinde ayrı bir `RewardFormDialog` bileşenine taşıyın. `react-hook-form` + `zodResolver(createRewardSchema)` ile yönetin; `createRewardSchema` istemci ve sunucuda tek doğruluk kaynağı olsun. Dialog'u `mode: 'create' | 'edit'` ve `initialValues` prop'larıyla yönetin. Kapanışta (`onOpenChange(false)`) `reset()` çağırın. Alan hataları `FormMessage` ile, sayaçlar (50/200) ise input altında gösterilsin.
- **Efor:** S

### B2 · KRİTİK · Veri bütünlüğü / Puan ekonomisi · Tek tıkla silme, müşterilerin satın aldığı ödülleri ve kupon kodlarını iade etmeden yok ediyor
- **Kanıt:** Sil butonu doğrudan `handleDelete` çağırıyor, onay yok (page.tsx:542-549, :156-160). API hard delete yapıyor (`prisma.reward.delete`, [id]/route.ts:118). `UserReward.reward` ilişkisi `onDelete: Cascade` (prisma/schema.prisma:708).
- **Sorun:** Puanla satın alınmış ve `debitPoints` ile puanı düşülmüş (route.ts:303) her `UserReward` satırı, kupon kodlarıyla (`code @unique`) birlikte siliniyor. Müşterinin "Ödüllerim" listesi boşalıyor (route.ts:81-97), puan iadesi yapılmıyor, teslim edilmemiş fiziksel ödüllerin kaydı kayboluyor. Geriye yalnızca `CLAIM_REWARD` audit satırları kalıyor. Bu, proje genelindeki puan ekonomisi değişmezlerine aykırı: harcanan puanın karşılığı bulunmalı. Ayrıca hover'da çıkan küçük çöp kutusuna yanlışlıkla dokunmak yeterli.
- **Öneri:** (1) Sil yerine varsayılan olarak **Arşivle** sunun: `isActive=false` + `archivedAt` alanı ile soft delete. (2) Hard delete'i yalnızca `_count.users === 0` olan ödüllere açın. Sunucu tarafında `UserReward` varsa 409 dönsün. Şemada ilişkiyi `onDelete: Restrict` yapın; bu canlı DB'de migration gerektirir, ayrıca planlanmalı. (3) UI'da silme için AlertDialog kullanın; kaç talebin etkileneceğini gösterin ve ödül adını yazarak onay isteyin. (4) Talebi olan bir ödül gerçekten kaldırılacaksa, açık talepleri iade eden (`creditPoints`) ve tek transaction içinde çalışan ayrı bir "Geri çek + iade et" akışı tasarlayın.
- **Efor:** M

### B3 · YÜKSEK · Hata / Altyapı · Görsel yükleme prod'da çalışmıyor
- **Kanıt:** Upload route `public/images/uploads/<folder>` altına `writeFile` yapıyor (app/api/admin/assets/upload/route.ts:81-85). Proje Vercel'de (vercel.json:2-5). R2 yardımcıları mevcut (lib/r2-storage.ts:18, :49) ve ekip ekleri route'u R2'yi öncelikli kullanıyor (app/api/admin/team/tasks/[id]/attachments/route.ts:6).
- **Sorun:** Vercel fonksiyonlarında `process.cwd()/public` salt okunur. Yazma işlemi EROFS ile düşer ve catch'te "Dosya yüklenemedi" döner. Yazma başarılı olsa bile build sonrası eklenen `public/` dosyaları CDN'den servis edilmez. Lokalde çalışır, canlıda çalışmaz. Bu sonuç koddan çıkarıldı, canlıda denenmedi.
- **Öneri:** Upload'u `uploadToR2` üzerine taşıyın (`isR2Configured()` yoksa açık bir 503 dönsün, yerel yazma yalnızca `NODE_ENV=development` iken yapılsın). Dönen https URL'i için sayfadaki `icon.startsWith('/')` kontrolünü (page.tsx:277, :494) `isImageSrc(icon)` gibi bir yardımcıya çevirin; `/` ya da `https://` ile başlayanlar görsel, geri kalanı emoji olarak işlensin. R2 alan adını `next.config` `remotePatterns`'a ekleyin.
- **Efor:** S

### B4 · YÜKSEK · Hata · Düzenleme ekranı X/Esc ile kapatılınca "Yeni Ödül" eski ödülün verisiyle açılıyor
- **Kanıt:** `openEditDialog` formu dolduruyor (page.tsx:212-220). Düzenle dialog'unun `onOpenChange={setEditDialogOpen}` handler'ı sıfırlama yapmıyor (page.tsx:560). Sıfırlama yalnızca İptal butonunda var (page.tsx:326-330). Yeni Ödül dialog'u aynı `formData`'yı kullanıyor (page.tsx:440, :454).
- **Sorun:** Admin bir ödülü inceleyip Esc ile kapatıyor, sonra "Yeni Ödül"e basıyor. Form önceki ödülün ad, maliyet ve görseliyle dolu açılıyor ve "Oluştur" ile kopya ödül yaratılıyor. `selectedReward` da temizlenmiyor.
- **Öneri:** B1'deki ayrı dialog bileşeniyle birlikte çözülür: her açılışta `reset(initialValues)` çağrılır, create modu her zaman `DEFAULT_REWARD` ile başlar.
- **Efor:** S (B1 ile birlikte)

### B5 · YÜKSEK · Güvenlik / Puan ekonomisi · PATCH ucunda hiç doğrulama yok, ödüller bedava hale gelebiliyor
- **Kanıt:** `[id]/route.ts:54-73`: `body` doğrudan `prisma.reward.update`'e veriliyor; tür, aralık ve enum kontrolü yok. İstemci boş alanı 0'a çeviriyor (page.tsx:306). `debitPoints` 0 ve negatif değeri 0'a kırpıp hiç puan düşmeden dönüyor (lib/points-wallet.ts:76-88). Oluşturmada `cost.positive()` zorunlu (validations.ts:185), güncellemede bu kural yok.
- **Sorun:** Maliyet alanını silip "Güncelle"ye basmak `cost: 0` yazar. Stok -1 ise sınırsız sayıda bedava kupon kodu basılabilir. Ayrıca `type` serbest metin olabilir, `name`/`description` boş ya da limitsiz uzunlukta olabilir, `metadata` doğrulanmadan yazılır. Admin hatasına açık bir puan ekonomisi deliği.
- **Öneri:** `updateRewardSchema = createRewardSchema.partial().extend({ isActive: z.boolean().optional() })` tanımlayıp PATCH'te `safeParse` kullanın. Hataları 400 + `fieldErrors` olarak dönün. Hem POST hem PATCH `ZodError`'u 500'e düşürmek yerine (route.ts:194-200) 400'e çevirsin. 0 maliyetli ödül bilinçli bir ürün kararıysa ayrı bir `isFree` bayrağı ve onay adımı gerekli.
- **Efor:** S

### B6 · ORTA · Yarış koşulu · Düzenleme sırasında oluşan talepler stok güncellemesiyle eziliyor
- **Kanıt:** Düzenle formu `stock` değerini açılış anındaki listeden alıyor (page.tsx:217). PATCH bu değeri mutlak olarak yazıyor (`stock: body.stock`, [id]/route.ts:70). Talep akışı stoku atomik olarak `decrement` ediyor (route.ts:288-296).
- **Sorun:** Admin dialog'u açıkken müşteriler 5 adet talep ederse ve admin yalnızca açıklamayı değiştirip kaydederse, stok 5 birim geri "artar" ve fazla satış (overselling) oluşur.
- **Öneri:** PATCH yalnızca değişen alanları göndersin (`dirtyFields`). Stok için ayrı bir "Stok ayarla" aksiyonu sunun: `{ stockDelta: +50 }` ya da `{ stock, expectedStock }` gönderilsin, sunucu `updateMany({ where:{id, stock: expectedStock} })` ile optimistic concurrency uygulayıp çakışmada 409 dönsün. Genel çözüm olarak `updatedAt` ile `If-Match` benzeri bir sürüm kontrolü eklenebilir.
- **Efor:** M

### B7 · ORTA · UX / Hata · Oluşturmada "Aktif" anahtarı yok sayılıyor
- **Kanıt:** Form `isActive` gönderiyor (page.tsx:80-88, :115). Sunucu `isActive: true` sabit yazıyor (route.ts:174). Şemada `isActive` alanı yok (validations.ts:181-195).
- **Sorun:** Admin taslak olarak pasif bir ödül hazırlamak istiyor, ama ödül hemen müşteri mağazasına düşüyor. Yarım kalmış bir ödül canlıya çıkabilir.
- **Öneri:** Şemaya `isActive: z.boolean().default(false)` ekleyin. Varsayılanı "Taslak" yapıp kart üzerinde "Yayınla" aksiyonu sunun.
- **Efor:** S

### B8 · ORTA · UX · Gönderim sırasında kilit, alan hatası ve sunucu mesajı yok
- **Kanıt:** Submit butonunda `disabled`/loading yok (page.tsx:333). `handleUpdate` sunucu mesajını atıyor (page.tsx:148-150). POST'ta Zod hataları 500 ile genel mesaja dönüşüyor (route.ts:163, :194-200).
- **Sorun:** Çift tıklama iki ödül açar. Açıklama boşken "Ödül oluşturulamadı" gibi neden belirtmeyen bir mesaj çıkar ve admin sorunun ne olduğunu bilemez.
- **Öneri:** `isSubmitting` ile butonu kilitleyin. 400 yanıtlarındaki `fieldErrors` değerlerini `form.setError` ile ilgili alanlara bağlayın. POST'a `checkIdempotency` (lib/idempotency.ts) ekleyin; talep ucunda zaten kullanılıyor (route.ts:209).
- **Efor:** S

### B9 · ORTA · Erişilebilirlik / Mobil · Düzenle ve Sil yalnızca fare hover'ında görünüyor
- **Kanıt:** `opacity-0 group-hover:opacity-100` (page.tsx:532). `focus-within` karşılığı yok. Label'lar `htmlFor` ile bağlı değil (page.tsx:238, :246, :254, :286, :302, :311, :319).
- **Sorun:** Dokunmatik cihazda butonlar görünmüyor ama dokunulabilir, bu da yanlışlıkla silmeye kapı açıyor (B2 ile birleşince tehlikeli). Klavye kullanıcısı Tab ile görünmez butonlara geliyor. Ekran okuyucu "Puan Maliyeti" ve input'u ilişkilendiremiyor, Switch etiketsiz okunuyor.
- **Öneri:** Aksiyonları her zaman görünür bir `DropdownMenu` (⋯) içine alın, ya da `group-focus-within:opacity-100` + `@media (hover:none)` ile kalıcı görünür yapın. Silme yalnızca menüden ve onayla yapılabilsin. Tüm alanlar shadcn `FormField/FormLabel` ile bağlansın. Çöp kutusu ikon butonuna `aria-label="Ödülü sil"` ekleyin.
- **Efor:** S

### B10 · ORTA · Ürün eksikliği · Havuz kuralları backend'de var, UI'da yok
- **Kanıt:** `perUserLimit`, `validFrom`, `validUntil` talep sırasında uygulanıyor (route.ts:258-285) ve şemada var (validations.ts:188-194). Sayfa formunda hiçbiri yok (page.tsx:235-336).
- **Sorun:** "Kişi başı 1", "kampanya 1-15 Ekim" gibi ödül kurgusunda en çok kullanılan kurallar yalnızca elle API çağrısıyla ayarlanabiliyor. Admin hangi ödülde kural olduğunu da göremiyor (karta yansımıyor).
- **Öneri:** Formda katlanabilir bir "Kurallar" bölümü ekleyin: kişi başı limit (number), geçerlilik aralığı (DateRangePicker, TR saat dilimi → ISO). Kartta küçük rozetler gösterin ("Kişi başı 1", "15 Eki'de bitiyor", süresi dolmuşsa "Süresi doldu" + gri ton).
- **Efor:** M

### B11 · ORTA · Mimari / Güvenlik · Admin yazma uçları müşteri namespace'inde ve gizli kapının dışında
- **Kanıt:** Ödül yönetimi `/api/gamification/rewards` (POST) ve `/api/gamification/rewards/[id]` (PATCH/DELETE) üzerinden yapılıyor. Proxy `/api/*` için gate cookie kontrolü yapmıyor (proxy.ts:104-118). Gate kontrolü yalnızca sayfa rotalarında var (proxy.ts:79).
- **Sorun:** "Rolü yanlışlıkla ADMIN yapılan kişi gizli cevabı bilmeden yönetemez" savunması, ödül silme ve maliyet değiştirme için geçerli değil; rol yeterli. Bu sistem çapında bir tasarım kararı, yalnızca bu sayfaya özgü değil. Ayrıca `GET /api/gamification/rewards/[id]` kimlik doğrulaması ve `isActive` filtresi olmadan pasif ödülün tüm verisini (metadata dahil) döndürüyor ([id]/route.ts:13-31). Etkisi düşük bir bilgi sızıntısı.
- **Öneri:** Admin CRUD işlemlerini `/api/admin/rewards` altına taşıyın ve `requireAuth(['ADMIN'])` + gate cookie doğrulamasını (lib/admin-gate-edge) ortak bir `requireAdmin()` yardımcısında birleştirin. Müşteri uçları salt okuma + claim olarak kalsın. `[id]` GET, admin değilse `isActive: true` filtrelesin.
- **Efor:** M

### B12 · ORTA · Ürün eksikliği · Talep / teslimat (fulfillment) yönetimi hiç yok
- **Kanıt:** `UserReward.claimedAt` alanı var (schema.prisma:704), müşteri tarafı `isUsed` olarak okuyor (route.ts:106-107, app/customer/rewards/page.tsx:63), ama kod tabanında `claimedAt` yazan hiçbir yer yok (grep: yalnızca okuma ve export). Sayfa yalnızca toplam `_count.users` gösteriyor (page.tsx:528).
- **Sorun:** "Fiziksel" tür sunuluyor ama kime, hangi adrese, ne zaman gönderileceği; kupon kodu kullanıldı mı gibi bilgilerin işleneceği bir yer yok. Müşteri tarafında "Kullanıldı" durumu hiçbir zaman true olmuyor. Bu, operasyonel olarak yarım bir ürün.
- **Öneri:** Sayfaya bir **Talepler** sekmesi ekleyin: `GET /api/admin/rewards/redemptions?status=&rewardId=&cursor=` (UserReward + user email + reward), durum makinesi `pending → fulfilled → used / cancelled(refund)`. Şemaya `status`, `fulfilledAt`, `fulfilledBy`, `note` alanları eklenmeli (canlı Neon migration; ayrıca planlanmalı). İptal + iade tek transaction'da `creditPoints` ile yapılmalı. Fiziksel ödüller için talep anında adres toplanmalı.
- **Efor:** L

### B13 · DÜŞÜK · Hata / UX · Hata ve modül-kapalı durumları sessiz kalıyor
- **Kanıt:** `if (data.success)` dışında dal yok (page.tsx:100-102). Modül kapısı 403/benzeri dönebiliyor (lib/module-gate.ts:100-104). 503 DB yanıtı da aynı şekilde yutuluyor.
- **Sorun:** DB kesintisinde veya modül kapalıyken admin "Ödül bulunamadı" görüyor ve hiç ödül olmadığını sanıyor. Yanlış teşhise yol açıyor.
- **Öneri:** Üç ayrı durum tasarlayın: hata kartı (mesaj + "Yeniden dene"), "Ödül modülü kapalı → Modüller sayfasına git" (/admin/modules bağlantısı) ve gerçek boş durum ("İlk ödülünü oluştur" CTA). Veri katmanında SWR/React Query kullanın ve `mutate` ile optimistic güncelleme yapın.
- **Efor:** S

### B14 · DÜŞÜK · Görsel / Veri doğruluğu · Sınırsız stok kırmızı "Stok: -1" görünüyor, tükenenler metrikte yok
- **Kanıt:** Rozet varyantı `stock > 10 ? outline : stock > 0 ? warning : destructive` (page.tsx:522). `-1` destructive oluyor. Düşük stok `stock < 10 && stock > 0` (page.tsx:232). Müşteri tarafında "Sınırsız" (app/customer/rewards/page.tsx:449).
- **Sorun:** En yaygın kurgu olan sınırsız ödüller "tükenmiş" gibi kırmızı görünüyor. Tükenen (0) ödüller hiçbir stat'ta sayılmıyor, oysa admin'in en acil bilmesi gereken şey bu.
- **Öneri:** Stok gösterimini bir `formatStock()` yardımcısında merkezileştirin; müşteri ve admin aynı yardımcıyı kullansın ("Sınırsız" / "Tükendi" / "Az kaldı: 4"). Stat'ları "Tükenen" ve "Az kalan" olarak ayırın, tıklanınca ızgarayı filtrelesinler.
- **Efor:** S

### B15 · DÜŞÜK · Tutarlılık · Dil ve terminoloji karışıklığı
- **Kanıt:** Sayfa metinleri sabit TR (page.tsx genelinde). Komşu `/admin/shop` `useAppT` kullanıyor (app/admin/shop/page.tsx:28). API "Unauthorized" İngilizce ([id]/route.ts:50, :107). "Kupon" hem ödül türü (page.tsx:62) hem ayrı bir indirim kuponu modülü (/admin/coupons, app/admin/coupons/page.tsx:15) için kullanılıyor. Aramada `toLowerCase` kullanılıyor (page.tsx:225).
- **Öneri:** Metinleri i18n anahtarlarına taşıyın. Ödül türünü "Kupon kodu" ya da "Partner kuponu" olarak yeniden adlandırarak abonelik indirim kuponlarından ayırın. Arama `toLocaleLowerCase('tr-TR')` kullansın ve ad + açıklama + tür üzerinde arasın.
- **Efor:** S

### B16 · DÜŞÜK · Ölü kod / Tip · Küçük temizlikler
- **Kanıt:** `Reward.metadata` tanımlı ama kullanılmıyor (page.tsx:52). `catch (error)` değişkenleri kullanılmıyor (page.tsx:103, :127, :151, :168). `value as Reward['type']` gereksiz cast (page.tsx:289; tip zaten `string`). Dosya sonunda boş satırlar var (page.tsx:574-577). "Dosya Seç" kutusu sahte bir buton (page.tsx:271-274).
- **Öneri:** `type: 'physical' | 'digital' | 'coupon'` union tipini şemadan türetin (`z.infer`). Sahte kutuyu gerçek bir dropzone (gizli `input[type=file]` + label) ile değiştirin.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard Products, Shopify ürün listesi, Retool CRUD, PostHog)

1. **Talep / teslimat defteri:** Stripe'ın "Payments" listesine benzer şekilde her talebin durumu (bekliyor/teslim edildi/kullanıldı/iptal+iade), kullanıcı, kod ve tarih görünmeli. Filtre ve CSV dışa aktarma olmalı.
2. **Durum yaşam döngüsü:** Taslak → Yayında → Arşiv. Hard delete yerine arşiv (Stripe ürünlerini silmez, arşivler). Zamanlanmış yayın, `validFrom`/`validUntil` UI'ı.
3. **Ödül başına analitik:** Talep trendi (7/30 gün sparkline), toplam harcanan puan (puan sink hacmi), dönüşüm (görüntülenme → talep). `reward_copy` A/B deneyinin (route.ts:271, :348-360) sonuçlarının bu sayfada görünmesi.
4. **Liste görünümü + filtre + sıralama + toplu işlem:** Tablo/ızgara geçişi, tür/durum/stok filtreleri (URL'de durumlu), maliyet/talep/tarih sıralaması, çoklu seçimle aktif/pasif yapma.
5. **Stok operasyonları:** "Stok ekle (+N)" aksiyonu, düşük stok eşiği ve bildirim (Shopify "low inventory"), stok hareket geçmişi.
6. **Değişiklik geçmişi ve önizleme:** Audit kayıtlarının (UPDATE_REWARD oldData/newData) ödül detayında diff olarak görünmesi. "Müşteri mağazasında nasıl görünür" önizlemesi ve ödülü çoğaltma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Puan Mağazası" operasyon merkezi. Admin bu sayfada üç soruya 5 saniyede yanıt bulabilmeli: *Ne satıyorum? Ne tükeniyor? Kime ne teslim etmem gerekiyor?*

**Yerleşim:**
- **Üst şerit (KPI'lar, tıklanabilir filtre olarak çalışır):** Yayında · Taslak · Tükenen · Az kalan · Bekleyen teslimat · Son 30 gün harcanan puan. Her kutu tıklandığında alttaki listeyi filtreler. Mevcut uzun rehber kartı, başlık yanındaki `(?)` popover'ına ve boş duruma taşınır.
- **Sekmeler:** `Katalog` | `Talepler` | (birleşim sonrası) `Kozmetikler`.
- **Katalog:** Varsayılan tablo görünümü (ikon, ad, tür, maliyet, stok, kurallar, 30 gün talep sparkline, durum, ⋯ menü), ızgara görünümü isteğe bağlı. Sağda arama + filtre çipleri + sıralama, durum URL query'de tutulur. Satıra tıklayınca sağdan **Sheet** açılır: sol tarafta form (Temel / Fiyat & stok / Kurallar / Görsel dropzone), sağ tarafta müşteri kartının canlı önizlemesi (`app/customer/rewards` kart bileşeni paylaşılarak). Kaydetme "dirty" alanlarla PATCH eder; sürüm çakışmasında "Bu ödül sen düzenlerken değişti" uyarısı çıkar.
- **Talepler:** Cursor-paginated tablo, durum çipleri, satır aksiyonları (Teslim edildi / Kod kullanıldı / İptal et ve iade et; iade için onay dialog'u gösterilir ve iade edilecek puan net yazılır).
- **Silme:** Yalnızca ⋯ menüden. Talebi varsa yalnızca "Arşivle" seçeneği sunulur. Talebi yoksa ad yazarak onaylanan bir AlertDialog kullanılır.

**Motion / 3D (ölçülü):**
- Mevcut `scale 0.9 → 1` kart girişi bir yönetim aracı için gereksiz. Liste ilk yüklemede tek bir `opacity` fade yeterli. Filtre değişiminde `layout` animasyonu (framer `m.div layout`, LazyMotion uyumlu) satırların yer değiştirmesini anlaşılır kılar.
- KPI sayılarında hafif bir sayı geçişi (yalnızca değer değişince), Sheet için standart slide-in yeterli.
- 3D kullanılmamalı: projenin imza sürpriz kutusu (three.js) müşteri tarafının deneyimidir. Admin önizleme panelinde istenirse statik bir thumbnail gösterilebilir. Tüm hareketler `MotionConfig reducedMotion="user"` ile zaten uyumlu kalır.

**Veri / API değişiklikleri:**
- `app/api/admin/rewards` (GET liste: filtre/sıralama/cursor + 30 gün talep agregatı tek `groupBy` ile, N+1 yok; POST; PATCH dirty + `expectedUpdatedAt`; POST `:id/archive`; POST `:id/stock` delta).
- `app/api/admin/rewards/redemptions` (GET cursor list; PATCH durum geçişi; POST `:id/refund` → `creditPoints` + durum tek transaction'da).
- `lib/validations.ts`: `createRewardSchema` + `updateRewardSchema` + `isActive`. İstemci ve sunucu aynı şemayı kullanır.
- Prisma (canlı Neon, ayrı planlı migration): `Reward.archivedAt`, `UserReward.status/fulfilledAt/fulfilledBy/note/shippingAddress`, `UserReward.reward onDelete: Restrict`.
- Upload: `uploadToR2` + `remotePatterns`. İkon alanı tipli hale gelir: `{ kind: 'emoji' | 'image', value }` ya da yardımcı `isImageSrc`.
- Cache: Liste müşteri tarafında Redis ile önbelleklenirse admin mutasyonlarında tag invalidation yapılmalı. Şu an `force-dynamic` olduğu için gerek yok.

---

## Çakışmalar / birleştirme önerisi

- **/admin/shop (kozmetik mağazası):** Aynı ürün kavramı: puanla satın alınan katalog öğesi (fiyat, görsel, aktiflik, tür). Ayrı model (`/api/admin/cosmetics`, app/admin/shop/page.tsx:71) ve ayrı UI ile tekrar ediliyor; üstelik shop i18n kullanıyor, rewards kullanmıyor. **Öneri:** Tek bir "Puan Mağazası" sayfasında `Ödüller` ve `Kozmetikler` sekmeleri olarak birleştirin, paylaşılan `CatalogTable` + `CatalogItemSheet` bileşenleriyle. Veri modelleri ayrı kalabilir.
- **/admin/users → "Ödül Ver" (grant_reward):** Admin'in ödül hediye etmesi kullanıcı sayfasında (app/admin/users/users-client.tsx:546-552, app/api/admin/users/route.ts:580). Kalabilir, ama hediyeler Talepler sekmesinde "Admin hediyesi" kaynağıyla görünmeli ve stattaki "Talep Edilen" sayısından ayrılmalı.
- **/admin/coupons:** Abonelik indirim kuponları (percentage/fixed, app/admin/coupons/page.tsx:15). Amaç farklı, birleştirilmemeli; ancak "Kupon" ödül türüyle isim çakışması giderilmeli (B15).
- **/admin/points-matrix, /admin/gamification-settings:** Puan kazanım (mint) tarafı. Bu sayfa puan harcama (sink) tarafı. Birleştirme gerekmez, ama bir "Ekonomi" grubu altında yan yana durmaları ve mağaza KPI'larındaki "harcanan puan" verisinin points-matrix'teki "kazanılan puan" ile karşılaştırılabilmesi önerilir.

---

## Doğrulama (şüpheci inceleme)

Yöntem: salt okunur kod okuması (sayfa, çağrılan API'ler, `lib/points-wallet.ts`, `lib/validations.ts`, `prisma/schema.prisma`, `next.config.js`, `vercel.json`). Tarayıcı, DB, build ve test çalıştırılmadı.

### 1. RewardForm render içinde tanımlı, her tuşta remount oluyor: **DOĞRULANDI**
- Kanıt: `app/admin/rewards/page.tsx:235` içinde `const RewardForm = (...) => (...)` `AdminRewardsPage` gövdesinde tanımlanıyor ve `:454` ile `:568`'de `<RewardForm />` olarak JSX eleman tipi şeklinde kullanılıyor. Her `setFormData` (`:241`, `:249`, `:257`, `:289`, `:306`, `:315`, `:322`) üst bileşeni yeniden render ediyor, bu da yeni bir fonksiyon kimliği üretiyor. React farklı tip gördüğü için alt ağacı unmount edip yeniden mount ediyor. `next.config.js` içinde `reactCompiler` yok. Olsaydı bile `formData` bağımlılığı değiştiği için kimlik yine değişirdi.
- Yeniden üretim: "Yeni Ödül" > "Ödül Adı" alanına "Premium" yazın. İlk harften sonra `<input>` DOM düğümü değişir, odak kaybolur ve her harf için alana yeniden tıklamak gerekir. Aynısı Açıklama, Maliyet ve Stok alanları ile düzenleme dialog'u için de geçerli.
- Düzeltme: "Select kapanıyor" kısmı abartılı. Radix Select seçimden sonra zaten kapanır. Asıl kırılma metin ve sayı girişlerinde. Ciddiyet YÜKSEK; form fiilen çok zor kullanılıyor.

### 2. Ödül silme, satın alınmış UserReward kayıtlarını iade etmeden siliyor: **DOĞRULANDI**
- Kanıt: Çöp kutusu butonu doğrudan `handleDelete(reward.id)` çağırıyor (`page.tsx:546`). Arada onay yok (`:156-171`). API hard delete yapıyor: `prisma.reward.delete` (`app/api/gamification/rewards/[id]/route.ts:118`). Şemada `UserReward.reward ... onDelete: Cascade` var (`prisma/schema.prisma:708`). Talep anında `debitPoints` ile puan düşülüyor (`app/api/gamification/rewards/route.ts:303-306`). Silme yolunda hiçbir iade (`creditPointsAndXp`) yok. Geriye yalnızca `DELETE_REWARD` ve eski `CLAIM_REWARD` auditLog satırları kalıyor.
- Yeniden üretim: Müşteri 500 puanla bir "Kupon" ödülü talep eder ve `KPN-XXXX` kodunu alır. Admin ödülü emekliye ayırmak için çöpe tek tıklar. Müşterinin `/api/gamification/rewards?myRewards=true` listesinden kayıt ve kod kaybolur, `journey-timeline` ve `data-export` çıktılarından da düşer. 500 puan geri gelmez. Henüz teslim edilmemiş fiziksel ödüller için teslim takibi de tamamen kaybolur.
- Not: Yetki doğru (yalnız ADMIN), yani bu bir saldırı değil, admin eliyle geri alınamaz veri ve değer kaybı. "Puan ekonomisi değişmezi" açısından mint değil kayıp yönünde bir ihlal. Ciddiyet YÜKSEK.

### 3. PATCH doğrulamasız, cost 0 ya da negatif yazılabiliyor: **DOĞRULANDI (ciddiyet KRİTİK değil, ORTA)**
- Kanıt: PATCH body'yi şemasız olarak `prisma.reward.update`'e veriyor (`[id]/route.ts:54-73`). POST ise `createRewardSchema` kullanıyor ve `cost: z.number().positive()` ile 0'ı reddediyor (`lib/validations.ts:185`). Aynı veri iki yolda farklı kurallarla korunuyor. İstemci boş alanı `parseInt(...) || 0` ile 0'a çeviriyor (`page.tsx:306`). `debitPoints` `Math.max(0, ...)` sonrası 0'da puan düşmeden dönüyor (`lib/points-wallet.ts:76-88`).
- Yeniden üretim: Admin düzenleme dialog'unda maliyeti silip başka bir değer yazmadan "Güncelle"ye basar. Sunucu `cost: 0` kaydeder. Stok -1 ise her müşteri, `perUserLimit` metadata'sı yoksa sınırsız sayıda, bedava `UserReward` ve kupon kodu alır. Negatif maliyet de 0'a kırpılır, yani bedava olur.
- Şüpheci sınırlamalar: (a) Uç yalnız ADMIN'e açık, dışarıdan istismar yolu yok. Bu bir güvenlik açığı değil, bir bütünlük ve "kaza" riski. (b) Negatif maliyet puan BASMAZ (`Math.max(0)`). Yalnızca ödülü bedava yapar. (c) Alan 0'a döndüğünde input ekranda "0" gösteriyor, yani hata görünür. (d) `type` için geçersiz string yazılabiliyor. `cost` veya `stock` string gelirse Prisma tip hatası 500 döner. Ek gözlem: `isActive: body.isActive ?? true` (`:72`), alanı göndermeyen kısmi bir PATCH pasif ödülü sessizce yeniden yayına alır.

### 4. Admin görsel yükleme prod'da (Vercel) çalışmaz: **DOĞRULANDI (kod ve deploy hedefinden; canlıda denenmedi)**
- Kanıt: `app/api/admin/assets/upload/route.ts:81-85` dosyayı `process.cwd()/public/images/uploads/<folder>` altına `mkdir` ve `writeFile` ile yazıyor. Deploy hedefi Vercel (`vercel.json:2-5` `framework: nextjs`, `regions: ["fra1"]`; `next.config.js:262` yorumu "Vercel: public/ içeriği statik olarak servis edilir"). Vercel fonksiyon dosya sistemi `/tmp` dışında salt okunur. `mkdir`/`writeFile` EROFS fırlatır, `catch` 500 ile "Dosya yüklenemedi" döner (`:89-92`). Yazma başarılı olsaydı bile `public/` build anında CDN'e alındığından yeni dosya URL'den servis edilmezdi. `lib/r2-storage.ts` mevcut ama bu route'ta kullanılmıyor.
- Yeniden üretim: Canlıda Ödül oluştur > "Dosya Seç" ile PNG seçilir. Toast "Dosya yüklenemedi" gösterir. Aynı route `app/admin/badges/badges-client.tsx:402` tarafından da kullanıldığı için rozet görsel yüklemesi de aynı şekilde bozuk.
- Not: Lokal geliştirmede çalışır (repoda `public/images/uploads/badges` mevcut), bu yüzden geliştirme sırasında fark edilmemiş olması olası.

### Özet
| # | İddia | Karar | Ciddiyet (doğrulama sonrası) |
|---|---|---|---|
| 1 | RewardForm remount / odak kaybı | Doğrulandı | Yüksek |
| 2 | Cascade silme, iade yok, onay yok | Doğrulandı | Yüksek |
| 3 | PATCH doğrulamasız, cost 0 ile bedava | Doğrulandı | Orta (admin-only, mint yok) |
| 4 | Upload Vercel'de çalışmaz | Doğrulandı (canlıda denenmedi) | Yüksek (rozet sayfasını da etkiler) |
