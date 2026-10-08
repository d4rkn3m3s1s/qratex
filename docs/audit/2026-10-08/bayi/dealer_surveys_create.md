# /dealer/surveys/create

**Amaç:** Bayinin (işletme sahibinin) başlık + açıklama + 1–20 sorudan (tek seçim / çoktan seçmeli / açık uçlu / 1–5 puan) oluşan özel bir anket hazırlayıp kaydetmesi; anket daha sonra `/dealer/surveys` listesinden link kopyalanarak `/surveys/[id]` herkese açık sayfasında doldurulur ve `/dealer/surveys/[id]/results` ekranında özetlenir.

**Genel puan: 4.2 / 10** · **Karar: yeniden tasarla** (veri modeli ve API iskeleti kullanılabilir; ancak oluşturucu, doğrulama, önizleme, düzenleme, dağıtım ve erişilebilirlik ürün seviyesinde yeniden kurgulanmalı; liste + oluştur + sonuç üçlüsü tek bir "Anket Stüdyosu" akışında birleşmeli)

Kapsam (salt okunur; uygulama çalıştırılmadı, görsel yargılar kod okumasına dayanır): `app/dealer/surveys/create/page.tsx` (246 satır), `app/dealer/surveys/layout.tsx`, `app/dealer/layout.tsx`, `app/dealer/surveys/page.tsx`, `app/dealer/surveys/[id]/results/page.tsx` (yalnız sorgu kısmı), `app/api/dealer/surveys/route.ts`, `app/api/dealer/surveys/[id]/route.ts`, `app/api/dealer/surveys/[id]/results/route.ts`, `app/api/surveys/[id]/fill/route.ts`, `app/surveys/[id]/page.tsx`, `lib/api-auth.ts`, `lib/module-gate.ts`, `lib/module-controls.ts`, `components/providers.tsx`, `components/dashboard/sidebar.tsx`, `proxy.ts`, `prisma/schema.prisma` (Survey, SurveyQuestion, SurveyResponse, TablePulse), `messages/tr.json` + `messages/en.json` (`dealerSurveyCreate`), `e2e/surveys.spec.ts`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel "oluştur → kaydet" akışı çalışıyor; fakat seçenekleri boş bırakılmış bir seçim sorusu sunucudan geçip **hiç yanıtlanamayan anket** üretiyor, düzenleme/önizleme/sıralama/dağıtım yok, kayıttan sonra liste önbelleği tazelenmiyor. |
| UX | 4/10 | Tek sayfalık düz form; önizleme, şablon, taslak, kaydedilmemiş değişiklik uyarısı, soru sıralama ve alan bazlı hata gösterimi yok; hatalar tek bir genel toast'a sıkışıyor. |
| Görsel | 5/10 | Diğer bayi sayfalarıyla tutarlı kart/hero dili ve sade bir hiyerarşi; ama soru kartı yoğun, tip seçimi görselleştirilmemiş, "oluşturucu" hissi vermeyen form görünümü. |
| Mimari | 4/10 | İstemci ve sunucu doğrulaması birbirinden kopuk (sınırlar yalnız sunucuda, seçenek kuralları hiçbir yerde); modül kapısı API'de uygulanmıyor; React Query kullanan listeyle önbellek bağı kurulmamış; `motion` (tam paket) kullanımı global `m` desenini bozuyor. |
| Performans | 7/10 | Tek POST, tek `count` + nested `create`; sayfa hafif. Tek eksi: `motion` doğrudan içe aktarıldığı için LazyMotion ertelemesinden faydalanmıyor. |
| Erişilebilirlik + mobil | 3/10 | Etiketler input'lara bağlı değil, ikon-only butonlarda `aria-label` yok, Switch/Select isimsiz; dar ekranda soru metni input'u sabit `w-40` select yüzünden ~50px'e sıkışıyor (hesapla, görsel doğrulanmadı). Azaltılmış hareket global `MotionConfig reducedMotion="user"` ile karşılanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer` öneki DEALER dışındaki rolleri kendi paneline yönlendiriyor. |
| 2 | API rol kontrolü (DEALER/ADMIN) | ÇALIŞIYOR | `app/api/dealer/surveys/route.ts:51-52` | ADMIN kendi `user.id`'si adına anket oluşturur (`:67`); başka bayi adına oluşturma yolu yok — IDOR yok. |
| 3 | Modül kapısı (`dealer_surveys`) | EKSİK | `components/dashboard/sidebar.tsx:259` vs. `app/api/dealer/surveys/route.ts` (hiç `assertModuleEnabled` yok) | Admin modülü kapatsa bile yalnız menü gizleniyor; URL ve API çalışmaya devam ediyor. |
| 4 | Segment metadata (sekme başlığı) | KISMİ | `app/dealer/surveys/layout.tsx:4-6` | Oluştur sayfası liste ile aynı başlığı taşıyor; "Yeni anket" ayrımı yok. |
| 5 | Hero kartı + geri butonu | ÇALIŞIYOR | `page.tsx:127-138` | Geri butonu ikon-only, `aria-label` yok (`:128-130`). |
| 6 | Alt başlık metni | KISMİ | `messages/tr.json` → `dealerSurveyCreate.subtitle` "…müşterilerinize gönderin" | Sayfada ya da sonrasında "gönderme" yeteneği yok; yalnız listede link kopyalama var (`app/dealer/surveys/page.tsx:58-61`). Vaat ile gerçek uyuşmuyor. |
| 7 | Anket başlığı alanı | KISMİ | `page.tsx:143-146` | `maxLength` yok (sunucu 200, `route.ts:19`); `<Label>` `htmlFor` ile bağlı değil. |
| 8 | Açıklama alanı | KISMİ | `page.tsx:147-150` | `maxLength` yok (sunucu 2000, `route.ts:20`); etiket bağlı değil. |
| 9 | Soru sayacı başlığı | ÇALIŞIYOR | `page.tsx:157` | "Sorular ({count})"; 20 üst sınırı gösterilmiyor. |
| 10 | "Soru ekle" butonu | KISMİ | `page.tsx:47-52, 158-165` | Sınırsız ekleme; sunucu 20'de reddediyor (`route.ts:21`) ve İngilizce zod mesajı dönüyor. |
| 11 | Soru metni input'u | KISMİ | `page.tsx:177` | Placeholder-only (etiket yok), `maxLength` yok (sunucu 500, `route.ts:12`). |
| 12 | Soru tipi seçimi (4 tip) | ÇALIŞIYOR | `page.tsx:178-187`, `QUESTION_TYPE_KEYS :30-35` | Tip değişince seçenekler state'te korunuyor, choice dışı tiplerde gönderilmiyor (`:106-108`) — doğru. Trigger isimsiz, mobilde sabit `w-40`. |
| 13 | Seçenek listesi (A, B, C…) | KISMİ | `page.tsx:190-202` | Harf etiketi `String.fromCharCode(65 + oi)` (`:194`) 26. seçenekten sonra `[`, `\`… üretir; seçenek sayısı sınırsız. Placeholder-only. |
| 14 | "Seçenek ekle" | ÇALIŞIYOR | `page.tsx:62-66, 203-205` | Üst sınır yok. |
| 15 | Seçenek silme (>2 iken) | ÇALIŞIYOR | `page.tsx:196-200` | İkon-only, `aria-label` yok; `key={oi}` (index) ile silmede odak/denetim kayması olası. |
| 16 | Zorunlu anahtarı | ÇALIŞIYOR | `page.tsx:209-214` | Switch'in erişilebilir adı yok (yan `span` bağlı değil). |
| 17 | Soru silme | ÇALIŞIYOR | `page.tsx:58-60, 216-218` | Onay ya da geri al yok; ikon-only, `aria-label` yok. |
| 18 | Soru giriş/çıkış animasyonu | ÇALIŞIYOR | `page.tsx:168-170` | `motion.div` + `layout`; global `m as Motion` deseni yerine tam `motion` kullanıyor (`:5`). `reducedMotion="user"` global (`components/providers.tsx:232`). |
| 19 | Soru sıralama (yukarı/aşağı, sürükle) | EKSİK | `page.tsx:110` yalnız dizi index'ini `order` olarak gönderiyor | Sıra değiştirmenin UI yolu yok; yanlış sırada eklenen soru için tek çare sil-yeniden-yaz. |
| 20 | Soru çoğaltma | EKSİK | — | Benzer sorular için kopyala yok. |
| 21 | Boş durum | ÇALIŞIYOR | `page.tsx:226-231` | Metin "yukarıdaki butonla" diyor; doğrudan CTA yok. |
| 22 | İstemci doğrulaması | KISMİ | `page.tsx:89-93` | Yalnız başlık, ≥1 soru, boş soru metni kontrol ediliyor. Seçenek sayısı/boşluğu/tekrarı, uzunluk, soru adedi kontrol edilmiyor; hangi sorunun hatalı olduğu işaretlenmiyor. |
| 23 | Boş seçenekli seçim sorusunun engellenmesi | BOZUK | `page.tsx:106-108` boşları filtreliyor → `[]`; `route.ts:13` `z.array(...).optional()` minimum yok; `route.ts:74` `[]` olarak kaydediyor | Yanıtlanamayan anket üretiyor (Bulgu 1). |
| 24 | Tekrarlayan seçenek kontrolü | EKSİK | `page.tsx:106-108`, `route.ts:13` | Aynı metinli iki seçenek kaydediliyor; doldurma sayfasında `key={opt}` ve `id={\`${q.id}-${opt}\`}` çakışıyor (`app/surveys/[id]/page.tsx:148-159`), sonuçlarda birleşiyor (`results/route.ts:43`). |
| 25 | Oluştur butonu + spinner + çift tıklama koruması | ÇALIŞIYOR | `page.tsx:95, 239-242` | `disabled={saving}`. |
| 26 | POST `/api/dealer/surveys` | KISMİ | `route.ts:49-90` | zod doğrulaması + nested create doğru; seçenek kuralları ve modül kapısı eksik, hata metinleri dil-karışık. |
| 27 | 50 anket kotası | KISMİ | `route.ts:60-63` | UI'da kota görünmüyor; kullanıcı formu doldurduktan sonra öğreniyor; `count` + `create` atomik değil (eşzamanlı isteklerde 50 aşılabilir — düşük olasılık). |
| 28 | Başarı toast + listeye yönlendirme | KISMİ | `page.tsx:116-117` | Listenin React Query önbelleği (`['dealer','surveys']`, `staleTime: 30_000` — `app/dealer/surveys/page.tsx:31-35`) geçersiz kılınmıyor; 30 sn içinde dönülürse yeni anket listede görünmez. Yeni anketin linki/QR'ı sunulmuyor. |
| 29 | Hata toast'ları | KISMİ | `page.tsx:114-119`, `route.ts:57, 62, 88` | zod varsayılan İngilizce mesajı (örn. "Array must contain at most 20 element(s)") TR arayüzde; sunucu sabit TR mesajları EN arayüzde; JSON olmayan yanıtta `res.json()` SyntaxError'u ham mesaj olarak gösteriliyor. |
| 30 | İptal | KISMİ | `page.tsx:236-238` | Kaydedilmemiş içerik için uyarı yok; sekme kapanınca/yanlış tıklamada tüm soru seti kaybolur. |
| 31 | Taslak / otomatik kaydetme | EKSİK | — | Ne `localStorage` ne sunucu taslağı; Survey modelinde `status` alanı yok (`schema.prisma:2598-2611`, yalnız `isActive`). |
| 32 | Canlı önizleme (müşterinin göreceği hâl) | EKSİK | — | Doldurma sayfası (`app/surveys/[id]/page.tsx`) ile aynı bileşen paylaşılmıyor. |
| 33 | Şablon / AI ile soru önerisi | EKSİK | — | Platformun AI altyapısına rağmen boş sayfadan başlanıyor. |
| 34 | Puan ölçeği yapılandırması (1–5 / 0–10 NPS / emoji) | EKSİK | `messages/tr.json` `typeRating` "Puan (1-5)"; doldurma `[1..5]` sabit (`app/surveys/[id]/page.tsx:191`) | CX ürününde NPS/CSAT ölçeği yok. |
| 35 | Koşullu mantık / atlama | EKSİK | — | — |
| 36 | Dağıtım (QR, masa, kampanya, e-posta) | EKSİK | — | Kayıt sonrası yalnız listedeki "link kopyala" var. |
| 37 | Oluşturulduktan sonra düzenleme | EKSİK | `app/api/dealer/surveys/[id]/route.ts:28-32` yalnız `title/description/isActive` | Soru düzenleyen bir ekran ya da API yok; yazım hatası = anketi sil, yanıtları kaybet. |
| 38 | Klavye/ekran okuyucu desteği | KISMİ | `page.tsx:128, 144, 148, 177, 179, 195, 197, 211, 216` | Etiket bağı ve `aria-label`'lar eksik (Bulgu 6). |
| 39 | Mobil yerleşim | KISMİ | `page.tsx:176-179` | Soru satırı `flex` + sabit `w-40` select, wrap yok (Bulgu 7). |
| 40 | Koyu tema özel sınıfları | ÇALIŞIYOR | `page.tsx:162, 179` | Elle `dark:` override'ları — tasarım token'ı yerine tekil sınıflar. |
| 41 | TR/EN çeviri anahtarları | ÇALIŞIYOR | `messages/tr.json`, `messages/en.json` `dealerSurveyCreate` (25 anahtar, birebir) | Arayüz metinleri tam; sunucu mesajları çevrilmiyor (#29). |
| 42 | E2E testi | BOZUK (sahte geçiş) | `e2e/surveys.spec.ts:16-18` | "Yeni Anket" bir `<a>` (`app/dealer/surveys/page.tsx:75-77`, `Button asChild`); `getByRole('button')` bulamaz → `if` atlanır, oluşturma adımı hiç koşmadan test ilerler. Koşsaydı da varsayılan boş seçenekli soruyla yanıtlanamayan anket üretecekti. |

**Durum sayıları (42 özellik):** ÇALIŞIYOR 14 · KISMİ 15 · BOZUK 2 · SAHTE 0 · EKSİK 11 (#42 sahte-geçen test olduğu için BOZUK sayıldı; #6 vaadi sahte değil eksik yetenek olarak KISMİ'de).

---

## Bulgular

### 1. Boş seçenekli seçim sorusu yanıtlanamayan anket üretiyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / doğrulama · **Efor:** S
- **Kanıt:** `page.tsx:50` yeni soru varsayılanı `type:'single_choice', options:['','']`; `page.tsx:92-93` yalnız soru metnini kontrol eder; `page.tsx:106-108` boş seçenekleri filtreler → `[]`; `app/api/dealer/surveys/route.ts:13` `options: z.array(z.string().min(1).max(200)).optional()` (min uzunluk yok, choice tipinde zorunluluk yok); `route.ts:74` `[]`'i aynen kaydeder. Doldurma tarafı: `app/surveys/[id]/page.tsx:146-162` `q.options && …map` → `[]` truthy, hiçbir radyo çizilmez; `required` varsayılan `true` (`page.tsx:50`) → `app/surveys/[id]/page.tsx:71-77` ve `app/api/surveys/[id]/fill/route.ts:100-106` gönderimi her seferinde reddeder.
- **Sorun:** Bayi soru metnini yazıp seçenekleri doldurmayı unuttuğunda (varsayılan tipin seçim olması bunu çok olası kılıyor) anket "başarıyla oluşturuldu" der, link paylaşılır, ama **hiçbir müşteri anketi gönderemez**. Bayi bunu ancak sonuç ekranında 0 yanıt görünce, sessiz bir başarısızlık olarak fark eder. Tek seçenekli "seçim" sorusu da aynı yoldan geçer (anlamsız ama yanıtlanabilir).
- **Öneri:** Doğrulamayı tek bir paylaşılan şemaya taşıyın (`lib/surveys/schema.ts`): `z.discriminatedUnion('type', …)` ile `single_choice`/`multiple_choice` için `options: z.array(trimmedString).min(2).max(20).refine(unique)`, `open_text`/`rating` için `options` yasak. Aynı şemayı istemcide `react-hook-form` + `zodResolver` ile kullanıp hatayı ilgili soru kartında satır içi gösterin (kart kenarlığı + "En az 2 benzersiz seçenek girin"). Mevcut bozuk kayıtlar için tek seferlik bir denetim sorgusu (choice tipli ve `jsonb_array_length(options) < 2` olan sorular) ile bayiye "bu anket yanıt alamıyor" uyarısı gösterin. E2E testini de bu senaryoyu kapsayacak şekilde düzeltin (Bulgu 9).

### 2. Oluşturulduktan sonra düzenleme yok — tek hata, anketin ve yanıtlarının silinmesi demek
- **Önem:** yüksek · **Kategori:** işlevsellik / ürün · **Efor:** L
- **Kanıt:** `app/api/dealer/surveys/[id]/route.ts:28-32` yalnız `title`, `description`, `isActive` güncelliyor; `app/dealer/surveys/` altında edit sayfası yok; liste sayfasındaki tek düzenleme benzeri aksiyon aktif/pasif anahtarı (`app/dealer/surveys/page.tsx:118`).
- **Sorun:** Soru metnindeki bir yazım hatası, eksik bir seçenek ya da Bulgu 1'deki bozuk soru düzeltilemiyor; tek yol silmek — bu da `onDelete: Cascade` ile tüm yanıtları götürüyor (`schema.prisma:2629`). Qualtrics/Typeform/Google Forms'ta temel beklenti.
- **Öneri:** Oluştur ve düzenle için tek bir `SurveyBuilder` bileşeni (`components/surveys/survey-builder.tsx`) ve `/dealer/surveys/[id]/edit` rotası. API: `PUT /api/dealer/surveys/[id]` soru dizisini `id`'li diff olarak alır (yeni/güncellenen/silinen) ve `prisma.$transaction` içinde uygular. Yanıtı olan ankette yapısal değişikliği (tip değişimi, seçenek silme) sürümlemeyle çözün: `Survey.version` + `SurveyResponse.surveyVersion` veya seçenekleri kararlı `id`'lerle saklayıp (`{id,label}`) yanıtlarda id tutmak; böylece etiket düzeltmesi geçmiş sonuçları bozmaz.

### 3. Modül kapısı API ve sayfada uygulanmıyor
- **Önem:** orta · **Kategori:** yetki / yönetişim · **Efor:** S
- **Kanıt:** Menü öğesi `moduleKey: 'dealer_surveys'` ile gizleniyor (`components/dashboard/sidebar.tsx:259`, `lib/module-controls.ts:45`); `app/api/dealer/surveys/route.ts` ve `[id]/route.ts` içinde `assertModuleEnabled` çağrısı yok (aynı desen `app/api/dealer/campaigns/route.ts`'te mevcut); `proxy.ts` yalnız rol kontrol ediyor.
- **Sorun:** Admin anket modülünü kapattığında bayi doğrudan `/dealer/surveys/create` URL'si ya da API ile anket oluşturmaya, mevcut linkler de yanıt toplamaya devam eder. Modül kontrolü yalnız kozmetik kalıyor.
- **Öneri:** POST/PATCH/DELETE/GET uçlarının başına `assertModuleEnabled('dealer_surveys', { role })` ekleyin; sayfa düzeyinde server component sarmalayıcı ile kapalı modülde "Bu özellik işletmeniz için kapalı" boş durumunu gösterin. Herkese açık doldurma ucu (`app/api/surveys/[id]/fill/route.ts`) için politika kararı verin (kapalı modülde 404 mi, mevcut anketler çalışsın mı).

### 4. Kayıttan sonra liste önbelleği geçersiz kılınmıyor
- **Önem:** orta · **Kategori:** veri akışı · **Efor:** S
- **Kanıt:** Oluştur sayfası ham `fetch` kullanıyor ve `queryClient`'a dokunmuyor (`page.tsx:97-117`); liste `useQuery({ queryKey: ['dealer','surveys'], staleTime: 30_000 })` (`app/dealer/surveys/page.tsx:31-35`).
- **Sorun:** Liste → "Yeni anket" → hızlı (30 sn'den kısa) bir anket oluştur → listeye dönüş: önbellek "taze" sayıldığı için yeniden çekilmez, yeni anket görünmez; bayi tekrar oluşturmaya kalkışıp kopya anket (ve 50 kotasından düşüm) üretebilir.
- **Öneri:** Oluşturmayı `useMutation` ile yapın; `onSuccess`'te `queryClient.setQueryData(['dealer','surveys'], …)` ile yeni kaydı listeye ekleyin ya da `invalidateQueries`. Daha iyisi: başarıdan sonra listeye değil, yeni anketin "Paylaş" adımına (link + QR + masa/kampanya bağlama) yönlendirin.

### 5. Hata mesajları dil karışık ve alan bilgisi taşımıyor
- **Önem:** orta · **Kategori:** i18n / UX · **Efor:** M
- **Kanıt:** `route.ts:57` `parsed.error.errors[0].message` — zod varsayılanı İngilizce ("String must contain at most 500 character(s)"); `route.ts:62, 88` ve `[id]/route.ts` sabit Türkçe metinler EN arayüzde de Türkçe; `page.tsx:114` JSON olmayan yanıtta (`502` HTML vb.) SyntaxError mesajı doğrudan toast'a düşüyor.
- **Sorun:** Kullanıcı hangi sorunun/alanın hatalı olduğunu bilemez, TR arayüzde İngilizce teknik mesaj görür. İstemci sınırları (200/2000/500/200/20) hiç uygulamadığı için bu hatalar gerçekçi.
- **Öneri:** Sunucudan makine-okunur hata dönün: `{ code: 'VALIDATION', issues: [{ path: ['questions',3,'options'], code: 'too_small' }] }` ve `{ code: 'SURVEY_QUOTA', limit: 50 }`; istemci `path`'i soru kartına eşleyip yerelleştirilmiş metni gösterir. Input'lara `maxLength` + kalan karakter sayacı ekleyin; "Soru ekle"yi 20'de devre dışı bırakıp "20/20" gösterin. `res.json()`'u `content-type` kontrolüyle sarın.

### 6. Erişilebilirlik: isimsiz denetimler ve bağlanmamış etiketler
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `<Label>`'larda `htmlFor`, input'larda `id` yok (`page.tsx:144-149`); soru ve seçenek input'ları yalnız placeholder ile tanımlı (`:177, :195`); ikon-only butonlar `aria-label`'sız: geri (`:128-130`), seçenek sil (`:197`), soru sil (`:216`); Switch (`:211`) ve Select trigger (`:179`) erişilebilir adsız. Liste sayfasında `title` var ama bu sayfada o bile yok.
- **Sorun:** Ekran okuyucu "düğme", "düğme", "anahtar" diye okur; hangi soruyu sildiği belirsizdir. Placeholder, yazmaya başlayınca kaybolur. Silme tek tıkla ve geri alınamaz.
- **Öneri:** Her soru kartını `<fieldset>` + `<legend className="sr-only">Soru {n}</legend>` yapın; `aria-label={t('…removeQuestion', { n })}` gibi bağlamlı adlar; Switch'i `<Label htmlFor>` ile bağlayın. Silmeye "Geri al" aksiyonlu toast (5 sn) ekleyin; yeni soru eklenince odak soru metnine, silinince bir önceki karta taşınsın. Seçenek listesinde index yerine kararlı `id` anahtarı kullanın (`:193 key={oi}`).

### 7. Mobilde soru satırı sıkışıyor
- **Önem:** orta · **Kategori:** mobil · **Efor:** S
- **Kanıt:** `page.tsx:176-179` `flex gap-3` + `Input flex-1` + `SelectTrigger w-40` (160px), wrap yok; dış sarmalayıcıda rozet + `gap-3` + 32px sil butonu (`:173-174, :216`); dealer layout yatay dolgusu `max(0.75rem, safe-area)` (`app/dealer/layout.tsx:35`).
- **Sorun:** 360px genişlikte hesapla: 360 − 24 (layout) − 32 (kart `p-4`) − ~22 (rozet) − 24 (iki gap) − 32 (sil) ≈ 226px iç alan; bunun 160+12'si select'e gider → soru metni input'u ~54px. Bayi sorusunu yazarken metnin tamamını göremez (görsel olarak doğrulanmadı; ölçü kod üzerinden hesaplandı).
- **Öneri:** Soru kartını mobilde iki satıra kırın (`flex-col sm:flex-row`, select `w-full sm:w-40`); daha iyisi tip seçimini kart başlığında ikonlu "segmented" kontrol / chip olarak verin, soru metnini çok satırlı otomatik büyüyen `Textarea` yapın. Kaydet/İptal'i mobilde alt-sabit eylem çubuğuna alın (layout zaten `pb-[6.5rem]` bırakıyor).

### 8. Ölçek ve soru tipi seti CX ürünü için yetersiz
- **Önem:** orta · **Kategori:** ürün · **Efor:** M
- **Kanıt:** Tipler `page.tsx:24, 30-35`; puan 1–5 sabit (`messages/tr.json` `typeRating`, `app/surveys/[id]/page.tsx:191`); sonuç uç noktası yalnız ortalama + dağılım hesaplıyor (`results/route.ts:54-60`).
- **Sorun:** Platformun geri kalanı NPS/CSAT dilini konuşurken anket oluşturucu NPS (0–10), CSAT, emoji ölçeği, evet/hayır, tarih, iletişim bilgisi (izinli) gibi standart tipleri sunmuyor; promoter/detractor hesaplanamıyor.
- **Öneri:** Soru modeline `config Json?` ekleyin (`{ scale: 'nps'|'1-5'|'1-10'|'emoji', labels: {min,max} }`); `nps` tipinde sonuç ucu NPS skorunu ve segment dağılımını hesaplasın; açık uçlu yanıtları mevcut AI içgörü hattına (duygu/tema) bağlayın.

### 9. E2E testi oluşturma adımını sessizce atlıyor
- **Önem:** orta · **Kategori:** test / kalite · **Efor:** S
- **Kanıt:** `e2e/surveys.spec.ts:16-17` `getByRole('button', { name: /Yeni Anket|Anket Oluştur/i })` + `if (await createBtn.isVisible())`; gerçek öğe `Button asChild` ile `<a>` (`app/dealer/surveys/page.tsx:75-77`), rolü `link`. Ayrıca `:20` `placeholder*="başlık"` mevcut placeholder ("Müşteri memnuniyet anketi") ile eşleşmiyor.
- **Sorun:** Oluşturma akışı hiç test edilmiyor; test yalnız önceki verilere göre geçiyor/kalıyor. Koşsaydı da Bulgu 1'deki bozuk anketi üretecekti — yani regresyon ağı yok.
- **Öneri:** `getByRole('link', { name: … })`, `getByLabel(...)` (Bulgu 6 düzeltilince mümkün) kullanın; koşullu `if`'i kaldırın; akışı "oluştur → public sayfada doldur → sonuçlarda 1 yanıt gör" olarak sonuna kadar doğrulayın; boş seçenek, 21. soru ve kota senaryoları için API birim testleri ekleyin.

### 10. Kaydedilmemiş içerik kaybı ve taslak yokluğu
- **Önem:** düşük · **Kategori:** UX · **Efor:** M
- **Kanıt:** Tüm durum yerel `useState` (`page.tsx:42-45`); İptal ve geri bağlantıları doğrudan `Link` (`:129, :237`); `beforeunload` yok; Survey modelinde taslak durumu yok (`schema.prisma:2604` yalnız `isActive`).
- **Sorun:** 15 soruluk bir anket, yanlış bir tıklama ya da sekme kapanmasıyla kaybolur. "Oluştur" anında `isActive: true` (varsayılan) yayına alınır; taslakta tutup daha sonra yayınlama yok.
- **Öneri:** `Survey.status: DRAFT | ACTIVE | CLOSED` (+ `publishedAt`, `closesAt`); oluşturucu ilk anlamlı değişiklikte sunucu taslağı açıp debounce'lu autosave yapsın ("Kaydedildi · 2 sn önce"); `isDirty` iken yönlendirmede onay diyaloğu.

### 11. `motion` doğrudan içe aktarılıyor (global LazyMotion deseninin dışında)
- **Önem:** düşük · **Kategori:** performans / tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:5` `import { motion, AnimatePresence } from 'framer-motion'`; global sağlayıcı non-strict `LazyMotion features={domAnimation}` (`components/providers.tsx:238-245`); public doldurma sayfası `m as Motion` kullanıyor (`app/surveys/[id]/page.tsx:6`).
- **Sorun:** Bu chunk tam `motion` özellik setini paketliyor; proje çapındaki erteleme kazancı burada kayboluyor. `layout` animasyonu `domAnimation` ile gelmediğinden `m` + `layout` geçişinde `domMax` ya da `layout`'un kaldırılması gerekir — yani düzeltme mekanik değil, bilinçli yapılmalı.
- **Öneri:** `m as Motion`'a geçin; sıralama eklendiğinde (Bulgu 2/Vizyon) `Reorder` + `layout` gerekecekse oluşturucu bileşenini `LazyMotion features={domMax}` ile yerel sarın.

### 12. Seçenek harf etiketi 26'dan sonra bozuluyor, seçenek sayısı sınırsız
- **Önem:** düşük · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `page.tsx:194` `String.fromCharCode(65 + oi)`; `page.tsx:62-66` sınırsız ekleme.
- **Sorun:** 27. seçenekte `[` gibi karakterler görünür; sunucu da seçenek adedini sınırlamıyor (yalnız uzunluk).
- **Öneri:** Seçenek sayısını şemada `max(20)` ile sınırlayın ve harf yerine sıra numarası/sürükleme tutamacı gösterin.

---

## Eksik özellikler (kıyas: Qualtrics CX, Medallia, Typeform/Google Forms, Toast/Square geri bildirim)

1. **Canlı önizleme (masaüstü/mobil)** — Qualtrics ve Typeform'da oluşturucunun yanında müşteri görünümü standart; burada doldurma sayfası ile görsel bağ yok.
2. **Şablon galerisi + AI ile soru üretimi** — "Yeni menü geri bildirimi", "Personel memnuniyeti", "NPS + neden" gibi hazır setler; işletme türü ve son geri bildirim temalarından AI önerisi (platformda AI altyapısı mevcut).
3. **Dağıtım adımı** — oluşturma sonrası link + indirilebilir QR + mevcut QR kodlarına/masalara iliştirme + kampanya modülüyle segment gönderimi; Medallia/Toast'ta anket kanalı ayrılmaz parça.
4. **Mantık ve akış** — koşullu atlama (puan ≤ 2 ise "neden?" sorusu), soru sıralama/çoğaltma, sayfa bölümleri.
5. **Yaşam döngüsü** — taslak/yayında/kapalı durumları, başlangıç-bitiş tarihi, yanıt kotası, kişi başı tek yanıt (oturum/çerez) ayarı.
6. **Standart CX ölçekleri ve marka** — NPS/CSAT/CES, emoji ölçeği; işletme logosu/rengi ile tema, teşekkür ekranı metni ve ödül/puan teşviki (platformun puan ekonomisiyle entegre, kötüye kullanım korumalı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi "Yeni anket"e bastığında boş bir form değil, üç yollu bir başlangıç görür: *Şablondan başla* · *AI ile oluştur* ("Kahvaltı menüsü hakkında 5 soruluk kısa anket") · *Boş anket*. Ardından iki panelli bir **Anket Stüdyosu** açılır: solda soru akışı (sürüklenebilir kartlar), sağda müşterinin telefonda göreceği canlı önizleme. Her değişiklik taslağa otomatik kaydedilir. "Yayınla" adımı anketi aktif eder ve aynı ekranda dağıtımı sunar: link, QR, masa/QR koduna bağla, kampanya ile gönder. Yayından sonra aynı stüdyo "Sonuçlar" sekmesine dönüşür.

**Yerleşim:**
- Üst çubuk (sticky): anket adı (yerinde düzenlenebilir), durum rozeti (Taslak/Yayında), "Kaydedildi" göstergesi, Önizle / Yayınla.
- Sol (≥ lg, 7/12): soru kartları — başlıkta tip chip'i + ikon, sürükle tutamacı, çoğalt/sil menüsü; kartın içinde tip-özel düzenleyici (seçenek listesi, ölçek ayarı, mantık kuralı). Kart altına "＋ soru" ekleyici, tip paletini popover olarak açar.
- Sağ (≥ lg, 5/12): telefon çerçevesinde canlı önizleme — `app/surveys/[id]/page.tsx`'teki soru render'ı `components/surveys/survey-question-renderer.tsx` olarak ortaklaştırılır ve hem public sayfa hem önizleme aynı bileşeni kullanır.
- Mobil: sekmeli "Düzenle / Önizle" + alt-sabit "Yayınla" çubuğu; soru kartları tek sütun, tip seçimi kart başlığında.

**Motion / 3B:** 3B yeri yok — bu bir üretkenlik aracı. Ölçülü motion: kartlarda `Reorder.Group` ile sürükle-bırak (yerel `LazyMotion features={domMax}`), ekleme/silmede kısa (150–200 ms) yükseklik + opaklık geçişi, önizlemede ilgili sorunun düzenleme anında hafif vurgulanması (scroll-into-view + kenarlık nabzı). Yayınla başarısında küçük bir onay mikro-animasyonu; `reducedMotion="user"` zaten global.

**Veri / API değişiklikleri:**
- `Survey`: `status` (DRAFT/ACTIVE/CLOSED), `publishedAt`, `closesAt`, `settings Json` (tek yanıt, teşekkür metni, tema), `version Int`.
- `SurveyQuestion`: `config Json` (ölçek, etiketler), `logic Json?` (göster-koşulu); seçenekler `{ id, label }` biçiminde kararlı id'lerle.
- `SurveyResponse`: `surveyVersion`, `source` (qr/link/campaign), `qrCodeId?` — dağıtım kanalına göre analiz için.
- Uçlar: `POST /api/dealer/surveys` (taslak oluştur), `PUT /api/dealer/surveys/[id]` (transaction içinde soru diff'i), `POST /api/dealer/surveys/[id]/publish`, `POST /api/dealer/surveys/generate` (AI, mevcut AI timeout/limit desenleriyle), hepsinde `assertModuleEnabled('dealer_surveys')` ve tek paylaşılan zod şeması (`lib/surveys/schema.ts`), yerelleştirilebilir hata kodları.
- İstemci: React Query `useMutation` + optimistic güncelleme; `react-hook-form` + `zodResolver` ile alan bazlı hata.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/surveys` + `/dealer/surveys/create` + `/dealer/surveys/[id]/results`:** Üç ayrı sayfa, arada düzenleme ve dağıtım boşluğu var. Önerilen: liste sayfası kalsın; oluştur/düzenle/paylaş/sonuçlar tek `/dealer/surveys/[id]` stüdyosunda sekmeler olarak birleşsin (`/create` → taslak oluşturup stüdyoya yönlendiren ince bir rota).
- **Ana geri bildirim akışı ve `TablePulse` (`schema.prisma:2672`) ile kavramsal çakışma:** Platformun asıl müşteri sesi QR → Feedback akışından ve masa nabzından geliyor; özel anketler bu verilerden tamamen kopuk (ayrı model, AI içgörüye bağlanmıyor, QR kodlarına iliştirilemiyor). Kaldırılması önerilmez — "derinlemesine/özel soru" ihtiyacı gerçek — ama anket yanıtlarının (özellikle puan ve açık uçlu) AI içgörü ve VoC duvarına akması, anketin QR kodlarına "ek soru seti" olarak bağlanabilmesi gerekir.
- **`/dealer/campaigns`:** Dağıtım için ayrı bir gönderim hattı yazmak yerine kampanya modülüne "anket linki" içerik tipi eklenmeli; iki modülün segment ve gönderim mantığı tekrarlanmamalı.

---

## Doğrulama (şüpheci inceleme)

### 1. Boş seçenekli seçim sorusu kaydediliyor, anket hiçbir müşteri tarafından gönderilemiyor — **DOĞRULANDI**

Zincir uçtan uca okunarak doğrulandı; kırılan bir halka bulunamadı:

- `app/dealer/surveys/create/page.tsx:50` — yeni soru `type: 'single_choice'`, `options: ['', '']`, `required: true` ile doğar.
- `app/dealer/surveys/create/page.tsx:92-93` — istemci yalnızca soru metnini (`q.text.trim()`) doğrular; seçenek sayısı/doluluğu kontrol edilmez.
- `app/dealer/surveys/create/page.tsx:106-108` — boş seçenekler filtrelenir, iki boş seçenekli soru için gövdeye `options: []` gider.
- `app/api/dealer/surveys/route.ts:13` — `z.array(z.string().min(1).max(200)).optional()`: boş dizi geçerlidir (eleman yok, `min(1)` hiçbir elemana uygulanmaz); dizinin kendisi için `.min(2)` ya da tipe bağlı `superRefine` yok.
- `app/api/dealer/surveys/route.ts:74` — `q.options ?? undefined`: `[]` nullish değil, olduğu gibi `SurveyQuestion.options` (`Json?`, `prisma/schema.prisma:2619`) alanına yazılır. `Survey.isActive` varsayılanı `true` (`schema.prisma:2604`), yani anket hemen yayında.
- `app/surveys/[id]/page.tsx:146-162` — `q.options && …map` koşulu `[]` için truthy; hiç radio/checkbox çizilmez, kullanıcının bu soruya cevap verme yolu yoktur.
- `app/surveys/[id]/page.tsx:71-77` — istemci zorunlu soru için cevap bulamaz, `surveyFill.requiredQuestions` hatasıyla gönderimi durdurur.
- `app/api/surveys/[id]/fill/route.ts:100-106` — sunucu da zorunlu soru id'si cevaplarda yoksa 400 "Zorunlu soruları yanıtlayın" döner.
- Kurtarma yolu yok: `app/api/dealer/surveys/[id]/route.ts` yalnızca `PATCH` (sadece `isActive`, satır 31) ve `DELETE` sunuyor; soru/seçenek düzenleme ucu bulunmuyor. Bayi hatayı ancak anketi silip baştan oluşturarak düzeltebilir — ve bunu fark etmesi için yanıt gelmediğini görmesi gerekir.

**Yeniden üretim:** Bayi `/dealer/surveys/create` → başlık yaz → "Soru ekle" → yalnızca soru metnini yaz, seçenek alanlarına dokunma → "Oluştur". Toast "başarıyla oluşturuldu" der, 201 döner. Müşteri `/surveys/<id>` linkini açar: soru metni ve kırmızı `*` görünür ama altında seçenek yoktur; "Gönder" her seferinde "Zorunlu soruları yanıtlayın" hatası verir. Anket sıfır yanıt toplar. (Teknik olarak doğrudan API'ye el yapımı POST ile aşılabilir, çünkü fill ucu cevap değerini seçeneklere karşı doğrulamıyor — ama gerçek müşteri için bu yol yok.)

**Ek gözlemler (iddianın alt maddeleri):**
- *Tek seçenekli seçim sorusu:* `options: ['A']` kabul edilir; anket gönderilebilir durumda kalır, yalnızca anlamsız bir soru üretir. Kırıcı değil, kalite sorunu — tek başına KRİTİK/YÜKSEK sayılmaz.
- *Tekrarlayan seçenekler:* `['Evet','Evet']` kabul edilir. Public sayfada `key={opt}` (`app/surveys/[id]/page.tsx:149, 168`) ve `id={\`${q.id}-${opt}\`}` çakışır: React yinelenen key uyarısı verir, iki `<Label htmlFor>` aynı input'u hedefler; radio değeri aynı olduğundan iki seçenek görsel olarak birlikte seçili görünür. Veri kaybı yok, ama sonuç dağılımı ayırt edilemez. Orta önem.
- Tip değiştirme (`page.tsx:178`) `options` dizisini sıfırlamaz; `open_text` → `single_choice` geri dönüşünde eski boş seçenekler kalır — aynı kök nedeni besler.

**Önerilen düzeltme (ürün seviyesi):** Tek bir paylaşılan zod şeması (`lib/surveys/schema.ts`) hem istemci formunda (`zodResolver`) hem `POST /api/dealer/surveys`'te kullanılmalı: seçim tiplerinde `superRefine` ile trim edilmiş, büyük/küçük harf duyarsız tekilleştirilmiş en az 2 seçenek zorunlu; diğer tiplerde `options` yok sayılıp `null` yazılmalı. Editörde boş seçenek satırı alan bazlı hata ile işaretlenmeli ve soru kartı kaydetmeden önce kaydırılıp vurgulanmalı. Savunma derinliği olarak public render, seçeneği olmayan seçim sorusunu cevaplanamaz kılmak yerine sunucu tarafında `required` hesaplamasından düşürmeli (ya da fill GET ucu bu soruyu filtrelemeli) ve fill POST cevap değerlerini sorunun seçenek kümesine karşı doğrulamalı. Mevcut bozuk anketler için salt-okunur bir tespit sorgusu (seçim tipinde `jsonb_array_length(options) < 2`) çalıştırılıp bayiye "bu anket yanıt toplayamıyor" uyarısı gösterilmeli; uzun vadede soru düzenleme ucu (`PUT /api/dealer/surveys/[id]`) eklenmeli.
