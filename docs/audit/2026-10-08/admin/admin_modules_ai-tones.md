# /admin/modules/ai-tones

**Amaç:** Bayilerin otomatik yanıt kurallarında (`AutoReplyRule.tone`) seçtiği "üslup" için AI'ya gönderilen sistem promptunu platform genelinde (tüm bayiler için tek set) tanımlamak ve düzenlemek. Veri `AITone` tablosunda, tüketici `lib/ai-engine.ts` içindeki `generateAutoReply`.

**Genel puan:** 3.5/10 · **Karar:** yeniden tasarla (ve `/admin/ai-settings` içine birleştir)

Sayfa küçük bir CRUD ekranı ama ürünün geri kalanına bağlantısı kopuk. Admin'in burada eklediği yeni üsluplar bayi tarafında hiçbir zaman seçilemiyor. Sistemde gerçekten çalışan 4 yerleşik üslup ise bu ekranda görünmüyor. Bunun yanında, düzenleme sonrası "Yeni Üslup Ekle"ye basınca önceki kaydın üzerine yazılmasına yol açan bir durum hatası var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Liste, ekleme ve düzenleme çalışıyor. Ancak eklenen slug'lar bayi seçicisine ulaşmıyor, silme ve pasifleştirme yok, düzenleme sonrası ekleme akışı yanlış kaydı güncelliyor. |
| UX | 3/10 | Yerleşik varsayılanlar, kullanım sayısı, test/önizleme ve slug'ın kritik bir anahtar olduğu hiçbir yerde anlatılmıyor. İpucu metni sistemde olmayan bir yetenek ("müşteri ismini kullan") vaat ediyor. |
| Görsel | 5/10 | Temiz bir shadcn kart listesi. `PageHeader` kullanılmıyor, layout padding'i iki kez uygulanıyor, `text-[10px]` okunurluğu zayıf. |
| Mimari | 3/10 | Doğrulama (zod) yok, PATCH body'si doğrudan Prisma'ya veriliyor, audit log yok, `any` tipleri var, slug kontratı bayi UI'ında sabit kodlu. |
| Performans | 7/10 | Tek ve hafif bir istek, liste küçük. Tüketici tarafta her otomatik yanıtta cache'siz DB okuması var (küçük bir etki). |
| Erişilebilirlik + Mobil | 4/10 | Düzenle butonu yalnızca ikon ve `aria-label` taşımıyor. Formdaki `grid-cols-2` mobilde daralmıyor. Yükleniyor durumunda `aria-live` yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi (admin gate + API rol kontrolü) | ÇALIŞIYOR | `app/api/admin/settings/ai-tones/route.ts:9,24,42` (`requireAuth(['ADMIN'])`) | Üç uç da ADMIN rolünü ve token-replay kontrolünü uyguluyor. |
| 2 | İlk yükleme (`GET /api/admin/settings/ai-tones`) | KISMİ | `page.tsx:26-36` | `res.ok` kontrolü yok. 401/403/500 durumunda `data.success` false geliyor, toast çıkmıyor ve kullanıcıya boş durum gösteriliyor. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:71-77` | Tam sayfa spinner var. Skeleton yok, `aria-busy`/`aria-live` yok. |
| 4 | Hata durumu | EKSİK | `page.tsx:31-33` | Yalnızca ağ istisnasında toast çıkıyor. Kalıcı bir hata kartı ya da "Tekrar dene" yok. HTTP hatasında hiçbir mesaj görünmüyor. |
| 5 | Boş durum kartı | KISMİ | `page.tsx:144-149` | Ekleme CTA'sı yok. Hata durumunda da yanlışlıkla bu kart görünüyor (bkz. #2). |
| 6 | Başlık ve açıklama | ÇALIŞIYOR | `page.tsx:82-85` | Diğer admin sayfalarının kullandığı `PageHeader` bileşeni kullanılmamış. |
| 7 | "Yeni Üslup Ekle" butonu ve dialog | KISMİ | `page.tsx:87-98` | Önceden bir kayıt düzenlendiyse dialog, ekleme yerine düzenleme modunda açılıyor (Bulgu B1). |
| 8 | Dialog başlığı ve açıklaması (ekle/düzenle) | KISMİ | `page.tsx:100-104` | Kapanış animasyonu sırasında `editingTone` sıfırlandığı için başlık "Yeni Üslup Ekle"ye dönerek titriyor (`page.tsx:89-92`). |
| 9 | "Görünen Ad" alanı | ÇALIŞIYOR | `page.tsx:107-110` | Uzunluk sınırı yok. |
| 10 | "Slug (Sistem Anahtarı)" alanı | KISMİ | `page.tsx:111-114` | Biçim doğrulaması (a-z, -) yok. Benzersizlik hatası genel bir mesaja düşüyor. Düzenleme sırasında da serbestçe değiştirilebiliyor (Bulgu B3). |
| 11 | "Sistem Promptu" textarea | KISMİ | `page.tsx:116-125` | Uzunluk sınırı, karakter/token sayacı, değişken desteği ve önizleme yok. |
| 12 | Prompt ipucu metni | SAHTE (yanıltıcı) | `page.tsx:126-128` ve `lib/ai-engine.ts:1175-1178` | "müşteri ismini kullan" öneriliyor ama modele müşteri adı hiç gönderilmiyor. Model yalnızca puanı ve yorum metnini alıyor. |
| 13 | Kaydet: yeni kayıt (POST) | KISMİ | `page.tsx:38-69`, `route.ts:22-38` | Sunucu tarafında doğrulama yok. Slug çakışmasında P2002 hatası "Üslup oluşturulamadı" mesajına dönüşüyor. |
| 14 | Kaydet: güncelleme (PATCH) | KISMİ | `route.ts:40-57` | `...data` doğrudan `prisma.aITone.update`'e gidiyor (beyaz liste yok). Audit log yok. |
| 15 | Kaydetme spinner'ı / butonun kilitlenmesi | ÇALIŞIYOR | `page.tsx:132-135` | Çift gönderim engelleniyor. |
| 16 | Başarı/hata toast'ları | ÇALIŞIYOR | `page.tsx:58-66` | |
| 17 | Üslup kartları (ad, slug rozeti, 3 satır prompt önizlemesi) | ÇALIŞIYOR | `page.tsx:151-176` | `isActive` durumu, kullanım sayısı ve `updatedAt` gösterilmiyor. |
| 18 | Düzenle (kalem) ikon butonu | ÇALIŞIYOR | `page.tsx:163-168` | `aria-label` ve tooltip yok. |
| 19 | Silme | EKSİK | `page.tsx:5` (`Trash2` import ediliyor, kullanılmıyor), `route.ts` içinde DELETE yok | |
| 20 | Aktif/pasif anahtarı | EKSİK | `prisma/schema.prisma:561` (`isActive`), `lib/ai-engine.ts:1154` (motor bu alana göre filtreliyor) | Motorun dikkate aldığı alan UI'da hiç yok. |
| 21 | Bayi kural ekranıyla bağlantı | BOZUK | `app/dealer/settings/auto-replies/page.tsx:433-437` | Bayi seçicisi 4 sabit slug'dan (formal/friendly/humorous/professional) oluşuyor. Buradan eklenen her yeni slug ölü veri olarak kalıyor (Bulgu B2). |
| 22 | Yerleşik (fallback) üslupların görünürlüğü | EKSİK | `lib/ai-engine.ts:1157-1170` | Gerçekte çalışan 4 varsayılan prompt kodda duruyor. Seed yok (`aITone` için seed/script bulunamadı), bu yüzden tablo büyük olasılıkla boş ve admin neyin geçerli olduğunu göremiyor. |
| 23 | Test et / canlı önizleme | EKSİK | — | Örnek bir geri bildirime üretilecek yanıtı görme imkânı yok. |
| 24 | Değişiklik geçmişi / sürüm / geri al | EKSİK | `route.ts:48-51` | Prompt'un üzerine yazılıyor. `auditLog` diğer settings uçlarında var (`app/api/admin/settings/points-matrix/route.ts:69`), burada yok. |
| 25 | Kullanım istatistiği (kaç kural/bayi kullanıyor, kaç yanıt üretildi) | EKSİK | — | |
| 26 | Arama / filtre / sıralama | EKSİK | `route.ts:13` | Liste yalnızca `createdAt asc` sıralı. Az kayıt için kabul edilebilir. |
| 27 | Navigasyon / keşfedilebilirlik | KISMİ | `components/dashboard/sidebar.tsx:192` (sidebar'da yalnızca ai-settings var), `app/admin/ai-settings/page.tsx:365` | Tek giriş noktası ai-settings içindeki düz bir `<a>` linki, bu da tam sayfa yeniden yüklemeye yol açıyor. Geri dönüş için breadcrumb yok. |
| 28 | Mobil yerleşim | KISMİ | `page.tsx:80-87,106` | Başlık ve buton yan yana kalıyor (`flex justify-between`, wrap yok). Form `grid-cols-2` sabit. Layout padding'ine ek olarak `p-6` uygulanıyor. |
| 29 | Azaltılmış hareket | ÇALIŞIYOR (nötr) | `page.tsx:4` | `m as Motion` import ediliyor ama hiç kullanılmıyor, sayfada animasyon yok (ölü import). |
| 30 | i18n | KISMİ | `page.tsx` genelinde | Tüm metinler sabit Türkçe. Admin layout'u i18n kullanıyor (`app/admin/layout.tsx:9,13`). |

**Sayım:** ÇALIŞIYOR 10 · KISMİ 12 · BOZUK 1 · SAHTE 1 · EKSİK 6 (toplam 30)

---

## Bulgular

### B1. "Yeni Üslup Ekle", son düzenlenen kaydı ezer (durum sızıntısı)
- **Önem:** yüksek · **Kategori:** hata / veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:87-92` (`editingTone` yalnızca `onOpenChange(false)` içinde sıfırlanıyor), `page.tsx:59-60` (başarılı kayıtta `setIsDialogOpen(false)` doğrudan çağrılıyor), `page.tsx:43,51` (`id: editingTone?.id`, `method = editingTone ? 'PATCH' : 'POST'`).
- **Sorun:** Radix `Dialog`, `onOpenChange`'i yalnızca kullanıcı etkileşiminde çağırır. Programatik `setIsDialogOpen(false)` bu callback'i tetiklemez. Akış şöyle ilerliyor:
  1. Admin bir üslubu düzenleyip kaydeder. `editingTone` dolu kalır.
  2. Admin "Yeni Üslup Ekle"ye basar. `DialogTrigger`, `onOpenChange(true)` çağırır ve `editingTone` temizlenmez.
  3. Dialog "Üslubu Düzenle" başlığıyla ve eski kaydın değerleriyle açılır.
  4. Admin alanları yeni üslup için doldurup kaydeder. İstek `PATCH` olarak eski kaydın `id`'siyle gider ve eski üslubun adı, slug'ı ve promptu sessizce ezilir.

  Slug'ı `friendly` gibi kullanımdaki bir değerden başka bir değere çevirmek, o üslubu kullanan bütün bayi kurallarını fallback prompt'a düşürür (bkz. B3).
- **Öneri:** Ekleme ve düzenleme modunu tek bir durumda tutun: `dialog: { mode: 'create' } | { mode: 'edit', tone } | null`. "Yeni" butonunu `DialogTrigger` yerine `onClick={() => setDialog({ mode: 'create' })}` ile açın. Kayıt sonrası `setDialog(null)` çağırın. Kapanışta titremeyi önlemek için içeriği `mode` değerine göre `key` ile yeniden mount edin ve başlığı kapanış animasyonu bitene kadar sabit tutun. Formu `react-hook-form` + zod ile kontrollü hâle getirin.

### B2. Admin'in eklediği yeni üsluplar bayi tarafında hiç seçilemiyor (ölü veri)
- **Önem:** yüksek · **Kategori:** işlevsellik / entegrasyon · **Efor:** M
- **Kanıt:** `app/dealer/settings/auto-replies/page.tsx:433-437` (sabit `SelectItem` değerleri formal/friendly/humorous/professional), `prisma/schema.prisma:2587` (`tone String? // "formal" | "friendly" | "humorous" | "professional"`), `app/api/dealer/auto-reply-rules/route.ts:21` (`z.string()`, doğrulama yok), `lib/ai-engine.ts:1153-1155`.
- **Sorun:** Sayfa "Yeni Üslup Ekle" diyor ve serbest bir slug istiyor. Ancak bayinin kural formu yalnızca dört sabit slug sunuyor. Bu yüzden `AITone` tablosunda yalnızca bu dört slug'la eşleşen kayıtların bir etkisi oluyor; diğer her kayıt hiçbir yerde kullanılmıyor. Bayi API'si de slug'ın `AITone`'da var olup olmadığını kontrol etmiyor. Ürünün vaadi ("üslup kataloğu yönet") ile gerçek davranış ("4 sabit üslubun promptunu override et") birbirini tutmuyor.
- **Öneri:**
  - Bayi seçicisini `GET /api/dealer/ai-tones` (aktif `AITone` listesi; `slug`, `name`, kısa açıklama, Redis cache'li) ile besleyin. Sabit listeyi kaldırın, i18n anahtarları yalnızca yerleşik slug'lar için fallback olarak kalsın.
  - Bayi kural API'sinde `tone` değerini aktif `AITone` slug'ları ve yerleşik slug'larla doğrulayın.
  - Bir alternatif olarak, ürün kararı "yalnızca 4 sabit üslup" yönündeyse sayfayı "Yerleşik üslupların promptlarını düzenle" ekranına çevirin: ekleme butonunu kaldırın, 4 satır her zaman görünsün, slug salt okunur olsun.

### B3. Slug düzenlenebilir ve kullanım kontrolü yok: kural kırılması sessiz kalıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:113` (düzenleme modunda slug serbest), `route.ts:45-51`, `lib/auto-reply-engine.ts:60-66` (kural `rule.tone` slug'ına string olarak bağlı, FK yok), `lib/ai-engine.ts:1164-1165` (bulunamazsa sessizce `professional` fallback'ine düşülüyor).
- **Sorun:** Slug, bayilerin kurallarıyla tek bağlantı noktası ve bir foreign key değil. Admin slug'ı değiştirdiğinde ya da (ileride) sildiğinde, o slug'ı kullanan kurallar hata vermeden genel bir fallback prompt'a düşüyor. Ne admin ne de bayi bunu fark ediyor.
- **Öneri:** Slug'ı oluşturulduktan sonra salt okunur yapın (gösterin, kopyalanabilir olsun, değiştirilemesin). Silme yerine `isActive=false` (arşivleme) kullanın. Arşivlemeden önce "Bu üslubu N bayinin M kuralı kullanıyor" uyarısı gösterin (`prisma.autoReplyRule.groupBy({ by: ['tone'] })`). Uzun vadede `AutoReplyRule.toneId` ile gerçek bir ilişki kurulmalı.

### B4. API'de doğrulama ve alan beyaz listesi yok, hata mesajları bilgi vermiyor
- **Önem:** orta · **Kategori:** güvenlik / mimari · **Efor:** S
- **Kanıt:** `route.ts:27-32` (POST alanları doğrudan `create`'e gidiyor), `route.ts:45-51` (`const { id, ...data } = body;` → `update({ data })`), `route.ts:35-37,54-56` (her hata için 500 ve genel mesaj).
- **Sorun:** Uç yalnızca ADMIN'e açık olduğu için IDOR riski yok. Yine de:
  - PATCH istemciden gelen her alanı (`isActive`, `createdAt` vb.) Prisma'ya iletiyor.
  - Boş veya çok uzun prompt, geçersiz slug (`"Samimi Ton!"`) kabul ediliyor.
  - Slug çakışması (P2002) ve olmayan id (P2025) 500 olarak dönüyor ve istemci "İşlem başarısız" benzeri belirsiz bir mesaj gösteriyor.
  - Proje genelinde kullanılan zod deseni (`lib/validations-admin.ts`) burada yok.
- **Öneri:** `toneCreateSchema` ve `toneUpdateSchema` tanımlayın: `slug` için `/^[a-z0-9-]{2,40}$/`, `name` için 2–60 karakter, `systemPrompt` için 20–4000 karakter, `isActive` boolean. Update'te slug kabul edilmesin. P2002'yi 409 "Bu slug zaten kullanılıyor", P2025'i 404 olarak döndürün. Uçları REST'e uygun hâle getirin (`PATCH /ai-tones/[id]`, `DELETE /ai-tones/[id]`).

### B5. Değişiklikler audit log'a yazılmıyor, geçmiş ve geri alma yok
- **Önem:** orta · **Kategori:** gözlemlenebilirlik / yönetişim · **Efor:** M
- **Kanıt:** `route.ts` içinde `auditLog` yok. Kardeş uçlarda var: `app/api/admin/settings/points-matrix/route.ts:5,38,69`.
- **Sorun:** Sistem promptu, tüm bayilerin müşterilere otomatik giden yanıtlarının tonunu belirliyor ve markayı doğrudan etkiliyor. Kimin neyi ne zaman değiştirdiği bilinmiyor, kötü bir prompt'tan önceki sürüme dönülemiyor.
- **Öneri:** Her POST/PATCH'te `auditLog` kaydı yazın (`getAuditRequestMeta` ile, önceki ve sonraki prompt'un diff'i dahil). İsteğe bağlı olarak `AIToneVersion` tablosu ekleyin (toneId, systemPrompt, authorId, createdAt). UI'da "Geçmiş" çekmecesi sürümleri diff görünümüyle listelesin ve "Bu sürüme dön" aksiyonu sunsun.

### B6. Hata durumu boş durum olarak gösteriliyor
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:28-30` (`res.ok` kontrolü yok, `success` false olduğunda hiçbir şey yapılmıyor), `page.tsx:143-149`.
- **Sorun:** Oturum süresi dolduğunda (401), token-replay ihlalinde (403, `lib/api-auth.ts:70-76`) ya da DB hatasında (500) ekran "Kayıtlı üslup bulunamadı" diyor. Admin varsayılanların kaybolduğunu düşünüp yeniden kayıt oluşturmaya kalkabiliyor.
- **Öneri:** Üç ayrı durum tanımlayın: `status: 'loading' | 'error' | 'ready'`. Hata durumunda mesajı ve "Tekrar dene" butonunu gösterin, 401/403 için oturum yenileme yönlendirmesi yapın. Veri katmanını SWR/React Query'ye taşımak yeniden doğrulamayı da çözer.

### B7. İpucu metni, sistemde olmayan bir yetenek vaat ediyor
- **Önem:** orta · **Kategori:** içerik / SAHTE · **Efor:** S
- **Kanıt:** `page.tsx:126-128` ("müşteri ismini kullan"), `lib/ai-engine.ts:1175-1178` (user mesajında yalnızca `rating` ve `feedbackText` var). `dealerId` parametresi alınıyor ama kullanılmıyor (`lib/ai-engine.ts:1145`).
- **Sorun:** Admin bu ipucuna uyduğunda model ya isim uyduruyor (halüsinasyon) ya da "Sayın [isim]" gibi doldurulmamış bir şablon üretiyor.
- **Öneri:** Açıkça belgelenmiş prompt değişkenleri ekleyin: `{{isletme_adi}}`, `{{musteri_adi}}` (yalnızca giriş yapmış kullanıcı için), `{{puan}}`, `{{dil}}`. Bunları `generateAutoReply` içinde güvenli biçimde doldurun ve editörde tıklanabilir chip'ler olarak sunun. Değişken desteği gelene kadar ipucunu düzeltin.

### B8. Yerleşik (fallback) üsluplar görünmüyor; admin hangi slug'ların geçerli olduğunu bilmiyor
- **Önem:** orta · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** `lib/ai-engine.ts:1157-1170`. `aITone` için seed/script bulunamadı (repo genelinde grep yapıldı).
- **Sorun:** Tablo boşken 4 üslup kodda tanımlı prompt'larla çalışıyor ama sayfa "Henüz bir AI üslubu tanımlanmamış" diyor. Override etmek için doğru slug'ı (`friendly` vb.) tahmin etmek gerekiyor.
- **Öneri:** API'de yerleşik üslupları DB kayıtlarıyla birleştirip döndürün (`source: 'builtin' | 'override' | 'custom'`). Yerleşik kartlarda "Varsayılan, özelleştir" aksiyonu olsun; özelleştirildiğinde "Varsayılana dön" çıksın. Fallback metinlerini tek bir `lib/ai-tones.ts` sabitine taşıyın.

### B9. Erişilebilirlik ve mobil eksikleri
- **Önem:** düşük · **Kategori:** a11y / mobil · **Efor:** S
- **Kanıt:**
  - `page.tsx:163-168`: ikon butonda `aria-label` yok.
  - `page.tsx:106`: `grid grid-cols-2`, kırılım yok.
  - `page.tsx:81`: başlık satırı wrap etmiyor.
  - `page.tsx:80`: `p-6`, layout padding'ine (`app/admin/layout.tsx:33,38`) ek olarak uygulanıyor.
  - `page.tsx:126,159`: `text-[10px]`.
  - `page.tsx:73`: spinner'da `role="status"` yok.
- **Öneri:** Düzenle butonuna `aria-label={`${tone.name} üslubunu düzenle`}` ve tooltip ekleyin. Formu `grid-cols-1 sm:grid-cols-2` yapın. Başlık için standart `PageHeader` bileşenini kullanın (actions slot'u mobilde alta iner). Minimum metin boyutu 12px olsun. Yükleniyor durumunu skeleton kartlar ve `aria-busy` ile verin.

### B10. Ölü kod ve tip kaçakları
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:**
  - `page.tsx:4`: `Motion` kullanılmıyor.
  - `page.tsx:5`: `Save`, `Trash2`, `AlertCircle` kullanılmıyor.
  - `page.tsx:7`: `CardDescription` kullanılmıyor.
  - `page.tsx:17,19`: `useState<any[]>`, `useState<any>`.
  - `page.tsx:22-24`: `fetchTones` effect bağımlılığı dışında.
  - `app/admin/ai-settings/page.tsx:361`: "şimdilik temel bir yapı kuruyorum" yorumu ve kullanıcıya görünen "Dinamik üslup yönetimi API üzerinden aktiftir" metni (iç geliştirici notu UI'ya sızmış).
- **Öneri:** `AITone` için paylaşılan bir tip tanımlayın (`Pick<AITone, ...>`), kullanılmayan importları temizleyin, ai-settings kartındaki geliştirici metnini kaldırın.

### B11. Tüketici tarafta her otomatik yanıtta cache'siz DB okuması
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `lib/ai-engine.ts:1153-1155` (her çağrıda dinamik `import('@/lib/prisma')` ve `findUnique`).
- **Sorun:** Geri bildirim hacmi yüksek bayilerde gereksiz bir DB turu oluşuyor. Proje zaten Upstash cache deseni kullanıyor.
- **Öneri:** `ai-tone:{slug}` anahtarını Redis'te 10 dakika TTL ile cache'leyin. Admin POST/PATCH sonrası ilgili anahtarı silin. Böylece prompt değişiklikleri anında yansır ve okuma maliyeti sıfıra yaklaşır.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog, OpenAI Playground / Anthropic Console prompt yönetimi)

1. **Prompt test alanı (playground):** Örnek geri bildirim seçimi (puan 1–5, gerçek son geri bildirimlerden örnek) ve "Önizle" ile anlık üretilen yanıt. Yan yana iki üslup karşılaştırması.
2. **Sürümleme ve geri alma:** Yayınlanmış ve taslak sürümler, diff, "önceki sürüme dön" (PostHog feature-flag geçmişi ve Stripe audit trail benzeri).
3. **Kullanım ve etki metrikleri:** Üslubu kullanan kural/bayi sayısı, son 30 günde üretilen yanıt sayısı, AI başarısızlık/fallback oranı, yanıt sonrası müşteri tepkisi.
4. **Yaşam döngüsü:** Aktif/pasif (arşivleme), güvenli silme (kullanımdaysa engelle), yerleşik üslup için "varsayılana dön".
5. **Prompt değişkenleri ve korkuluklar:** `{{isletme_adi}}` gibi değişkenler, maksimum uzunluk, yasaklı ifade listesi, dil ve çıktı uzunluğu (`max_tokens`) ile `temperature` ayarları (şu an sabit 0.7/300, `lib/ai-engine.ts:1181-1182`).
6. **Bayi seviyesi özelleştirme:** Admin'in platform üsluplarını yayınlaması, bayinin kendi marka tonuyla türetebilmesi (`generateAutoReply` zaten `dealerId` alıyor ama kullanmıyor).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "AI Yanıt Üslupları", platformun otomatik müşteri iletişiminin marka sesini yöneten güvenli bir prompt kataloğu olmalı. Admin bir üslubu açtığında hangi bayilerin ve kuralların bunu kullandığını, son üretilen örnek yanıtları ve değişiklik geçmişini tek ekranda görür. Prompt'u düzenlerken sağ panelde gerçek bir geri bildirim üzerinde canlı önizleme alır ve değişikliği taslak olarak kaydedip test ettikten sonra yayınlar.

**Yerleşim (masaüstü, iki panel, Linear tarzı):**
- **Sol liste:** Arama, durum filtresi (Aktif / Arşiv / Yerleşik). Her satırda ad, slug, kaynak rozeti (Yerleşik / Özelleştirilmiş / Özel), kullanım sayısı ve son güncelleme yer alır.
- **Sağ detay:** Üç sekme.
  - *Prompt:* Kontrollü editör, karakter sayacı ve değişken chip'leri.
  - *Önizleme:* Örnek geri bildirim seçici, puan kaydırıcısı, "Yanıt üret" butonu ve yan yana karşılaştırma.
  - *Geçmiş:* Sürüm listesi ve diff.
- **Üst eylem çubuğu:** "Taslağı kaydet", "Yayınla", "Arşivle".
- **Mobil:** Liste tam ekran açılır, satıra dokununca detay alttan bir sheet olarak gelir. Form tek kolon olur.

**Motion/3D:** Bu, işlevsel bir yönetim aracı; 3D yerinde değil. Ölçülü öneriler:
- Liste ve detay geçişinde 150–200 ms'lik `layout` animasyonu.
- Önizleme yanıtı streaming biçimde gelsin. Yazıyor efekti, gerçek token akışını yansıttığı sürece anlamlı olur.
- Kaydetme sonrası satırda kısa bir vurgu animasyonu.
- Bunların tamamı `useReducedMotion` ile kapatılabilir olmalı.

**Veri ve API değişiklikleri:**
- `GET /api/admin/ai-tones`: Yerleşik ve DB kayıtlarını birleştirir. Her satırda `source`, `usageCount` (`autoReplyRule.groupBy`), `updatedAt`, `updatedBy` döner.
- `POST /api/admin/ai-tones`, `PATCH|DELETE /api/admin/ai-tones/[id]`: zod doğrulaması, slug değiştirilemez, P2002 → 409, kullanımdaysa DELETE → 409 (arşivlemeye yönlendirir), her yazımda `auditLog`.
- `POST /api/admin/ai-tones/preview`: `{ systemPrompt, sampleFeedbackId | text, rating }` alır, kaydetmeden yanıt üretir. Rate-limit uygulanır ve AI kullanım log'una yazılır.
- `GET /api/dealer/ai-tones`: Bayi seçicisi için aktif liste (Redis cache'li). Bayi kural API'sinde `tone` doğrulaması.
- Şema:
  - `AITone`'a `description`, `updatedById` alanları.
  - Yeni `AIToneVersion` modeli.
  - Orta vadede `AutoReplyRule.toneId` ilişkisi; mevcut `tone` string'inden migrasyon.
- `lib/ai-engine.ts`: Ton çözümlemesi `lib/ai-tones.ts` içinde tek kaynakta toplanır (yerleşik sabitler, Redis, DB). Değişken doldurma burada yapılır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-settings`** (`app/admin/ai-settings/page.tsx:349-372`): Aynı başlıkla ("AI Yanıt Üslupları") yalnızca bir yönlendirme kartı içeriyor. Kartta geliştirici notu kullanıcıya sızmış ve link düz `<a>` olarak verilmiş. İki ekran aynı kavramı yönetiyor ve bu sayfanın sidebar'da bir girişi yok (`components/dashboard/sidebar.tsx:192`). **Öneri:** Üslup yönetimini `/admin/ai-settings` altında "Yanıt Üslupları" sekmesi olarak birleştirin (veya `/admin/ai-settings/tones` alt rotası yapın). `/admin/modules/ai-tones` yolunu buraya yönlendirin.
- **`/admin/modules`** (Modül Detay Merkezi): Rota hiyerarşisi bu sayfayı onun altına koyuyor ama modules sayfası ai-tones'a bağlantı vermiyor (repo genelinde grep yapıldı, tek referans ai-settings). Rota yerleşimi yanıltıcı; ai-settings altına taşınmalı.
- **`/dealer/settings/auto-replies`:** Bu katalogun tek tüketicisi. Seçici sabit kodlu olduğu için iki ekran fiilen bağlantısız (B2). Birleştirmede kontrat, dinamik bir uç üzerinden kurulmalı.

---

## Doğrulama (şüpheci inceleme)

### 1. Düzenleme sonrası "Yeni Üslup Ekle" akışı yanlış kaydı PATCH ile güncelliyor — **DOĞRULANDI**

- Radix `Dialog` kontrollü modda (`open={isDialogOpen}`) `onOpenChange`'i yalnızca kendi iç tetiklerinde (Trigger tıklaması, Escape, dış tıklama, `DialogPrimitive.Close`) çağırır; prop'un dışarıdan değişmesi geri çağrıyı tetiklemez. `editingTone` yalnızca `onOpenChange(false)` içinde temizleniyor (`app/admin/modules/ai-tones/page.tsx:87-90`).
- Başarılı kayıtta kapatma programatik: `setIsDialogOpen(false)` (`page.tsx:59`). `setEditingTone(null)` hiçbir yerde çağrılmıyor, dolayısıyla `editingTone` eski kayıtla dolu kalıyor.
- `DialogContent` `forceMount` kullanmıyor (`components/ui/dialog.tsx:28-56`), yani form her açılışta yeniden mount ediliyor ve `defaultValue`'lar bayat `editingTone`'dan dolduruluyor (`page.tsx:108, 112, 120`). Başlık "Üslubu Düzenle" (`page.tsx:99`), `method` `PATCH` (`page.tsx:50`), gövdede `id: editingTone.id` (`page.tsx:42`).
- API tarafı `id` dışındaki her alanı körlemesine `update`'e veriyor (`app/api/admin/settings/ai-tones/route.ts:45-51`), yani slug dahil üç alan da ezilir.
- **Yeniden üretim:** (1) "formal" kartında kalem ikonuna bas, promptu değiştir, Kaydet. (2) Dialog kapanır, toast "Üslup güncellendi". (3) Sayfayı yenilemeden "Yeni Üslup Ekle"ye bas: dialog "Üslubu Düzenle" başlığıyla ve formal'ın *kayıt öncesi* değerleriyle açılır. (4) Alanları temizleyip yeni üslup olarak `name=Esprili Plus, slug=witty, prompt=...` yaz, Kaydet. Sonuç: yeni kayıt oluşmaz; `formal` kaydı `witty` olarak yeniden adlandırılır, admin'in az önce kaydettiği formal promptu da kaybolur. Bayi kurallarındaki `tone="formal"` artık DB'de eşleşme bulamaz ve fallback'e düşer (bkz. iddia 2).
- **Hafifletici not:** Başlık ve dolu alanlar dikkatli bir kullanıcıya ipucu verir. Yine de akış kullanıcının açık niyetiyle ("Yeni ekle") çelişen bir yazma yapıyor ve geri alma ya da sürüm geçmişi yok; şiddeti YÜKSEK olarak kabul edilebilir.
- **Düzeltme yaklaşımı:** Kapatmayı tek bir `closeDialog()` yardımcısında topla (`setIsDialogOpen(false); setEditingTone(null)`). "Yeni Üslup Ekle" butonu `DialogTrigger` yerine açıkça `setEditingTone(null); setIsDialogOpen(true)` çağırsın. Form `key={editingTone?.id ?? 'new'}` ile yeniden mount edilsin. Kalıcı çözüm olarak oluşturma ve düzenleme rotaları ayrılmalı (`PATCH /api/admin/ai-tones/[id]`), bu sayede gövdedeki bayat bir `id` yanlış kaydı hedefleyemez.

### 2. Slug değişikliği bayi otomatik yanıt kurallarını sessizce kırıyor — **DOĞRULANDI (şiddet iddia edilenden düşük: ORTA)**

- `AutoReplyRule.tone` ilişkisiz bir `String?` (`prisma/schema.prisma:2587`); `AITone` ile FK yok (`prisma/schema.prisma:556-564`). PATCH, slug değişikliğini doğrulama ve uyarı olmadan kabul ediyor (`route.ts:45-51`). Formda slug alanı düzenlemede de serbest (`page.tsx:112`).
- `generateAutoReply` `findUnique({ where: { slug, isActive: true } })` ile arıyor. Bulamazsa hata vermeden sabit fallback prompt'u kullanıyor (`lib/ai-engine.ts:1153-1172`); `lib/auto-reply-engine.ts:60-73` bu yanıtı doğrudan `feedback.dealerReply` olarak yazıyor. Log ya da uyarı yok.
- **Yeniden üretim:** Admin `friendly` kaydının slug'ını `samimi` yapar. Bundan sonra `tone="friendly"` olan tüm bayi kuralları, admin'in yazdığı özel promptu değil `fallbackToneMap.friendly` ile kurulan genel prompt'u kullanır. Ne admin ne bayi bunu görür.
- **İddiadaki abartı:** Bayi seçicisi dört slug'ı sabit kodluyor (`app/dealer/settings/auto-replies/page.tsx:433-437`) ve fallback haritası bu dört slug'ı aynı ton kategorisiyle karşılıyor (`lib/ai-engine.ts:1157-1162`). Bu yüzden "ton tamamen değişir" demek doğru değil. Kaybolan şey, admin'in özelleştirdiği prompt (uzunluk ve üslup kuralları, isim kullanımı vb.); ton ailesi korunuyor. Ayrıca yeni slug bayi tarafından hiç seçilemiyor, bu da ölü bir kayıt yaratıyor.
- **Düzeltme yaklaşımı:** Kısa vadede PATCH'te slug alanını reddet (değiştirilemez anahtar) ya da `autoReplyRule.count({ where: { tone: eskiSlug } }) > 0` ise 409 dön ve "N kural etkilenir" uyarısı göster. Fallback'e düşüldüğünde `console.warn` veya AI kullanım log'una `toneResolved: 'fallback'` yazılsın. Orta vadede `AutoReplyRule.toneId` FK ilişkisine geçilmeli ve bayi seçicisi `GET /api/dealer/ai-tones` üzerinden dinamik beslenmeli.
