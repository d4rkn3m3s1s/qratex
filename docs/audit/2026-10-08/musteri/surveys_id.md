# /surveys/[id]

**Amaç:** Bayinin (işletmenin) `/dealer/surveys` panelinde oluşturup bağlantısını kopyaladığı anketin, son kullanıcı tarafından doldurulduğu herkese açık sayfa. Oturum açmış müşterinin yanıtı hesabına bağlanıyor, oturum yoksa yanıt anonim kaydediliyor. Sayfa `/customer` kabuğunun dışında, kendi başına duran bir form.

**Genel puan:** 4.5 / 10 · **Karar:** **yeniden tasarla.** Temel akış (getir, doldur, gönder, teşekkür) çalışıyor ve kimlik sahteciliği daha önce kapatılmış. Buna karşılık üç ciddi sorun var. Sunucu gelen cevapları içerik açısından hiç doğrulamıyor, bu yüzden bayinin analitiği anonim olarak kirletilebiliyor. Seçeneksiz bir seçim sorusu anketi tamamen gönderilemez hâle getiriyor. Aynı kişi sınırsız sayıda yanıt verebiliyor. Deneyim tarafında da sayfa, oyunlaştırılmış bir sadakat ürününün içinde "düz bir Google Form" gibi duruyor: marka, ilerleme, ödül ve dönüş yolu yok.

Kapsam: `app/surveys/[id]/page.tsx` (211 satır, tek dosya, `'use client'`). `app/surveys/` altında `layout.tsx`, `loading.tsx`, `error.tsx` veya metadata dosyası yok. Bağlı API: `GET` ve `POST /api/surveys/[id]/fill` (`app/api/surveys/[id]/fill/route.ts`). Prisma modelleri: `Survey`, `SurveyQuestion`, `SurveyResponse` (`prisma/schema.prisma:2598-2635`). Çapraz etkiler için şunlar da okundu: `app/api/dealer/surveys/route.ts` (oluşturma şeması), `app/api/dealer/surveys/[id]/route.ts`, `app/api/dealer/surveys/[id]/results/route.ts` (sonuç toplama), `app/dealer/surveys/page.tsx`, `app/dealer/surveys/create/page.tsx`, `components/providers.tsx` (QueryClient, MotionConfig), `components/layout/page-transition.tsx`, `components/ui/inline-loading-status.tsx`, `lib/rate-limit.ts`, `lib/module-controls.ts`, `proxy.ts` (matcher), `messages/tr.json` ve `messages/en.json` (`surveyFill`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Mutlu yol çalışıyor. Ama sunucu tarafında cevap doğrulaması yok, tekrar yanıt engeli yok ve seçeneksiz soru anketi kilitliyor. |
| UX | 4/10 | Bütün sorular tek uzun listede. İlerleme, taslak, satır içi hata ve teşekkürden sonra yapılacak bir şey yok. QR'dan gelen mobil kullanıcı için sürtünmesi yüksek. |
| Görsel | 4/10 | Genel bir `ClipboardList` ikonu ve düz shadcn kartlar var. API'nin döndürdüğü işletme logosu kullanılmıyor, marka kimliği hissedilmiyor. |
| Mimari | 4/10 | Tamamen istemci tarafında fetch yapılıyor. Sunucu şeması tip/seçenek/aralık bilmiyor. Hata mesajları sunucuda Türkçe sabit kodlu. Modül kapatma sunucuda uygulanmıyor. |
| Performans | 7/10 | Sayfa küçük ve tek istek atıyor. Yine de hidrasyon → fetch şelalesi var. Sorgu anahtarındaki `locale` gereksiz yeniden istek üretiyor. |
| Erişilebilirlik + mobil | 4/10 | Radyo düğmeleri yerel öğe olduğu için klavyeyle çalışıyor. Yıldız puanlamanın erişilebilir adı yok, gruplarda `fieldset/legend` yok, zorunluluk ekran okuyucuya bildirilmiyor, dokunma hedefleri 44 px'in altında. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | URL'den anket kimliği okuma | ÇALIŞIYOR | `page.tsx:36` | `useParams<{ id: string }>()`. Rota `proxy.ts:124` matcher'ında yok, yani herkese açık. Bu bilinçli bir tercih. |
| 2 | Anketi getirme (`GET /api/surveys/[id]/fill`) | ÇALIŞIYOR | `page.tsx:43-51`, `route.ts:18-46` | Yalnızca `isActive: true` anketler dönüyor. Sorular `order` alanına göre sıralanıyor. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:99`, `inline-loading-status.tsx` | `role="status"` ve `aria-live` var. İskelet (skeleton) yok, sadece spinner gösteriliyor. |
| 4 | Hata / bulunamadı durumu | KISMİ | `page.tsx:100-105` | 404, 500 ve ağ hatası aynı "Anket bulunamadı" metnine düşüyor. "Tekrar dene" düğmesi yok. `providers.tsx:211` `retry: 1` olduğu için 404'te bir kez daha boşuna deneniyor. |
| 5 | Başlık bloğu (ikon + anket başlığı) | ÇALIŞIYOR | `page.tsx:124-126` | İkon herkes için aynı `ClipboardList`. |
| 6 | Anket açıklaması | ÇALIŞIYOR | `page.tsx:127` | |
| 7 | İşletme adı | ÇALIŞIYOR | `page.tsx:128` | Açıklamanın altında soluk küçük metin olarak duruyor. Hiyerarşi ters. |
| 8 | İşletme logosu | EKSİK | `route.ts:37`, `page.tsx:31` | API `logo` döndürüyor ve arayüz tipinde tanımlı. Ama hiçbir yerde render edilmiyor. |
| 9 | Soru numaralandırma | ÇALIŞIYOR | `page.tsx:137` | Toplam soru sayısı ("3 / 8") yok. |
| 10 | Zorunlu soru işareti (`*`) | KISMİ | `page.tsx:141` | Yalnızca kırmızı yıldız var. `aria-required` ve "zorunlu" sr-only metni yok. Kırmızı `*` anlamının açıklaması sayfada yok. |
| 11 | Tek seçim (radio) | KISMİ | `page.tsx:146-163` | Yerel `input[type=radio]` + `name` ile klavye gruplaması doğru. Ama `fieldset/legend` yok. `key={opt}` ve `id={q.id-opt}` yinelenen seçenekte çakışıyor (oluşturma şeması tekilliği kontrol etmiyor: `api/dealer/surveys/route.ts:13`). |
| 12 | Çoklu seçim (checkbox) | ÇALIŞIYOR | `page.tsx:165-178`, `57-65` | Aynı `key`/`id` çakışma riski burada da var. Seçim sınırı (en az/en çok) desteklenmiyor. |
| 13 | Açık metin (Textarea) | KISMİ | `page.tsx:180-187` | `maxLength` ve karakter sayacı yok. Sunucuda da uzunluk sınırı yok (bkz. B1). |
| 14 | Yıldız puanlama (1-5) | KISMİ | `page.tsx:189-196` | Düğmelerin `aria-label`, `aria-pressed` veya `radiogroup` anlamı yok. Hover önizlemesi yok, uçlarda etiket ("Hiç memnun değilim / Çok memnunum") yok. Hedef boyutu yaklaşık 36 px. |
| 15 | Seçeneksiz seçim sorusu | BOZUK | `app/dealer/surveys/create/page.tsx:106-107`, `api/dealer/surveys/route.ts:13`, `page.tsx:146,165` | Bayi seçenekleri boş bırakırsa `[]` kaydediliyor. Sayfa soruyu metniyle gösteriyor ama girdi çıkarmıyor. Soru zorunluysa anket hiçbir zaman gönderilemiyor (bkz. B2). |
| 16 | İstemci tarafı zorunlu soru kontrolü | KISMİ | `page.tsx:71-77` | Sadece boşluktan oluşan metin (`"   "`) geçiyor. Hata sadece toast ile veriliyor. Eksik soru vurgulanmıyor, sayfa oraya kaymıyor. |
| 17 | Yanıt gönderme (`POST`) | ÇALIŞIYOR | `page.tsx:79-91`, `route.ts:64-116` | |
| 18 | Gönderiliyor durumu | ÇALIŞIYOR | `page.tsx:204-205` | Düğme devre dışı kalıyor ve spinner gösteriyor. Etiket "Gönder" olarak kalıyor ("Gönderiliyor…" olmuyor). |
| 19 | Gönderim hatası toast'ı | KISMİ | `page.tsx:89-94` | Sunucunun Türkçe sabit mesajı (`route.ts:76,97,105,119`) İngilizce arayüzde aynen gösteriliyor. JSON olmayan yanıtta (504 HTML sayfası gibi) `r.json()` patlıyor ve kullanıcı "Unexpected token <" görüyor. |
| 20 | Teşekkür ekranı | KISMİ | `page.tsx:109-119` | Yaylı onay ikonu var. Ama çıkmaz sokak: CTA, ödül, işletmeye dönüş ya da kayıt daveti yok. Sayfa yenilenince durum kayboluyor ve form yeniden açılıyor. |
| 21 | Sunucu tarafı zorunlu soru kontrolü | KISMİ | `route.ts:101-106` | Yalnızca `questionId`'nin var olup olmadığına bakıyor. `""`, `[]` veya boşluktan oluşan değer "yanıtlandı" sayılıyor. |
| 22 | Sunucu tarafı cevap içeriği doğrulaması | BOZUK | `route.ts:53-56`, `108-114`; `results/route.ts:44-57` | Cevabın ankete ait olup olmadığı, soru tipi, seçeneğin listede olup olmadığı ve puan aralığı kontrol edilmiyor. Ne gelirse olduğu gibi kaydediliyor ve bayi sonuçlarına karışıyor (bkz. B1). |
| 23 | Hız sınırı (IP + anket) | ÇALIŞIYOR | `route.ts:72-79`, `lib/rate-limit.ts:96-102` | 10 istek / dakika. IP okunamazsa herkes ortak `unknown` kovasına düşüyor (küçük risk). |
| 24 | Kimliğin yalnızca oturumdan alınması | ÇALIŞIYOR | `route.ts:60`, `87-89` | İstemciden gelen `userId` artık kabul edilmiyor. Doğru bir düzeltme. |
| 25 | Tekrar yanıt engeli | EKSİK | `route.ts:108-114`, `schema.prisma:2626-2635` | `(surveyId, userId)` üzerinde tekillik yok. Oturumlu kullanıcı bile aynı anketi defalarca yanıtlayabiliyor (bkz. B3). |
| 26 | Puan/XP/rozet ödülü | EKSİK | `route.ts` tamamı | Anket doldurmak hiçbir oyunlaştırma çıktısı üretmiyor. Müşteri panelinin geri kalanıyla tutarsız. |
| 27 | Taslak saklama | EKSİK | `page.tsx:39` | Cevaplar yalnızca bellekte tutuluyor. Yanlışlıkla yenileme veya geri tuşu her şeyi siliyor. |
| 28 | İlerleme göstergesi / tahmini süre | EKSİK | `page.tsx:122-208` | |
| 29 | Giriş animasyonları (başlık, soru kademesi, onay) | ÇALIŞIYOR | `page.tsx:112`, `124`, `133` | Azaltılmış hareket tercihi global `MotionConfig reducedMotion="user"` ile karşılanıyor (`providers.tsx:232`). 20 soruda kademe 1.1 saniyeye uzuyor, kabul edilebilir. |
| 30 | Çok dillilik (TR/EN) | KISMİ | `messages/tr.json:1955-1965`, `messages/en.json:1955-1965` | Arayüz metinleri iki dilde var. Sunucu hataları ve zod mesajları (`route.ts:84`, İngilizce) tek dilde kalıyor. |
| 31 | Sayfa metadata / paylaşım önizlemesi (OG) | EKSİK | `app/surveys/` (layout yok) | Bağlantı WhatsApp/Instagram'da paylaşılınca anket başlığı ya da işletme görünmüyor, varsayılan site başlığı çıkıyor. |
| 32 | Marka başlığı / gezinme | EKSİK | `app/layout.tsx:162-167`, `page-transition.tsx` | Kök layout sadece sağlayıcıları sarıyor. Sayfada Qratex logosu, işletme kimliği ya da panele dönüş yolu yok. |
| 33 | Modül kapatmanın uygulanması | EKSİK | `lib/module-controls.ts:45`, `components/dashboard/sidebar.tsx:259` | `dealer_surveys` modülü kapatılınca yalnızca kenar çubuğu gizleniyor. `fill/route.ts` modül kontrolü yapmıyor, açık anket bağlantıları çalışmaya devam ediyor. |
| 34 | Gizlilik bildirimi / anonim seçeneği | EKSİK | `route.ts:87-89` | Oturumlu kullanıcının yanıtı sessizce hesabına bağlanıyor. Bunu bildiren ya da anonim gönderme seçeneği sunan bir metin yok. |

---

## Bulgular

### B1. Sunucu cevap içeriğini doğrulamıyor, bayi analitiği anonim olarak kirletilebiliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik · **Efor:** M
- **Kanıt:** `app/api/surveys/[id]/fill/route.ts:53-56` (`questionId: z.string()`, `value: string | string[] | number`, uzunluk/aralık yok), `:108-114` (`answers` olduğu gibi yazılıyor); `app/api/dealer/surveys/[id]/results/route.ts:44-50` (`optionCounts[v] = (optionCounts[v] || 0) + 1` listede olmayan seçenek için de anahtar açıyor), `:54-56` (`Number(value)` ile aralık dışı puan ortalamaya giriyor).
- **Sorun:** Oturum gerektirmeyen bu uca biri doğrudan `{"questionId":"<rating sorusu>","value":1000000}` gönderebilir. Bayinin ortalama puanı anlamsızlaşır. Tek seçimli soruya `"<script>…"` ya da hakaret içeren rastgele bir "seçenek" gönderilirse bu, bayi sonuç ekranında yeni bir seçenek çubuğu olarak görünür. Ankete ait olmayan `questionId`'ler, 100 adede kadar giriş ve sınırsız uzunlukta metin de kabul ediliyor. 10 istek/dakika/IP sınırı IP değiştirerek kolayca aşılır. Sonuç olarak bayinin karar verdiği veri güvenilmez hâle geliyor.
- **Öneri:** Doğrulamayı ankete özel hâle getirin. Anket ve sorular yüklendikten sonra soru tipine göre dinamik bir zod şeması kurun: `single_choice` için `z.enum(options)`, `multiple_choice` için `z.array(z.enum(options)).min(1).max(options.length)` ve tekilleştirme, `rating` için `z.number().int().min(1).max(5)`, `open_text` için `z.string().trim().min(1).max(2000)`. Bilinmeyen `questionId`'leri reddedin, aynı soruya yinelenen cevabı reddedin. Bu doğrulamayı `lib/surveys/validate-answers.ts` gibi tek bir yerde tutun ki istemci de aynı kuralları gösterebilsin. Sonuç ucunda da savunmacı davranın: yalnızca tanımlı seçenekleri sayın, aralık dışı puanları atın. Mevcut kirli kayıtlar için tek seferlik bir temizlik betiği gerekir (canlı veride çalıştırmadan önce yedek alınmalı).

### B2. Seçeneksiz seçim sorusu anketi kalıcı olarak gönderilemez yapıyor
- **Önem:** yüksek · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** `app/dealer/surveys/create/page.tsx:106-107` (boş seçenekler filtrelenip `[]` gönderiliyor), `app/api/dealer/surveys/route.ts:13` (`options` opsiyonel, `min` yok), `app/surveys/[id]/page.tsx:146,165` (`q.options` boş dizi olduğunda girdi render edilmiyor), `:71-77` (zorunlu kontrol yine de takılıyor).
- **Sorun:** Bayi tek veya çoklu seçimli bir soruda seçenekleri boş bırakırsa kayıt başarılı oluyor. Müşteri tarafında soru metni görünüyor ama işaretlenecek bir şey yok. Soru varsayılan olarak zorunlu (`required: true`) olduğu için her gönderim "Lütfen zorunlu soruları yanıtlayın" hatasıyla bitiyor. Müşteri sessizce kaybediliyor, bayi de neden hiç yanıt gelmediğini bilmiyor.
- **Öneri:** Oluşturma şemasında `superRefine` kullanın: seçim tiplerinde `options` en az 2 tekil öğe içermeli, diğer tiplerde boş olmalı. Oluşturma arayüzü bunu satır içinde göstermeli. Doldurma sayfası da savunmacı olmalı: girdisi olmayan soruyu "yanıtlanamaz" olarak işaretleyip zorunlu kontrolünden çıkarmalı ve bunu izleme/log'a bildirmeli. Mevcut kayıtlar için `options = []` olan seçim sorularını bulup bayiye uyarı gösteren bir kontrol eklenebilir.

### B3. Tekrar yanıt engeli yok, sonuçlar şişirilebiliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:108-114` (koşulsuz `create`), `schema.prisma:2626-2635` (`@@unique` yok, sadece `@@index([surveyId])`), `page.tsx:40,109` (gönderildi bilgisi yalnızca bellekte, yenilemede sıfırlanıyor).
- **Sorun:** Oturum açmış bir müşteri bile aynı anketi defalarca doldurabiliyor. Anonim kullanıcı için tek engel dakikada 10 istek. Yanıt sayısı ve dağılımlar gerçek müşteri sayısını yansıtmıyor. İleride ankete ödül bağlanırsa (bkz. B6) bu doğrudan puan basma açığına dönüşür.
- **Öneri:** Oturumlu yanıtlar için `@@unique([surveyId, userId])` ekleyin (`userId` null olduğunda Postgres tekilliği uygulamaz, anonim akış bozulmaz). `create` yerine benzersizlik ihlalini yakalayıp 409 + "Bu anketi zaten yanıtladınız" döndürün. Anonim yanıtlar için imzalı, HttpOnly bir `survey_done_<id>` çerezi ve (IP + UA) parmak izi ile yumuşak bir engel koyun. Anket bazında "yanıt başına bir kişi / sınırsız" seçeneğini bayiye bırakın. Sayfa açılırken GET ucu `alreadyResponded` döndürsün, böylece kullanıcı formu doldurmadan önce durumu görür.

### B4. Hata durumları ayrışmıyor, istemcinin hata işleme yolu kırılgan
- **Önem:** orta · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:100-105` (her hata "bulunamadı" oluyor), `:47-48` ve `:89` (`r.json()` JSON olmayan yanıtta `SyntaxError` atıyor), `:93` (ham `e.message` toast'ta gösteriliyor), `route.ts:76,97,105,119` (Türkçe sabit mesajlar), `:84` (zod'un İngilizce mesajı).
- **Sorun:** Geçici bir 500 ya da ağ kesintisinde kullanıcıya "Anket bulunamadı veya aktif değil" deniyor ve kullanıcı bağlantıyı kapatıyor. Vercel zaman aşımında HTML döner, `r.json()` patlar ve kullanıcı teknik bir hata metni görür. İngilizce arayüzde Türkçe hata ve Türkçe arayüzde İngilizce zod mesajı çıkabiliyor.
- **Öneri:** API hata gövdesini `{ code: 'SURVEY_NOT_FOUND' | 'SURVEY_INACTIVE' | 'RATE_LIMITED' | 'ALREADY_RESPONDED' | 'VALIDATION', fieldErrors?: Record<questionId, code> }` biçimine çevirin. İstemci `code` alanını `surveyFill.errors.*` anahtarlarıyla çevirsin. Yanıtı `r.headers.get('content-type')` ile kontrol eden ortak bir `fetchJson` yardımcı fonksiyonu kullanın (projede başka sayfalarda da aynı desen var). Bulunamadı, kapalı ve geçici hata durumları için üç ayrı ekran tasarlayın, geçici hata ekranında `refetch` düğmesi olsun. 404 için `retry: false` verin.

### B5. Erişilebilirlik: puanlama, gruplar ve zorunluluk ekran okuyucuya kapalı
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:191-195` (yıldız düğmelerinde `aria-label` yok, sadece ikon var), `:139-142` (soru metni `<p>`, grupla ilişkisi yok), `:141` (`*` görsel), `:72-77` (hata sadece toast), `:193` (`text-muted-foreground/30` boş yıldız, düşük kontrast).
- **Sorun:** Ekran okuyucu puanlama sorusunda beş kez etiketsiz "düğme" okuyor ve seçili değeri bildirmiyor. Seçenek grupları soru metniyle ilişkili olmadığı için bağlam kayboluyor. Zorunluluk ve doğrulama hatası yardımcı teknolojiye ulaşmıyor. Boş yıldızlar açık temada WCAG 1.4.11 (3:1 grafik kontrastı) eşiğinin altında kalıyor. Mobilde yıldız hedefleri yaklaşık 36 px, 44 px önerisinin altında.
- **Öneri:** Her soruyu `fieldset` + `legend` (soru metni) ile sarın. Puanlamayı `role="radiogroup"` içinde `role="radio"` + `aria-checked` + `aria-label="5 üzerinden 3"` olarak yeniden yazın ve ok tuşlarıyla gezinmeyi ekleyin (shadcn `RadioGroup` üzerine özel bir `RatingInput` bileşeni). `aria-required` ve `aria-invalid` + `aria-describedby` ile satır içi hata mesajı verin. Gönderimde ilk hatalı soruya `scrollIntoView` + `focus` yapın. Hedefleri `min-h-11 min-w-11` yapın.

### B6. Anket oyunlaştırma ekonomisinden kopuk: ödül, dönüş yolu, bağlam yok
- **Önem:** orta · **Kategori:** ürün / UX · **Efor:** L
- **Kanıt:** `route.ts:108-116` (yanıt sonrası hiçbir yan etki yok), `page.tsx:109-119` (teşekkür ekranında CTA yok), `app/layout.tsx:162-167` (marka kabuğu yok); keşfedilebilirlik için: `grep` sonucu anket bağlantısı müşteri tarafında hiçbir yerde listelenmiyor, tek giriş yolu bayinin kopyaladığı bağlantı (`app/dealer/surveys/page.tsx:59`).
- **Sorun:** Qratex'in müşteri vaadi "geri bildirim ver, puan/XP/rozet kazan". Anket ise bu döngünün dışında kalan tek geri bildirim kanalı: emek isteyen (5-20 soru) ama karşılığında hiçbir şey vermeyen bir form. Oturumu olmayan kullanıcıya "giriş yap, bu yanıt için X puan kazan" bile denmiyor, yani bir kazanım hunisi de boşa gidiyor. Teşekkür ekranı kullanıcıyı ürünün içine geri çekmiyor.
- **Öneri:** Ankete isteğe bağlı bir ödül alanı (`rewardPoints`) ekleyin. Bayi bunu kendi puan bütçesinden ayırsın (mevcut emanet/escrow, net-sıfır ilkesiyle). Ödül yalnızca oturumlu ve ilk geçerli yanıtta, `SurveyResponse` oluşturma ile aynı transaction içinde ve tek seferlik kredi olarak verilsin (B3'teki benzersizlik buna ön koşul). `points_credited` alanı ile sahtecilik görünürlüğü sağlansın. Teşekkür ekranı üç duruma göre şekillensin: (a) oturumlu ve ödül kazanıldı: puan sayacı animasyonu, XP çubuğu, "işletme sayfasına dön" ve "panelime git"; (b) oturumsuz: "Hesap açarsan bu yanıt için X puan kazanırsın" ve yanıtı bir `claimToken` ile kayıttan sonra hesaba bağlama; (c) ödülsüz anket: işletmenin profili ve diğer aktif kampanyaları. Müşteri panelinde "Bekleyen anketler" kartı da eklenmeli (ilgili işletmeyi ziyaret etmiş müşterilere).

### B7. Uzun formun tamamı tek ekranda: taslak, ilerleme ve satır içi doğrulama yok
- **Önem:** orta · **Kategori:** UX / mobil · **Efor:** M
- **Kanıt:** `page.tsx:132-201` (bütün sorular tek kaydırmada), `:39` (cevaplar bellekte), `:203-208` (gönder düğmesi en altta, yapışkan değil).
- **Sorun:** QR okutup mobilde gelen kullanıcı 20 soruya kadar uzayan bir listeyle karşılaşıyor ve nerede olduğunu, ne kadar kaldığını bilmiyor. Gönder düğmesi en altta ve eksik soruyu bulmak kullanıcıya kalıyor. Bildirim gelip sekme yeniden yüklenirse her şey siliniyor.
- **Öneri:** Mobilde soru-başına-ekran (Typeform tarzı) akışa geçin: üstte ince bir ilerleme çubuğu ("3 / 8"), alta yapışkan "İleri / Geri" çubuğu (`safe-area-inset-bottom` ile). Tek seçim ve puanlama sorularında seçimden sonra otomatik ilerleme olsun. Masaüstünde mevcut liste kalabilir. Cevapları `sessionStorage` içinde `survey-draft:<id>` anahtarıyla saklayın ve açılışta "Kaldığın yerden devam et" önerin. Başlangıçta "Yaklaşık 2 dk · 8 soru" bilgisini gösterin.

### B8. Marka ve paylaşım kimliği eksik: logo kullanılmıyor, metadata yok
- **Önem:** orta · **Kategori:** görsel / büyüme · **Efor:** S
- **Kanıt:** `route.ts:37` (`logo` dönüyor), `page.tsx:31` (tipte var), `:125` (yerine genel ikon kullanılıyor), `app/surveys/` (`layout.tsx` / `generateMetadata` yok).
- **Sorun:** Kullanıcı formun kime ait olduğunu en zayıf yerden (açıklamanın altındaki soluk satırdan) öğreniyor. Bu, güven ve yanıt oranı açısından zayıf. Anket bağlantısı sosyal kanalda paylaşıldığında önizleme genel Qratex başlığını gösteriyor. Bayinin en önemli dağıtım kanalı bu bağlantı olduğu için kayıp büyük.
- **Öneri:** Sayfayı bir sunucu bileşeni kabuğu (`page.tsx` RSC) + istemci form (`survey-form.tsx`) olarak bölün. Sunucu tarafında `generateMetadata` ile `title = "{anket} · {işletme}"`, açıklama ve işletme logolu dinamik OG görseli (`opengraph-image.tsx`) üretin. İlk veriyi RSC'den `initialData` olarak verin, spinner aşaması ortadan kalksın. Bu helper'ı yazarken build sırasında DB erişilemezse varsayılana düşen try/catch desenini uygulayın. Başlıkta işletme logosu (yoksa baş harf avatarı), işletme adı ve onun altında anket başlığı olsun. Altta küçük bir "Qratex ile güçlendirildi" imzası yer alsın.

### B9. Modül kapatma ve bayi durumu sunucuda uygulanmıyor
- **Önem:** düşük · **Kategori:** mimari / yetki · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:45` (`dealer_surveys`), `components/dashboard/sidebar.tsx:259` (tek kullanım yeri), `route.ts:18-24`, `91-94` (modül veya bayi hesabı kontrolü yok).
- **Sorun:** Admin anket modülünü kapattığında daha önce dağıtılmış bağlantılar yanıt toplamaya devam ediyor. Askıya alınmış ya da silinme sürecindeki bir bayinin anketi de herkese açık kalıyor (bayi hesabı durum alanı burada kontrol edilmiyor; ilgili alanın adı doğrulanmadı).
- **Öneri:** GET ve POST'ta modül durumunu ve bayinin aktifliğini kontrol eden ortak bir `assertSurveyAvailable(survey)` koruyucusu kullanın. Kapalı durumda 410 + `SURVEY_UNAVAILABLE` döndürün. İstemci bunu "Bu anket artık yanıt kabul etmiyor" ekranıyla göstersin.

### B10. Gizlilik: yanıtın hesaba bağlandığı kullanıcıya söylenmiyor
- **Önem:** düşük · **Kategori:** gizlilik / güven · **Efor:** S
- **Kanıt:** `route.ts:87-89`, `page.tsx` (bildirim metni yok).
- **Sorun:** Oturum açmış kullanıcı anonim olduğunu sanabilir, oysa yanıtı `userId` ile kaydediliyor. Bayi sonuç ekranı şu an `userId` göstermiyor (`results/route.ts:68-72`), ama veri modelinde bu ilişki duruyor. Açık metinli sorularda (şikâyet gibi) bu bir güven sorunu.
- **Öneri:** Gönder düğmesinin üstüne "Yanıtın @kullanıcıadı hesabınla ilişkilendirilecek · Anonim gönder" anahtarı koyun. Anonim seçilirse `userId: null` yazılsın ve ödül alınamayacağı açıkça söylensin. Bu tercih KVKK aydınlatma metniyle de uyumlu olur.

### B11. Küçük kod kalitesi sorunları
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `page.tsx:11` (`Input` içe aktarılıyor ama kullanılmıyor, ölü kod), `:44` (API yerelleştirilmediği hâlde `locale` sorgu anahtarında; dil değişince aynı veri yeniden çekiliyor), `:154`, `:170`, `:193` (`as string` / `as string[]` / `as number` tip zorlamaları; cevap tipi sorudan türetilmiyor), `route.ts:103` (`id` değişkeni filtre içinde gölgeleniyor), `route.ts:73` (IP yoksa ortak `unknown` kovası).
- **Öneri:** Cevap durumunu `Record<string, string | string[] | number>` yerine soru tipine göre ayrık bir birleşim tipiyle (`{ type: 'rating'; value: number } | …`) modelleyin. Bu, B1'deki ortak doğrulayıcıyla aynı tip kaynağını paylaşır. `locale` sorgu anahtarından çıkarılsın. Ölü import silinsin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Yanıt karşılığı ödül ve anında geri bildirim** (Starbucks Rewards "Bonus Star" görevleri, Duolingo XP): anket tamamlanınca puan/XP animasyonu, seri (streak) veya görev ilerlemesine katkı. Şu an hiçbir karşılık yok.
2. **Soru-başına-ekran mobil akış ve ilerleme çubuğu** (Typeform, Duolingo ders ekranı): seçimle otomatik ilerleme, geri dönebilme, "3 / 8" göstergesi, tahmini süre.
3. **Taslak kaydetme ve kaldığı yerden devam**: yenileme/geri tuşuna dayanıklılık.
4. **Oturumsuz kullanıcı için kazanım hunisi**: "Kayıt ol, bu yanıtın puanını al" ile yanıtı sonradan hesaba bağlama (`claimToken`).
5. **Müşteri panelinde "Bekleyen anketler" ve "Yanıtladıklarım" listesi**: anketler şu an sadece bayinin dağıttığı bağlantıyla bulunabiliyor, ürün içinde keşfedilebilir değil.
6. **Zengin soru tipleri ve mantık**: NPS (0-10), emoji ölçeği, koşullu dallanma (ör. puan ≤ 2 ise "neden?" sorusu), çoklu seçimde en az/en çok sınırı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** QR'ı okutan kullanıcı ilk saniyede kimin sorduğunu (işletme logosu ve adı), ne kadar süreceğini ("8 soru · ~2 dk") ve ne kazanacağını ("+50 puan") görsün. Anketi tek elle, başparmak bölgesinde, her ekranda tek soruyla 60-90 saniyede bitirsin. Sonunda ödülünü gören, işletmeye ya da paneline dönen ve memnuniyet hissiyle çıkan bir kullanıcı olsun. Revolut/Monzo'nun "bir ekran, bir karar" sadeliği ile Duolingo'nun tamamlama kutlaması birleşmeli.

**Yerleşim:**
- **Kapak ekranı:** işletme logosu (64 px, yuvarlak), işletme adı, anket başlığı ve açıklaması, meta çipleri (soru sayısı, süre, ödül), birincil "Başla" düğmesi. Oturumlu kullanıcıya "Yanıtın hesabınla ilişkilendirilecek · Anonim gönder" anahtarı, oturumsuz kullanıcıya "Giriş yaparsan +50 puan" bağlantısı.
- **Soru ekranı (mobil):** üstte ince ilerleme çubuğu ve geri oku, ortada büyük soru metni (`legend`), altında tip bazlı girdi. Seçenekler 56 px yüksekliğinde tam genişlik kartlar. Puanlama 48 px yıldız ya da emoji ölçeği, uçlarda etiketler. Altta yapışkan "İleri" çubuğu (`safe-area` ile). Tek seçim ve puanlamada 250 ms sonra otomatik ilerleme.
- **Masaüstü:** ortalanmış tek kolon liste korunabilir, ama sağda yapışkan bir ilerleme özeti ("5/8 yanıtlandı · 2 zorunlu eksik", tıklanınca soruya kaydırma) olmalı.
- **Sonuç ekranı:** onay ikonu, "Teşekkürler {ad}", kazanılan puanın sayaçla artışı ve güncel XP çubuğu, ardından iki CTA: "{İşletme} sayfasına dön" ve "Panelime git". Oturumsuz kullanıcı için "Puanını almak için hesap aç" kartı.

**Motion (ölçülü):** sorular arası yatay kaydırma geçişi (`AnimatePresence`, x: ±24 px, 180 ms). İlerleme çubuğunda yaylı genişlik animasyonu. Seçimde kartın kısa bir "basılma" ölçeği (0.98). Sonuç ekranında puan sayacı ve tek seferlik küçük bir konfeti/parıltı patlaması (en çok 800 ms). three.js burada yerinde olmaz: kısa, görev odaklı bir form için 3B yük, bundle boyutu ve dikkat dağınıklığı getirir. Ödül anı için mevcut rozet/ödül kutusu bileşenine yalnızca ödüllü ankette ve isteğe bağlı olarak bağlanılabilir. Tüm hareketler global `reducedMotion="user"` ayarına zaten uyuyor. Konfeti bunu ayrıca `useReducedMotion` ile kontrol etmeli.

**Veri/API değişiklikleri:**
1. `Survey`: `rewardPoints Int @default(0)`, `responseLimit String @default("one_per_user")`, `closesAt DateTime?`, isteğe bağlı `estimatedSeconds`.
2. `SurveyResponse`: `@@unique([surveyId, userId])`, `isAnonymous Boolean`, `pointsCredited Int @default(0)`, `claimToken String? @unique`.
3. `SurveyQuestion`: tip kümesine `nps` ve `emoji_scale`, `minSelect`/`maxSelect`, `showIf Json?` (koşullu mantık).
4. `GET /api/surveys/[id]/fill`: `alreadyResponded`, `rewardPoints`, `estimatedSeconds`, `questionCount` ve bayi durumu bilgisi dönsün. Hatalar `code` alanıyla gelsin. İlk render RSC'den yapılsın.
5. `POST`: soru bazlı dinamik doğrulama (B1), tekillik (B3) ve ödül kredisi (B6) tek bir `prisma.$transaction` içinde yapılsın. Yanıt `{ responseId, pointsAwarded, newBalance, xp }` dönsün.
6. Ortak `lib/surveys/` modülü: `schema.ts` (soru/cevap tipleri), `validate-answers.ts` (istemci ve sunucu ortak), `availability.ts` (modül ve bayi durumu).

---

## Çakışmalar / birleştirme önerisi

- **`/c/[token]` ve tüketim değerlendirme akışı (`ConsumptionReview`) ile kısmi amaç çakışması:** İkisi de "müşteriden geri bildirim toplama" işini yapıyor. Fark şu: değerlendirme akışı QR + ödül + karakter rozeti ekonomisine bağlı, anket ise bayinin serbest soru setini topluyor ve ekonomiden tamamen kopuk. Sayfa kaldırılmamalı, çünkü bayi tarafında net bir değeri var (özel sorular ve sonuç ekranı). Ama aynı **geri bildirim tasarım dili ve ödül altyapısını** paylaşmalı: ortak soru girdileri (puanlama, seçim, metin), ortak sonuç/kutlama ekranı, ortak puan kredisi servisi. İleride bayi, değerlendirme akışının sonuna isteğe bağlı olarak "2 kısa soru daha" şeklinde bir anket ekleyebilmeli. Böylece anket ayrı bir bağlantıya muhtaç kalmaz ve doğal trafik alır.
- **Müşteri paneliyle bağ kopukluğu:** Anket sayfası `/customer` kabuğunun dışında duruyor ve panelde anketlerin göründüğü bir yer yok. Herkese açık rota (`/surveys/[id]`) paylaşılabilirlik için korunmalı. Panelde ise "Anketler" kartı (bekleyen ve tamamlanan) eklenmeli ve oturumlu kullanıcı aynı bileşeni panel kabuğu içinde görebilmeli.
- **Kopya yok:** Kod tabanında anket dolduran başka bir sayfa bulunmadı (`grep "surveys/"` yalnızca bu sayfayı ve bayi sayfalarını döndürüyor).

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (`app/api/surveys/[id]/fill/route.ts`, `app/api/dealer/surveys/route.ts`, `app/api/dealer/surveys/[id]/results/route.ts`, `app/dealer/surveys/[id]/results/page.tsx`, `app/dealer/surveys/create/page.tsx`, `proxy.ts`, `lib/rate-limit.ts`, `prisma/schema.prisma`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Anonim uç cevap içeriğini doğrulamadan kaydediyor — **DOĞRULANDI**
- `proxy.ts:105-119`: `/api/*` istekleri hiçbir kimlik kontrolünden geçmeden `NextResponse.next()` ile geçiyor; `fill` POST'u oturumsuz çağrılabiliyor (`route.ts:88-89` oturum yoksa `userId=null`).
- `route.ts:53-56`: `questionId: z.string()`, `value: string | string[] | number`; uzunluk, aralık veya soru türüne göre şekil kontrolü yok. `route.ts:101-105` yalnızca zorunlu soruların ID'lerinin varlığına bakıyor; ankete ait olmayan `questionId`'ler ve listede olmayan seçenekler eleniyor değil. `route.ts:108-114` gövdeyi olduğu gibi `answers` JSON'una yazıyor.
- `results/route.ts:44-50`: tanımsız seçenek için `optionCounts[v]` yeni anahtar açıyor; `results/page.tsx:84` `Object.entries(qr.optionCounts)` ile bu sahte seçeneği bayiye ayrı bir çubuk olarak gösteriyor. `results/route.ts:55-56`: `Number(value)` aralıksız ortalamaya giriyor; `results/page.tsx:101` ortalamayı ham sayı olarak basıyor.
- **Yeniden üretim:** Oturumsuz `curl -X POST /api/surveys/<id>/fill -d '{"answers":[{"questionId":"<ratingQ>","value":1000000},{"questionId":"<singleQ>","value":"<istenen metin>"}, ...zorunlu diğerleri]}'` → 201. Bayi sonuç ekranında ortalama ~1.000.000/n'e fırlar, tek seçimli soruda bayinin hiç tanımlamadığı bir seçenek çubuğu belirir. Tek fren `survey-fill:<id>:<ip>` başına dakikada 10 istek (`route.ts:73`, `lib/rate-limit.ts:96-101`); IP değiştirerek aşılabilir, tek istek bile ortalamayı bozmaya yeter.
- **Not:** Sınırsız metin uzunluğu ve 100 öğelik dizi de gerçek; `request.json()` gövde sınırına (platform varsayılanı) kadar veri kabul ediliyor. Ciddiyet: veri bütünlüğü açısından YÜKSEK, para/puan etkisi yok (anket ekonomiye bağlı değil, `app/api/surveys` altında puan/ödül kodu yok).
- **Öneri:** Sunucuda soru haritasına karşı doğrulama: `questionId` ankete ait olmalı ve tekrar etmemeli; `single_choice` → `options` içinden tek string, `multiple_choice` → `options` alt kümesi (tekrarsız), `rating` → 1-5 tamsayı, `open_text` → kırpılmış ve ≤2000 karakter. Uyumsuz yanıt 400 döner. Sonuç toplayıcı da savunmacı olmalı: yalnızca tanımlı seçenekleri say, rating'i 1-5'e kısıtla (eski kirli kayıtlar için).

### 2. Seçeneksiz zorunlu seçim sorusu anketi gönderilemez yapıyor — **DOĞRULANDI**
- `create/page.tsx:50`: yeni soru varsayılanı `single_choice`, `options: ['', '']`, `required: true`. `create/page.tsx:92-93` yalnızca soru metnini kontrol ediyor; seçenek doluluğu kontrolü yok. `:106-107` boş seçenekleri filtreleyip `[]` gönderiyor.
- `app/api/dealer/surveys/route.ts:13` `options` opsiyonel, `min` yok, tür ile ilişkilendirilmemiş → `[]` (veya hiç gönderilmezse `null`) kaydediliyor (`:74`).
- `app/surveys/[id]/page.tsx:146,165`: `q.options && ...` — `[]` truthy olduğundan blok render ediliyor ama `map` hiçbir girdi üretmiyor (`null` ise hiç render yok). `:71-77` zorunlu kontrol her gönderimde takılıyor; istemci atlatılsa bile sunucu `fill/route.ts:101-105` aynı soruyu eksik sayıyor.
- **Yeniden üretim:** Bayi "Anket Oluştur"da soru ekler, metnini yazar, seçenekleri boş bırakır, kaydeder → 201. Müşteri `/surveys/<id>` açar: soru başlığı ve `*` görünür ama işaretlenecek bir şey yok; "Gönder" her seferinde "zorunlu soruları yanıtlayın" hatası verir. Anket sıfır yanıtla kalır ve bayi bunun nedenini hiçbir yerde göremez.
- **Öneri:** API'de `questionSchema`'yı `type`'a göre ayrıştırılmış birleşime (`z.discriminatedUnion`) çevir: seçim türleri için `options` en az 2, benzersiz, kırpılmış. Oluşturma formunda kaydetmeden önce aynı kural satır içi hata olarak gösterilsin. Savunma katmanı olarak doldurma sayfası seçeneksiz seçim sorusunu "bu soru yapılandırılmamış" diye işaretlesin ve sunucu böyle soruyu zorunluluk kontrolünden düşsün; mevcut bozuk anketler için bayi listesinde uyarı rozeti.

### 3. Aynı kullanıcı aynı anketi sınırsız yanıtlayabiliyor — **DOĞRULANDI** (ödül kısmı varsayımsal)
- `fill/route.ts:108-114` koşulsuz `create`; öncesinde `surveyId+userId` için var mı kontrolü yok. `prisma/schema.prisma:2626-2635` `SurveyResponse` yalnızca `@@index([surveyId])` taşıyor, tekillik kısıtı yok.
- **Yeniden üretim:** Oturumlu müşteri anketi gönderir, sayfayı yeniler (`submitted` yalnızca bileşen state'i, `page.tsx:40`) ve tekrar gönderir → her seferinde yeni satır; `results/route.ts:70` `totalResponses` ve tüm dağılımlar şişer. Anonimken de aynı; IP başına dakikada 10.
- **Daraltma:** "Puan basma açığı" kısmı bugün geçerli değil: anket yanıtı hiçbir puan/ödül yoluna bağlı değil (`app/api/surveys` altında ve `lib` içinde anket-puan bağı yok). Bu nedenle etki şu an veri bütünlüğüyle sınırlı (ORTA-YÜKSEK); ödül bağlanırsa KRİTİK olur. Ayrıca yalnız `@@unique([surveyId, userId])` yetmez: Postgres birden fazla `NULL`'a izin verdiği için anonim tekrarları durdurmaz.
- **Öneri:** Oturumlu kullanıcı için `@@unique([surveyId, userId])` + `create` yerine P2002 yakalanıp "zaten yanıtladınız" (409) dönen akış; sayfa açılışında GET bu durumu da dönsün ve form yerine teşekkür/sonuç görünümü gösterilsin. Anonim için imzalı, tek kullanımlık yanıt belirteci (cookie veya `claimToken @unique`) ve cihaz/IP+anket bazlı günlük sınır. Ödül bağlanacaksa `memory/points-economy-invariants` kuralları: oturum zorunlu, atomik tek seferlik kredi, `pointsCredited` alanı.
