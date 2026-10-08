# /dealer/surveys/[id]/results

**Amaç:** Bayinin (işletme sahibinin) oluşturduğu tek bir anketin toplu sonuçlarını görmesi: toplam yanıt sayısı, aktif/pasif durumu ve her soru için tipine göre özet (seçenek dağılımı, puan ortalaması + dağılımı, son açık uçlu yanıtlar).

**Genel puan: 4.6 / 10** · **Karar: yeniden tasarla** (sahiplik kontrolü ve temel toplama doğru çalışıyor; ancak sayfa bir "sonuç dökümü" seviyesinde kalmış: filtre, zaman boyutu, tekil yanıt görünümü, dışa aktarma, AI özeti yok; üstelik beslendiği public yanıt ucu değerleri doğrulamadığı için gösterilen sayılar manipüle edilebilir. Sayfa, `/dealer/surveys/[id]` altında sekmeli bir "Anket detay merkezi"ne dönüştürülmeli.)

Kapsam: `app/dealer/surveys/[id]/results/page.tsx` (130 satır), `app/dealer/surveys/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/surveys/[id]/results/route.ts`, `app/api/dealer/surveys/[id]/route.ts`, `app/api/dealer/surveys/route.ts`, `app/api/surveys/[id]/fill/route.ts` (sonuç verisinin kaynağı), `app/surveys/[id]/page.tsx` (puan ölçeği), `app/dealer/surveys/page.tsx`, `app/dealer/surveys/create/page.tsx`, `components/ui/progress.tsx`, `components/ui/inline-loading-status.tsx`, `components/ui/card.tsx`, `components/providers.tsx`, `components/dashboard/sidebar.tsx`, `lib/api-auth.ts`, `lib/module-gate.ts`, `lib/module-controls.ts`, `lib/app-locale.tsx`, `proxy.ts`, `tailwind.config.ts`, `app/globals.css`, `prisma/schema.prisma` (Survey, SurveyQuestion, SurveyResponse), `messages/tr.json` + `messages/en.json`. Salt okunur inceleme; uygulama çalıştırılmadı, görsel sonuçlar kod okumasına dayanır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Soru tipine göre toplama dürüst veriyle doğru çalışıyor; fakat açıklama/tarih gösterilmiyor, açık uçlu yanıtlar 20 ile kesiliyor, filtre/dışa aktarma/tekil yanıt yok ve girdi doğrulanmadığı için sayılar çarpıtılabiliyor. |
| UX | 4/10 | Hata durumunda başlık ve geri butonu dahil tüm sayfa kayboluyor, "tekrar dene" yok; puan dağılımı düz metin, "son 20" olduğu söylenmiyor; paylaş/QR/aktiflik değiştirme gibi bir sonraki adımlar bu sayfada yok. |
| Görsel | 5/10 | Bayi panelinin kart/hero diliyle tutarlı ve sade; ama tüm sorular aynı ağırlıkta, özet (KPI) katmanı yok, boş yıldızlar neredeyse görünmez, puan dağılımı grafik değil. |
| Mimari | 4/10 | Tüm yanıtlar belleğe çekilip JS'te toplanıyor; ADMIN rolü kabul edilip sonra hep 404'e düşüyor; `dealer_surveys` modül anahtarı API'de uygulanmıyor; `queryFn` HTTP durumunu yok sayıyor. |
| Performans | 5/10 | Küçük anketlerde sorun yok; ancak `responses` sınırsız `include` ediliyor ve toplama O(soru × yanıt × cevap); önbellek yok — popüler bir ankette yanıt süresi ve bellek doğrusal büyür. |
| Erişilebilirlik + mobil | 5/10 | `role="status"` yükleme, global `reducedMotion="user"` ve mobilde dikey yığılan başlık iyi; ama paylaşılan `Progress` değeri Radix'e iletmiyor (ekran okuyucu "belirsiz" der), ikon-yalnız geri butonunda etiket yok, boş yıldız kontrastı ~1:1. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota erişimi (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer` öneki DEALER dışındaki rolleri yönlendiriyor. |
| 2 | Sahiplik kontrolü (IDOR koruması) | ÇALIŞIYOR | `app/api/dealer/surveys/[id]/results/route.ts:27-29` | Başkasının anketine 404. |
| 3 | ADMIN rolü desteği | BOZUK | `results/route.ts:15` ADMIN kabul ediliyor, `:27` admin istisnası yok; karşılaştır `app/api/dealer/surveys/[id]/route.ts:23,39-40` | ADMIN her anket için 404 alır; PATCH/DELETE'de admin istisnası var, burada yok — tutarsız sözleşme. |
| 4 | Modül kapısı (`dealer_surveys`) | KISMİ | `components/dashboard/sidebar.tsx:259`, `lib/module-controls.ts:45`; surveys route'larında `assertModuleEnabled` yok | Admin modülü kapatsa da URL ve API çalışmaya devam eder; yalnız menü gizlenir. |
| 5 | Veri yükleme (React Query) | KISMİ | `page.tsx:30-39` | `r.ok` kontrol edilmiyor; 404/500 gövdesi "başarılı veri" olarak 30 sn önbelleğe giriyor, `retry: 1` hiç devreye girmiyor (`components/providers.tsx:209-213`). |
| 6 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:41`, `components/ui/inline-loading-status.tsx:28-50` | `role="status"` + sr-only etiket; içerik iskeleti (skeleton) yok, düzen kayması olur. |
| 7 | Hata durumu | KISMİ | `page.tsx:42-47` | Tek satır metin; geri butonu/başlık da kayboluyor, "Tekrar dene" yok, 404 ("anket yok/silinmiş") ile 500 ayrılmıyor. |
| 8 | Geri butonu (`/dealer/surveys`) | KISMİ | `page.tsx:54-56` | İkon-yalnız; `aria-label`/`title` yok — ekran okuyucu yalnız "bağlantı" der. |
| 9 | Başlık (anket adı + ikon) | ÇALIŞIYOR | `page.tsx:58-61` | |
| 10 | Toplam yanıt sayısı | ÇALIŞIYOR | `page.tsx:62`, `results/route.ts:70` | EN'de tekil/çoğul yok ("1 total responses"); `t()` değişken desteklerken (`lib/app-locale.tsx:57-59`) `.replace` kullanılmış. |
| 11 | Aktif / Pasif rozeti | ÇALIŞIYOR | `page.tsx:64` | Salt okunur; buradan aç/kapat yapılamıyor. |
| 12 | Anket açıklaması | EKSİK | API döndürüyor `results/route.ts:69`, tip tanımında var `page.tsx:32`, render edilmiyor | |
| 13 | Oluşturulma tarihi / yayın süresi | EKSİK | `results/route.ts:69` `createdAt` dönüyor; `page.tsx:32` tipte bile yok | Bayi anketin ne kadar süredir açık olduğunu göremiyor. |
| 14 | Boş durum (yanıt yok) | KISMİ | `page.tsx:67-68` | Yalnız "Henüz yanıt alınmadı"; linki kopyala / QR / anketi aktifleştir gibi bir sonraki adım yok. |
| 15 | Soru kartları (sıra numarası + metin) | ÇALIŞIYOR | `page.tsx:71-77`, `results/route.ts:22` (`order asc`) | `CardTitle` bir `h3` (`components/ui/card.tsx:44`) — `h1`'den sonra `h2` atlanıyor. |
| 16 | Soru başına yanıt sayısı | ÇALIŞIYOR | `page.tsx:78`, `results/route.ts:51,59,64` | Zorunlu olmayan sorularda "atlayan" sayısı/oranı gösterilmiyor. |
| 17 | Seçenek dağılımı (tek/çok seçim) | KISMİ | `page.tsx:82-96`, `results/route.ts:40-51` | Dürüst veride doğru; ama public uçtan gelen her string yeni "seçenek" olarak sayılıyor (Bulgu 1). Çok seçimde yüzdeler toplamı >%100 olabilir, açıklanmıyor. |
| 18 | Seçenekleri sayıya göre sıralama | ÇALIŞIYOR | `page.tsx:84` | Orijinal seçenek sırasına dönme seçeneği yok (Likert tarzı sorularda sıralama anlamı bozar). |
| 19 | Yüzde çubuğu (`Progress`) | KISMİ | `page.tsx:92`, `components/ui/progress.tsx:16-25` | `value` Radix `Root`'a iletilmiyor → `aria-valuenow` yok, durum "indeterminate". Erişilebilir ad yok. |
| 20 | Puan ortalaması | KISMİ | `page.tsx:101`, `results/route.ts:54-59` | Ondalık yerelleştirilmiyor (TR'de "4.3"), "/5" bağlamı yok, aralık dışı değerler ortalamayı çarpıtır (Bulgu 1). |
| 21 | Yıldız gösterimi | KISMİ | `page.tsx:102-104` | Boş yıldız `text-muted/30` — açık temada `--muted: 264 30% 95%` (`app/globals.css:22`) %30 opaklıkla neredeyse görünmez; doldurma sayfası `text-muted-foreground/30` kullanıyor (`app/surveys/[id]/page.tsx:193`), tutarsız. |
| 22 | Puan dağılımı (1★–5★) | KISMİ | `page.tsx:105-111`, `results/route.ts:57-58` | Düz metin satırı, grafik değil; yalnız 1–5 anahtarları gösteriliyor, aralık dışı/ondalık değerler toplamda görünmez → satırlar toplamı `totalAnswers`'a eşit olmayabilir. |
| 23 | Açık uçlu yanıtlar | KISMİ | `page.tsx:115-121`, `results/route.ts:63-64` | Yalnız en yeni 20 yanıt; "son 20" ibaresi, tarih, "tümünü gör", arama yok; `key={j}` indeks. |
| 24 | Bilinmeyen tip / seçeneksiz seçim sorusu | KISMİ | `page.tsx:82,99,115`; seçeneksiz soru `app/api/dealer/surveys/route.ts:13` (`options` opsiyonel, `min` yok) + `create/page.tsx:106-107` (boşlar filtreleniyor) | Seçenekleri boşaltılmış bir seçim sorusu veya tanımsız tip için kart gövdesi tamamen boş render edilir. |
| 25 | Kart giriş animasyonu | ÇALIŞIYOR | `page.tsx:72`; `components/providers.tsx:232,241` | Proje standardı `m as Motion`; gecikme 0.5 sn ile sınırlı; `reducedMotion="user"` global. |
| 26 | Mobil yerleşim | KISMİ | Başlık: `page.tsx:53` (`flex-col sm:flex-row`) iyi; soru başlığı satırı `page.tsx:75-79` `flex-wrap` yok | Uzun soru metni ile "N yanıt" aynı satırda sıkışır (görsel olarak doğrulanmadı). |
| 27 | Veri tazeliği / yenile | EKSİK | `page.tsx:38` (`staleTime: 30_000`), yenile butonu yok | Anket açıkken canlı akış veya "son güncelleme" bilgisi yok. |
| 28 | Sunucu tarafı toplama doğruluğu | KISMİ | `results/route.ts:32-65` | Mantık doğru; ancak girdiyi doğrulamayan kaynak yüzünden sonuç güvenilir değil (Bulgu 1). |
| 29 | Yanıt bütünlüğü (tekrar doldurma / bot) | EKSİK | `app/api/surveys/[id]/fill/route.ts:71-79,108-114` | Yalnız IP başına 10/dk; kişi/cihaz başına tek yanıt, CAPTCHA, şüpheli yanıt işareti yok. |
| 30 | Tarih aralığı filtresi | EKSİK | — | |
| 31 | Tekil yanıt görünümü (yanıt yanıt gezinme) | EKSİK | — | `SurveyResponse.userId` (`schema.prisma:2630`) var ama hiç kullanılmıyor. |
| 32 | Dışa aktarma (CSV/XLSX/PDF) | EKSİK | — | |
| 33 | Paylaş linki / QR / aktiflik değiştir | EKSİK | Yalnız liste sayfasında: `app/dealer/surveys/page.tsx:58-61,112-118` | Sonuç sayfası bir çıkmaz sokak. |
| 34 | Zaman serisi (günlük yanıt grafiği) | EKSİK | — | |
| 35 | AI özet / duygu / tema çıkarımı (açık uçlu) | EKSİK | — | Ürünün geri kalanında AI içgörü altyapısı olmasına rağmen. |
| 36 | Çapraz tablo / segment kırılımı | EKSİK | — | |
| 37 | Sekme başlığı (metadata) | KISMİ | `app/dealer/surveys/layout.tsx:4-6` | Tüm alt sayfalar genel "Anketler" başlığını alır; anket adı sekmede görünmez. |

**Sayım:** ÇALIŞIYOR 10 · KISMİ 15 · BOZUK 1 · SAHTE 0 · EKSİK 11 (toplam 37)

---

## Bulgular

### 1. Public yanıt ucu değerleri doğrulamıyor → sonuç sayfası manipüle edilebilir
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik
- **Kanıt:** `app/api/surveys/[id]/fill/route.ts:53-56` (`value: string | string[] | number`, uzunluk/aralık sınırı yok), `:100-114` (yalnız zorunlu soru varlığı kontrol ediliyor; değer soru tipine/seçeneklere göre denetlenmiyor, bilinmeyen `questionId`'ler de kaydediliyor); toplama: `app/api/dealer/surveys/[id]/results/route.ts:44-48` (her string yeni anahtar), `:55-58` (aralık kontrolü yok); gösterim: `page.tsx:84-95,101,105-111`.
- **Sorun:** Oturumsuz herhangi biri (IP başına dakikada 10 istek, IP değiştirerek sınırsız):
  - Bir puan sorusuna `value: 1000000000` göndererek ortalamayı anlamsız bir sayıya çıkarır; 5 yıldız dolu görünür, dağılım satırı ise `1★:0 … 5★:0` der (toplam tutmaz).
  - Seçim sorusuna `value: "Rakip X'e gidin – site.com"` göndererek bayinin sonuç ekranına sahte bir "seçenek" ve çubuk ekler (React kaçışladığı için XSS değil, ama içerik enjeksiyonu).
  - Tek seçimli soruya dizi göndererek bir yanıtı birden çok seçeneğe sayar (yüzdeler >%100).
  - Uzunluk sınırı olmadığı için çok uzun string'ler hem DB'yi şişirir hem de sonuç kartının düzenini bozar.
- **Profesyonel öneri:** Doğrulamayı yazma anında, soru tanımına göre yap: soru haritası kur (`Map<questionId, SurveyQuestion>`), bilinmeyen soru kimliklerini reddet, her `questionId` için tek cevap kabul et; `single_choice` → `options` içinde tek string, `multiple_choice` → `options` alt kümesi (tekilleştirilmiş), `rating` → 1–5 tam sayı, `open_text` → kırpılmış, ≤2000 karakter string. Bu doğrulama Zod `superRefine` ile tek bir `validateSurveyAnswers(questions, answers)` yardımcı fonksiyonunda toplanmalı. Ek olarak sonuç ucunda savunmacı toplama yap (bilinmeyen seçenekleri "diğer/geçersiz" kovasında say, aralık dışı puanı dışla). Yanıt bütünlüğü için oturum/cihaz parmak izi ile anket başına tek yanıt ve basit bir bot sinyali (honeypot + Turnstile) eklenmeli; mevcut kirli kayıtlar için tek seferlik bir temizleme betiği (dry-run modunda) planlanmalı.
- **Efor:** M

### 2. Tüm yanıtlar sınırsız belleğe çekilip JS'te toplanıyor
- **Önem:** orta · **Kategori:** performans / ölçeklenebilirlik
- **Kanıt:** `results/route.ts:19-25` (`responses: { orderBy }` — `take`/`select` yok), `:32-38` (her soru için tüm yanıtlar üzerinde `arr.find` → O(soru × yanıt × cevap)), önbellek yok (`dynamic = 'force-dynamic'`, `:8`).
- **Sorun:** Bir QR anketi masalara konduğunda binlerce yanıt kolayca birikir; her sayfa açılışında Neon'dan tüm JSON gövdeleri çekilir, serverless fonksiyon belleği ve süresi doğrusal büyür. Ayrıca `answers` dizi değilse (`as` cast, `:35`) `.find` atar ve tüm sayfa 500 olur (proje geçmişindeki JSON-forEach 500 kök nedeniyle aynı desen).
- **Profesyonel öneri:** Toplamayı Postgres'e taşı: `jsonb_array_elements(answers)` üzerinden `GROUP BY questionId, value` ile tek sorguda seçenek sayıları ve puan dağılımı; açık uçlu yanıtlar için ayrı, sayfalanmış (`cursor`) bir uç (`/results/texts?questionId=&cursor=`). Alternatif olarak yazma anında artan özet tablosu (`SurveyQuestionStat`) tutulabilir. Sonucu Upstash Redis'te `survey:{id}:results` anahtarıyla kısa TTL'li (30–60 sn) önbelleğe al ve yeni yanıtta geçersiz kıl. `Array.isArray` koruması ekle.
- **Efor:** M

### 3. Hata yönetimi: HTTP durumu yok sayılıyor, hata ekranı çıkmaz sokak
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `page.tsx:37` (`return r.json()` — `r.ok` yok), `:42-47` (hata durumunda yalnız metin; başlık, geri butonu yok), `components/providers.tsx:212` (`retry: 1` hiç tetiklenmez çünkü sorgu reddedilmiyor).
- **Sorun:** Silinmiş bir ankete (ya da yanlış bağlantıya) gelen bayi "Sonuçlar yüklenemedi" görür ve sayfada geri dönecek bir kontrol yoktur; geçici 500 ile kalıcı 404 aynı mesajı alır ve hatalı gövde 30 sn önbellekte kalır. Oturum süresi dolmuşsa 401 de aynı mesaja düşer.
- **Profesyonel öneri:** Proje genelinde `fetchJson` yardımcı fonksiyonu (r.ok değilse `ApiError(status, message)` fırlatan) kullan; `isError` + `error.status`'a göre üç durum: 404 → "Bu anket bulunamadı veya silinmiş" + "Anketlere dön"; 401 → oturum yenileme; 5xx → "Tekrar dene" (`refetch`). Hata durumunda da başlık iskeleti ve geri bağlantısı render edilsin.
- **Efor:** S

### 4. ADMIN rolü kabul edilip sonra her zaman 404 — tutarsız yetki sözleşmesi; modül kapısı uygulanmıyor
- **Önem:** orta · **Kategori:** mimari / yetki
- **Kanıt:** `results/route.ts:15` (`requireAuth(['DEALER','ADMIN'])`) ve `:27` (admin istisnası yok); karşılaştır `app/api/dealer/surveys/[id]/route.ts:23,39-40` (admin istisnası var). Liste ucu da admin için yalnız kendi `dealerId`'sine bakıyor (`app/api/dealer/surveys/route.ts:31`). Modül: `components/dashboard/sidebar.tsx:259` `moduleKey: 'dealer_surveys'`, `lib/module-controls.ts:45`; üç surveys route'unun hiçbirinde `assertModuleEnabled` yok (`lib/module-gate.ts:92`).
- **Sorun:** Admin destek amacıyla bir bayinin anket sonucunu inceleyemiyor (her zaman 404), ama aynı admin o anketi silebiliyor — yetki modeli ters. Admin "Anketler" modülünü bayiler için kapattığında yalnız menü gizleniyor, doğrudan URL ve API çalışıyor.
- **Profesyonel öneri:** Ya ADMIN'i bu uçtan çıkar ya da açıkça destekle (admin istisnası + denetim kaydı + admin panelinde ayrı salt-okunur görünüm). Tüm `app/api/dealer/surveys/**` uçlarına `assertModuleEnabled('dealer_surveys', { role: 'dealer', request, userId })` ekle; sayfa tarafında modül kapalıysa "Bu modül işletmeniz için kapalı" boş durumu göster. Ortak bir `requireDealerSurvey(id)` yardımcısı sahiplik + modül + rol mantığını tek yerde toplamalı.
- **Efor:** S

### 5. Paylaşılan `Progress` bileşeni değeri Radix'e iletmiyor
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** `components/ui/progress.tsx:16` (`value` destructure ediliyor), `:18-25` (`Root`'a yalnız `{...props}` gidiyor); Radix varsayılanı `value = null` → `aria-valuenow` yok, `data-state="indeterminate"` (`node_modules/@radix-ui/react-progress/dist/index.mjs:16,35,70`).
- **Sorun:** Bu sayfadaki her seçenek çubuğu ekran okuyucuda "ilerleme çubuğu, belirsiz" olarak okunur; hangi seçeneğe ait olduğu da söylenmez (erişilebilir ad yok). Bileşen paylaşıldığı için sorun uygulama geneline yayılıyor.
- **Profesyonel öneri:** `Progress` içinde `value`'yu `Root`'a da ilet. Bu sayfada çubuklar aslında "ilerleme" değil "oran" gösterdiğinden semantik olarak `role="meter"` veya görsel çubuğu `aria-hidden` yapıp metni ("Evet: 42 yanıt, %63") okunur bırakmak daha doğru. Seçenek listesi `<ul>` / `<li>` olarak işaretlenmeli.
- **Efor:** S

### 6. Puan sorusunun sunumu zayıf ve kısmen yanıltıcı
- **Önem:** orta · **Kategori:** UX / görsel
- **Kanıt:** `page.tsx:101` (ham `qr.avg`, yerelleştirme yok, "/5" yok), `:103` (boş yıldız `text-muted/30`; `app/globals.css:22,62` `--muted` açık temada %95, koyu temada %14 açıklık → arka planla neredeyse aynı), `:105-111` (dağılım düz metin), `results/route.ts:57-58` (1–5 dışı anahtarlar sayılıyor ama gösterilmiyor).
- **Sorun:** Bayi, 4,3 ortalamanın "5 üzerinden" olduğunu ancak yıldızlardan çıkarabiliyor; boş yıldızlar görünmediği için 3 yıldız ile 5 yıldız ilk bakışta karışabilir (WCAG 1.4.11, grafik nesneler için 3:1). Dağılımın en çok bilgi taşıyan kısmı (ör. kutuplaşma: çok 1 ve çok 5) düz metinde kayboluyor.
- **Profesyonel öneri:** Puan kartını "ortalama (Intl.NumberFormat ile, `4,3 / 5`) + yatay yığılı dağılım çubuğu (5→1, renk skalası) + memnun oranı (4–5 ★ yüzdesi, CSAT)" olarak yeniden kur. Boş yıldızlar `text-muted-foreground/30` (doldurma sayfasıyla aynı) veya kontur. Aralık dışı değerler ya engellenmeli (Bulgu 1) ya da "geçersiz" olarak ayrıca sayılmalı.
- **Efor:** S

### 7. Açık uçlu yanıtlar 20 ile sessizce kesiliyor; bağlam ve analiz yok
- **Önem:** orta · **Kategori:** işlevsellik / UX
- **Kanıt:** `results/route.ts:64` (`recentTexts: texts.slice(0, 20)`), `page.tsx:78` (sayaç tüm yanıtları gösteriyor), `:115-121` (tarih, sayfalama, arama yok; `key={j}`).
- **Sorun:** Kart "340 yanıt" derken yalnız 20 yanıt gösteriyor ve bunun "en yeni 20" olduğunu söylemiyor; geri kalan 320 yanıta hiçbir yoldan ulaşılamıyor. Anketin en değerli niteliksel verisi kayboluyor.
- **Profesyonel öneri:** Ayrı, cursor sayfalı uç + "Tümünü gör" çekmecesi (Sheet) içinde arama, tarih ve (izin verilmişse) yanıtlayan kişiye bağlantı. Üstüne mevcut AI altyapısıyla tema/duygu özeti: "En sık 5 tema" çipleri ve her temaya tıklayınca ilgili yanıtlar. Özet, yanıt sayısı eşiği aşınca arka planda üretilip önbelleğe alınmalı (her açılışta LLM çağrısı değil).
- **Efor:** M

### 8. Sayfa yalnız "okuma" ekranı: anket yönetimi ve dağıtımı bu sayfadan yapılamıyor
- **Önem:** düşük · **Kategori:** bilgi mimarisi
- **Kanıt:** `page.tsx:64` (salt okunur rozet), `:67-68` (boş durumda CTA yok); kopyala/aç-kapat yalnız liste sayfasında (`app/dealer/surveys/page.tsx:58-61,112-118`); açıklama ve tarih API'den gelip kullanılmıyor (`results/route.ts:69`).
- **Sorun:** Henüz yanıt almamış bir anketin sahibi bu ekranda ne yapacağını bilmiyor; paylaşmak için listeye dönmek zorunda. Anket düzenleme ise hiç yok (yalnız başlık/açıklama PATCH'i var, `app/api/dealer/surveys/[id]/route.ts:28-32`).
- **Profesyonel öneri:** Başlık şeridine "Bağlantıyı kopyala", "QR indir" (mevcut QR modülüne bağlanarak), "Aktif/Pasif" anahtarı ve "Sonuçları dışa aktar" aksiyonlarını taşı; boş durumda aynı aksiyonları birincil CTA olarak göster; açıklama ve "X gündür yayında" bilgisini başlık altına ekle.
- **Efor:** S

### 9. Seçim sorularında yüzde tabanı ve atlanan yanıtlar belirsiz
- **Önem:** düşük · **Kategori:** veri sunumu
- **Kanıt:** `page.tsx:85` (`count / qr.totalAnswers`), `results/route.ts:51` (`totalAnswers` = soruyu yanıtlayanlar), `results/route.ts:70` (`totalResponses` ayrı).
- **Sorun:** Çok seçimli soruda yüzdeler toplamı %100'ü aşar; zorunlu olmayan sorularda kaç kişinin soruyu atladığı görünmez. Bayi "%63" değerini neyle kıyaslayacağını bilemez.
- **Profesyonel öneri:** Kart alt satırında "Yanıtlayan: 42 / 67 (25 atladı)" ve çok seçimde "Birden fazla seçilebilir — yüzdeler yanıtlayan kişiye göre" ipucu. Likert türü sorularda sıralamayı orijinal seçenek sırasında tut (`page.tsx:84` her zaman sayıya göre sıralıyor).
- **Efor:** S

### 10. Küçük tutarlılık/i18n sorunları
- **Önem:** düşük · **Kategori:** kod kalitesi / i18n
- **Kanıt:** `page.tsx:62,78` (`.replace('{count}')` — `useAppT` değişkenleri zaten destekliyor, `lib/app-locale.tsx:59`); `messages/en.json` `dealerSurveyResults.answersCount: "{count} responses"` (tekil yok); `page.tsx:54-56` ikon-yalnız link; `page.tsx:77` + `components/ui/card.tsx:44` (`h1` → `h3`, `h2` atlanıyor); `app/dealer/surveys/layout.tsx:4-6` (sekme başlığı anket adını içermiyor); API hata mesajları sabit Türkçe (`results/route.ts:28,75`).
- **Profesyonel öneri:** `t(key, { count })` + ICU/çoğul anahtarları; geri bağlantısına `aria-label={t('common.back')}`; soru başlıklarını `h2` yap; `generateMetadata` ile anket adını sekme başlığına koy (sunucu bileşeni sarmalayıcı ile); API hatalarını kod (`SURVEY_NOT_FOUND`) olarak döndürüp istemcide çevir.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Zaman boyutu ve filtreler** (Qualtrics, Medallia, Google Forms): tarih aralığı, şube/QR kaynağı, tamamlanma durumu filtresi ve günlük yanıt trend grafiği; ankete "dönem karşılaştırma" (bu hafta vs geçen hafta).
2. **Tekil yanıt görünümü** (Google Forms "Bireysel", Typeform "Responses"): yanıt yanıt gezinme, tek yanıtı silme/işaretleme (spam), izin varsa müşteri profiline (`SurveyResponse.userId`) bağlantı ve o müşteriye kampanya/teşekkür aksiyonu.
3. **Dışa aktarma ve entegrasyon**: CSV/XLSX (ham + özet), PDF rapor, haftalık e-posta özeti; Square/Toast panellerindeki gibi "raporu paylaş".
4. **AI metin analizi** (Qualtrics Text iQ, Medallia Athena): açık uçlu yanıtlarda tema, duygu, öne çıkan alıntılar ve "bu hafta ne değişti" özeti — üründe zaten var olan AI içgörü hattına bağlanarak.
5. **Çapraz tablo / kırılım** (Qualtrics Crosstabs): "Hizmetten memnun olmayanlar hangi seçeneği seçti?" gibi iki soru arası ilişki; seçeneğe tıklayınca diğer soruları o kitleye göre filtreleme.
6. **Dağıtım ve tamamlanma metrikleri** (Typeform, SurveyMonkey): görüntülenme, başlama, tamamlama oranı, soru bazında terk; bunun için `fill` GET ucunda görüntülenme sayacı gerekir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi ankete tıkladığında 5 saniyede "Anket iyi gidiyor mu, müşteriler ne diyor, ne yapmalıyım?" sorularına cevap alır; yanıt toplamak için gereken aksiyonlar (paylaş, QR, aç/kapat) ve sonuçla yapılacak aksiyonlar (dışa aktar, kampanya oluştur, AI özetini oku) aynı ekrandadır.

**Yerleşim:**
- Rota: `/dealer/surveys/[id]` (genel bakış) ile `results` birleşik bir **Anket detay merkezi**; sekmeler: *Özet* · *Yanıtlar* · *Paylaşım* · *Ayarlar*. Mevcut `/results` yolu `?tab=summary`'ye yönlendirilir.
- Üst şerit: başlık, açıklama, durum anahtarı, "X gündür yayında", aksiyonlar (Bağlantıyı kopyala, QR, Dışa aktar).
- KPI satırı (4 kart): Toplam yanıt · Son 7 gün (mini sparkline) · Ortalama puan / CSAT · Tamamlama oranı (görüntülenme verisi eklendiğinde).
- Filtre çubuğu (yapışkan): tarih aralığı, kaynak/QR, "yalnız tam yanıtlar"; filtreler URL parametresinde (paylaşılabilir).
- Soru kartları: tipine özel görselleştirme — seçim: orijinal sırada yatay çubuklar + "yanıtlayan/atlayan"; puan: ortalama + yığılı dağılım + CSAT; açık uçlu: AI tema çipleri + 3 öne çıkan alıntı + "Tümünü gör" çekmecesi.
- *Yanıtlar* sekmesi: sanal liste (cursor sayfalı), tek yanıt detayı, spam işaretleme.

**Motion / 3D:** Bu sayfa analitik bir ekran; 3D gereksiz. Ölçülü motion: kartların mevcut kısa girişi korunur; çubuklar ve dağılım ilk görünümde 300–400 ms genişlik animasyonu (`Progress` zaten CSS geçişi ve `motion-reduce` destekli); filtre değişiminde sayıların kısa "sayaç" geçişi; sekme geçişlerinde `layoutId` ile alt çizgi. Hepsi global `reducedMotion="user"` altında kalır. Yükleme için içerik iskeleti (KPI + 3 kart) spinner'ın yerini alır.

**Veri / API değişiklikleri:**
- `POST /api/surveys/[id]/fill`: soru tanımına göre sıkı doğrulama, kişi/cihaz başına tek yanıt, bot sinyali (Bulgu 1).
- `GET /api/dealer/surveys/[id]/summary?from&to&source`: Postgres `jsonb` toplama ile tek sorgu; Redis önbelleği (`survey:{id}:summary:{hash(filtre)}`), yeni yanıtta geçersiz kılma.
- `GET /api/dealer/surveys/[id]/responses?cursor&questionId&q`: sayfalı ham yanıtlar ve açık uçlu metinler.
- `GET /api/dealer/surveys/[id]/export?format=csv`: akış (stream) ile dışa aktarma.
- `POST /api/dealer/surveys/[id]/insights`: eşik aşıldığında arka planda AI tema/duygu özeti, sonuç tabloda saklanır.
- Şema: `SurveyResponse`'a `source` (QR/link), `completedAt`, `flagged` alanları; isteğe bağlı `SurveyView` (görüntülenme) tablosu; `@@index([surveyId, createdAt])`.
- Tüm uçlarda ortak `requireDealerSurvey(id)` (sahiplik + `assertModuleEnabled('dealer_surveys')` + rol).

---

## Çakışmalar / birleştirme önerisi

- Doğrudan amaç çakışması olan başka bir bayi sayfası bulunmadı: anket yanıtları, ana geri bildirim (`Feedback`) ve AI içgörü hattından tamamen ayrı bir veri modelinde (`Survey*`, `prisma/schema.prisma:2598-2635`) tutuluyor ve `/dealer/analytics`, `/dealer/ai-insights`, `/dealer/voc-wall` gibi sayfalara hiç beslenmiyor.
- **Birleştirme önerisi:** `/dealer/surveys/[id]/results` tek başına yaşamamalı; `/dealer/surveys/[id]` altında sekmeli "Anket detay merkezi"ne dönüşmeli (liste sayfasındaki kopyala/aç-kapat/sil aksiyonları da buraya taşınmalı, liste yalnız gezinme + özet rozetleri göstermeli).
- **Sistem içi entegrasyon:** Açık uçlu anket yanıtları VoC duvarına ve AI içgörü hattına opsiyonel kaynak olarak eklenmeli; puan soruları işletme genel memnuniyet metriğine (yalnız işaretlenmiş "CSAT sorusu" ise) katkı verebilmeli. Böylece anket modülü ayrı bir ada olmaktan çıkar.

---

## Doğrulama (şüpheci inceleme)

### İddia 1 — "Anonim kullanıcı anket sonuçlarını çarpıtabiliyor / sahte seçenek enjekte edebiliyor"

**Karar: DOĞRULANDI** (ciddiyet: veri bütünlüğü sorunu; gerçek ama "kritik" değil — orta/yüksek arası)

**Kod okuması:**
- `app/api/surveys/[id]/fill/route.ts:53-56`: `value` yalnız `z.union([z.string(), z.array(z.string()), z.number()])`; uzunluk, aralık, eleman sayısı sınırı yok. `questionId` da yalnız `z.string()`.
- `fill/route.ts:100-106`: tek sunucu kontrolü, zorunlu soru kimliklerinin gövdede bulunması. Değerin soru tipine (`SurveyQuestion.type`, `prisma/schema.prisma:2617`) veya `options` listesine (`schema.prisma:2619`) uyup uymadığı hiç kontrol edilmiyor; ankete ait olmayan `questionId`'ler de olduğu gibi `answers` JSON'una yazılıyor (`fill/route.ts:108-114`).
- POST oturum istemiyor (`fill/route.ts:87-89`, oturum yoksa `userId = null`); `proxy.ts` içinde `/api/surveys` için ek koruma yok (grep: eşleşme yok). Anket kimliği herkese açık `/surveys/[id]` sayfasının (`app/surveys/[id]/page.tsx:46,84`) URL'inde, yani QR/bağlantıyı gören herkes biliyor.
- Tek koruma `survey-fill:${id}:${ip}` için 10 istek/dk (`fill/route.ts:72-79`); kişi/cihaz başına tekil yanıt kısıtı yok (`SurveyResponse`'ta unique yok, `schema.prisma:2626-2635`).
- Toplama tarafı (`app/api/dealer/surveys/[id]/results/route.ts`): seçim sorularında her gelen string koşulsuz yeni `optionCounts` anahtarı (`:44-49`), soru tipine bakmadan dizi değerinin her elemanı sayılıyor (`:45-46`, `single_choice` dahil); puan sorusunda `Number(value)` sadece `NaN` eleniyor, 1–5 aralığı yok (`:55-58`).
- Sayfa bunları olduğu gibi çiziyor: `page.tsx:84-95` tüm `optionCounts` anahtarlarını çubuk olarak, `page.tsx:101-110` ortalamayı ve yalnız 1–5 dağılımını gösteriyor.

**Yeniden üretim senaryosu (kodla izlenmiş, çalıştırılmadı):**
1. Bayinin herkese açık anket bağlantısından `id` alınır; `GET /api/surveys/{id}/fill` soru kimliklerini ve tiplerini döndürür (`fill/route.ts:38-44`).
2. Oturumsuz `POST /api/surveys/{id}/fill` ile gövde: rating sorusu için `{"questionId":"<ratingQ>","value":1000000000}`, single_choice sorusu için `{"questionId":"<choiceQ>","value":["A","B","C","Rakip X'e gidin"]}`.
3. Bayi `/dealer/surveys/{id}/results` sayfasını açtığında: ortalama ~1e9 (gerçek yanıtlar tamamen silikleşir), `Math.round(avg) >= s` olduğundan 5 yıldızın hepsi dolu (`page.tsx:103`), 1★–5★ dağılımı bu yanıtı içermez (toplamlar `totalAnswers` ile tutmaz); seçim sorusunda "Rakip X'e gidin" adlı yeni bir çubuk belirir ve tek yanıt dört seçeneğe sayıldığı için yüzdeler toplamı %100'ü aşar (`page.tsx:85`). Uzun bir string (gövde boyutu sınırı dışında sınır yok) kart düzenini de bozar.
4. 10/dk IP limiti sınırlı bir dağıtık saldırıda (veya tek IP'den saatlerce) sonucu kalıcı olarak kirletir; bayinin tekil yanıt silme aracı yok, kirli veri temizlenemez.

**Doğrulanan sınırlar (şişirmemek için):**
- XSS yok: React metni kaçışlıyor (`page.tsx:89,118`), `dangerouslySetInnerHTML` kullanılmıyor.
- Puan/ekonomi etkisi yok: `surveyResponse` yalnız `fill/route.ts:108`'de yazılıyor, hiçbir ödül/puan akışına bağlı değil (repo genelinde grep). Etki, bayinin kendi analitiğinin bütünlüğüyle sınırlı.
- Başka bayinin verisine erişim yok: sonuç ucu `requireAuth` + `survey.dealerId !== auth.session.user.id` ile sahiplik kontrolü yapıyor (`results/route.ts:15-29`).
- Rate-limit anahtarındaki IP, `x-forwarded-for` ilk değerinden geliyor (`lib/request-metadata.ts:15-21`); Vercel arkasında bu başlık platformca yazıldığından IP sahteciliği ile limiti aşma iddiası burada DOĞRULANMADI, bulgunun özü de buna dayanmıyor.

**Önerilen düzeltme yaklaşımı:**
- `fill` POST'unda soru tanımına göre ayrıştırılmış doğrulama: ankete ait olmayan `questionId` reddi, aynı soru için yinelenen cevap reddi; `rating` → `z.number().int().min(1).max(5)`; `single_choice` → tek string ve `options` içinde olmalı; `multiple_choice` → `options` alt kümesi, tekrarsız; `open_text` → string, örn. en fazla 2000 karakter, trim. Doğrulanmış/normalize edilmiş değer kaydedilmeli (ham gövde değil).
- Savunmayı derinleştirmek için toplama ucunda da aynı kuralları uygula: bilinmeyen seçenekleri ve aralık dışı puanları yok say (eski kirli kayıtlar da otomatik süzülür); `single_choice` için dizi değeri sayma.
- Tekrar yanıtı azaltmak: oturumlu kullanıcıda `(surveyId, userId)` tekilliği, anonimde imzalı/httpOnly cihaz çerezi + IP/gün limiti; bayiye "yanıtı spam olarak işaretle/sil" aracı (yeniden tasarımın *Yanıtlar* sekmesi).
