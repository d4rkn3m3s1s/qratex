# /admin/ai-detailed

**Amaç:** Platform genelindeki (tüm işletmeler) metinli geri bildirimlerin LLM çıktılarından (Experience Signals: niyet, aciliyet, efor, churn riski; NER varlıkları; temalar; duygular; aksiyon önerileri; puan × duygu) türetilmiş özet istatistikleri tek ekranda göstermek.

**Genel puan:** 4.5 / 10 · **Karar:** **birleştir** (`/admin/ai-dashboard` altına "Sinyaller" sekmesi olarak taşınmalı; uç nokta güvenlik ve doğruluk açısından yeniden yazılmalı)

Kapsam: `app/admin/ai-detailed/page.tsx` (364 satır, tek istemci bileşeni), `app/admin/layout.tsx`, `components/admin/admin-premium-hero.tsx`, `components/ui/card.tsx`, `components/providers.tsx` (QueryClient + MotionConfig), `proxy.ts`, API `app/api/ai/detailed/route.ts` (234 satır), `prisma/schema.prisma` (`Feedback`, `ActionItem`, `Role`), `lib/ai-engine.ts` (alan anlamları/prompt), `lib/api-auth.ts`, `lib/auth.ts`. Kod çalıştırılmadı; tüm bulgular kod okunarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Veriyi gösteriyor ama hiçbir şeyle etkileşime izin vermiyor (filtre, zaman aralığı, işletme seçimi, detaya inme, aksiyona dönüştürme yok); aciliyet kovaları ve "Toplam" sayısı yanlış. |
| UX | 4/10 | Hata durumu "Veri bulunamadı" ile maskeleniyor, Yenile düğmesi geri bildirim vermiyor, ölçekler (/10, %, yıldız) tutarsız, renk kodlu çubukların açıklaması (legend) yok. |
| Görsel | 6/10 | Panel diliyle (AdminPremiumHero + cam kartlar) tutarlı ve temiz; ancak emoji (👍👎), ham İngilizce etiketler ve nötr renk tutarsızlıkları cilayı düşürüyor. |
| Mimari | 4/10 | Uç nokta reddetme listesiyle (deny-list) yetkilendiriyor → STAFF rolü tüm platformu görüyor; 6.000 satırlık JSON'u her istekte belleğe çekip JS'te topluyor; admin için kullanılmayan 50 ham geri bildirim döndürüyor; 11 kullanılmayan import. |
| Performans | 4/10 | Önbelleksiz `force-dynamic`, her açılışta 6.000 satır × 4 JSON sütunu + 50 tam metin; SQL toplama veya anlık görüntü (snapshot) yok. |
| Erişilebilirlik + mobil | 4/10 | İlerleme çubuklarında `role="progressbar"`/aria yok, puan seviyesi yalnızca yıldız ikonlarıyla (ekran okuyucu "1 yıldız"ı duyamaz), anlam yalnızca renkle; mobilde 5'li puan grafiği 2 sütuna kırılıp karşılaştırılamaz hâle geliyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim kontrolü (yalnız ADMIN + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:50-88` | `/admin/*` ADMIN rolü + `admin_gate` HMAC çerezi ister. |
| 2 | API yetkilendirmesi (`/api/ai/detailed`) | BOZUK | `app/api/ai/detailed/route.ts:24-37` | Yalnızca CUSTOMER reddediliyor; STAFF filtrelenmeden platform geneli veri alıyor (Bulgu 1). |
| 3 | Veri çekme (React Query, `staleTime` 60 sn) | KISMİ | `page.tsx:64-73` | `res.ok` kontrolü yok; hata `isError` ile ele alınmıyor. |
| 4 | Yükleniyor durumu (spinner + metin) | ÇALIŞIYOR | `page.tsx:77-84` | Skeleton yok; düzen kayması (layout shift) oluşuyor. |
| 5 | Hata durumu | BOZUK | `page.tsx:86-88` | 401/403/500 → "Veri bulunamadı"; hata mesajı ve tekrar dene yok (Bulgu 5). |
| 6 | Boş veri durumu | KISMİ | `page.tsx:216, 244, 281, 306` | Dört kart koşullu kayboluyor, ortalama kartları "0.0/10" yeşil gösteriyor (sağlıklı gibi). |
| 7 | Hero: başlık, eyebrow, açıklama, ikon | ÇALIŞIYOR | `page.tsx:96-104` | Açıklama "derin öğrenme metrikleri" diyor; gerçekte LLM çıktılarının sayımı (abartılı iddia). İkon `Shield` konuyla ilgisiz. |
| 8 | Hero "Yenile" düğmesi | KISMİ | `page.tsx:105-108` | `refetch()` çalışıyor ama `isFetching` gösterilmiyor, başarı/hata geri bildirimi yok. |
| 9 | Hero "Toplam" sayacı | BOZUK | `page.tsx:113-114`, `route.ts:67, 222` | Aslında son 6.000 metinli kaydın örneklem boyutu; 6.000'i aşınca sabit kalır (Bulgu 3). |
| 10 | Hero "Analiz edilmiş" sayacı | KISMİ | `page.tsx:117-118`, `route.ts:202` | Aynı 6.000'lik örneklem içinden; "intent veya urgency dolu" tanımı UI'da açıklanmıyor. |
| 11 | Ort. Aciliyet kartı (/10) | KISMİ | `page.tsx:127`, `route.ts:104-105` | Hesap doğru; eşik (>0.5 kırmızı) açıklanmıyor; veri yokken 0 → yeşil. |
| 12 | Ort. Efor Skoru kartı (/10) | KISMİ | `page.tsx:128`, `route.ts:100-101` | Aynı sorunlar. |
| 13 | Ort. Churn Riski kartı (%) | KISMİ | `page.tsx:129`, `route.ts:108-109` | Ölçek diğer iki karttan farklı (% vs /10). |
| 14 | Niyet Dağılımı (5 çubuk) | ÇALIŞIYOR | `page.tsx:149-168`, `route.ts:72-75` | Etiketler Türkçe; yalnızca adet, yüzde yok. |
| 15 | Aciliyet Dağılımı (4 kova) | BOZUK | `route.ts:80-85` vs `lib/ai-engine.ts:211-216` | Kova sınırları prompt'taki çapa değerleriyle bir kademe kayık (Bulgu 2). |
| 16 | Churn Risk Dağılımı (4 kova) | KISMİ | `route.ts:89-97`, `page.tsx:196-201` | Hesap tutarlı; "Düşük" mavi iken aciliyette "Düşük" yeşil (renk semantiği tutarsız). |
| 17 | Varlık Tanıma (NER) listesi (ilk 12) | KISMİ | `page.tsx:216-241`, `route.ts:112-132` | Tür ham İngilizce (`product`, `person`); emoji ile oran; `neuRate` hiç kullanılmıyor; 25 dönüyor 12 gösteriliyor; tıklanamaz. |
| 18 | Tema Analizi (ilk 10, yığılmış duygu çubuğu) | KISMİ | `page.tsx:244-275`, `route.ts:164-184` | `avgScore * 5` yıldız ikonu ile "puan" gibi sunuluyor; skor anlamı farklı (Bulgu 6); nötr genişlik negatif olabilir. |
| 19 | AI Aksiyon Önerileri (ilk 10) | KISMİ | `page.tsx:281-303`, `route.ts:146-161` | Öncelik ham İngilizce rozet; birebir metin eşleşmesiyle tekilleştirme → sayaç neredeyse hep "1x"; `category` gösterilmiyor; görev/ActionItem'a çevirme yok. |
| 20 | Duygu Haritası (ilk 10) | KISMİ | `page.tsx:306-324`, `route.ts:135-143` | Etiketler ham İngilizce (`happy`, `frustrated`… `lib/ai-engine.ts:195`); "harita" değil yatay çubuk listesi. |
| 21 | Puan Dağılımı (1-5 sütun grafik) | ÇALIŞIYOR | `page.tsx:328-361`, `route.ts:187-190` | Yalnız metinli geri bildirimler sayılıyor (puan-only kayıtlar yok) — UI'da belirtilmiyor. |
| 22 | Puana göre duygu mini çubuğu | KISMİ | `page.tsx:350-354`, `route.ts:193-200` | Legend yok; sıra (poz/nötr/neg) tema çubuğundan (poz/neg/nötr) farklı; nötr rengi `blue-400` vs `blue-300`. |
| 23 | Giriş animasyonları (framer `m`) | ÇALIŞIYOR | `page.tsx:52-57, 133, 149…` | Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) transform'ları kapatır; ancak width/height animasyonları (çubuklar) azaltılmış harekette de oynar. |
| 24 | Mobil yerleşim | KISMİ | `page.tsx:125, 147, 214, 332` | Kartlar yığılıyor; puan grafiği `grid-cols-2` ile 3 satıra bölünüyor (2+2+1). |
| 25 | Zaman aralığı filtresi | EKSİK | — | Örneklem "son 6.000 kayıt", tarih seçimi yok. |
| 26 | İşletme/segment/sektör filtresi | EKSİK | — | Admin tüm platformu tek kütle olarak görüyor. |
| 27 | Detaya inme (varlık/tema/aksiyon → geri bildirim listesi) | EKSİK | — | Hiçbir satır tıklanamaz. |
| 28 | Dönem karşılaştırması / trend | EKSİK | — | Tek anlık görüntü, delta yok. |
| 29 | Dışa aktarma (CSV) | EKSİK | — | — |
| 30 | Aksiyonu göreve/ActionItem'a çevirme | EKSİK | `prisma/schema.prisma:1302-1322` | `ActionItem` modeli (`sourceModule: ai_aggregate`) mevcut ama bağlanmamış. |
| 31 | Veri tazeliği ("son hesaplama" zamanı) | EKSİK | — | — |
| 32 | i18n (TR/EN) | EKSİK | `messages/en.json:2493` | Menü etiketi çevrilmiş, sayfa içeriği sabit Türkçe. |
| 33 | `toast` + 10 ikon + `CardDescription` importu | ÖLÜ KOD | `page.tsx:13-27, 30, 32` | `ThumbsUp, ThumbsDown, Minus, BarChart3, Zap, Eye, FileText, MessageSquare, CheckCircle2, CardDescription, toast` kullanılmıyor. |
| 34 | API'nin döndürdüğü `feedbacks` (50 tam metin + kullanıcı adı) | ÖLÜ YÜK (admin için) | `route.ts:42-54, 207` | Admin sayfası kullanmıyor; yalnız dealer `ai-insights-client.tsx:360` kullanıyor. |

Özet: ÇALIŞIYOR 5 · KISMİ 16 · BOZUK 4 · SAHTE 0 · EKSİK 8 (ölü kod/yük 2 ayrıca).

---

## Bulgular

### 1. [KRİTİK · Güvenlik/Çok kiracılı izolasyon] STAFF rolü platform genelindeki tüm geri bildirimleri ve kullanıcı adlarını okuyabiliyor
- **Kanıt:** `app/api/ai/detailed/route.ts:24-37` — yalnız `role === 'CUSTOMER'` reddediliyor, kapsam yalnız `DEALER` için daraltılıyor. `prisma/schema.prisma:22-27` dört rol tanımlıyor (`ADMIN, DEALER, CUSTOMER, STAFF`). `proxy.ts:102-118` `/api/*` için rol kontrolü yapmıyor (yalnız başlık ekliyor). `lib/auth.ts:254-256` STAFF'ın bir `dealerId`'ye bağlı işletme personeli olduğunu gösteriyor; diğer uçlar onu `getStaffDealerId` ile daraltıyor (`app/api/dealer/feedbacks/search/route.ts:29-34`).
- **Sorun:** Bir işletmenin çalışanı (STAFF), `GET /api/ai/detailed?limit=100` ile **tüm işletmelerin** son 100 geri bildiriminin tam metnini, AI analizini ve yazan kullanıcının adını (`user: { select: { name } }`, satır 50) ile 6.000 kayıtlık toplam istatistikleri alır. Bu çapraz kiracı veri sızıntısıdır (KVKK açısından kişisel veri).
- **Öneri:** Reddetme listesi yerine izin listesi kullanılmalı: `requireAuth(['ADMIN','DEALER','STAFF'])` + `dealerScopeWhere` ve STAFF için `getStaffDealerId` (`lib/api-auth.ts:130, 158`). Daha iyisi uç noktayı ikiye ayırmak: `/api/admin/ai/signals` (yalnız ADMIN, yalnız toplamlar, ham metin yok) ve dealer için mevcut `/api/ai/detailed` (dealer/staff kapsamlı). Kapsamı test eden bir rol matrisi testi eklenmeli (CUSTOMER 403, STAFF yalnız kendi işletmesi, DEALER yalnız kendi, ADMIN hepsi).
- **Efor:** S

### 2. [YÜKSEK · Veri doğruluğu] Aciliyet kovaları prompt'taki çapa değerleriyle bir kademe kayık
- **Kanıt:** `route.ts:81-84` — `<0.3 low`, `<0.5 medium`, `<0.7 high`, aksi `critical`. Prompt `lib/ai-engine.ts:211-216` LLM'e tam olarak `0.3 = Düşük`, `0.5 = Orta`, `0.7 = Yüksek`, `1.0 = Kritik` çapalarını veriyor.
- **Sorun:** LLM'ler çapa değerlerini birebir üretme eğilimindedir; 0.3 "Orta", 0.5 "Yüksek", 0.7 "Kritik" kovasına düşer. Sonuç: aciliyet dağılımı sistematik olarak bir kademe kötümser görünür; "Kritik" sütunu şişer ve yönetici yanlış alarm görür.
- **Öneri:** Kova sınırlarını çapaların ortasına taşı (ör. `<0.15 yok/çok düşük`, `<0.4 düşük`, `<0.6 orta`, `<0.85 yüksek`, `≥0.85 kritik`) ve aynı eşikleri tek bir `lib/experience-signals.ts` sabitinde topla; hem bu uç, hem dealer paneli, hem `ai-engine.ts:647`'deki `urgency > 0.5 ACİL` kuralı aynı kaynaktan okusun. Kovalar UI'da eşik değerleriyle (tooltip) gösterilsin.
- **Efor:** S

### 3. [YÜKSEK · Veri doğruluğu] "Toplam" aslında 6.000'e kırpılmış örneklem; puan-only kayıtlar hiç sayılmıyor
- **Kanıt:** `route.ts:13` (`AI_DETAILED_AGG_SAMPLE_MAX = 6_000`), `route.ts:59` (`text: { not: null }`), `route.ts:67` (`take`), `route.ts:222` (`totalFeedbacks: allFeedbacks.length`); `page.tsx:113-114` bunu "Toplam" olarak gösteriyor.
- **Sorun:** Platform 6.000 metinli geri bildirimi geçtiği an "Toplam" donar; tüm ortalamalar ve dağılımlar yalnız son 6.000 kayda aittir ama bu hiçbir yerde söylenmiyor. Puan dağılımı da (`page.tsx:328`) yalnız metinli kayıtları kapsıyor; `/admin/analytics` gibi sayfalardaki puan dağılımıyla tutarsız çıkacaktır.
- **Öneri:** Toplamları `prisma.feedback.count/groupBy` ile tam veri üzerinde hesapla (indeksler mevcut: `@@index([intent])`, `@@index([rating])`, `@@index([sentiment])` — `schema.prisma:841-848`). JSON alanları için SQL tarafında `jsonb_array_elements` ile toplama yap veya günlük cron'la `AiSignalSnapshot` tablosuna yaz. UI'da "Kapsam: 1 Tem – 8 Eki · 12.430 geri bildirim · 9.812 analiz edilmiş · son hesaplama 14:05" şeklinde açık bir kapsam satırı göster.
- **Efor:** M

### 4. [YÜKSEK · Veri bütünlüğü] Soft-delete edilmiş geri bildirimler istatistiklere dahil
- **Kanıt:** `route.ts:34` ve `route.ts:57-60` `deletedAt` filtresi içermiyor; `schema.prisma:830` `deletedAt` soft delete alanı; diğer uçlar `deletedAt: null` kullanıyor (`app/api/admin/feedbacks/route.ts:37`, `app/api/dealer/analytics/route.ts:150`).
- **Sorun:** Admin'in silerek (spam, toksik, sahte) moderasyonla temizlediği kayıtlar niyet/duygu/aksiyon istatistiklerini kirletmeye devam eder; dealer tarafında silinmiş geri bildirimler `feedbacks` listesinde yeniden görünür.
- **Öneri:** Her iki sorguya `deletedAt: null` ekle; ayrıca `isToxic: true` kayıtları ayrı bir sayaçta göster ve dağılımlardan hariç tutma seçeneği sun. Feedback sorguları için ortak `activeFeedbackWhere()` yardımcısı tanımla.
- **Efor:** S

### 5. [ORTA · Hata yönetimi/UX] Hata durumu "Veri bulunamadı" ile maskeleniyor, yeniden deneme yok
- **Kanıt:** `page.tsx:66-70` `res.ok` kontrolü yok, `isError`/`error` kullanılmıyor; `page.tsx:86-88` her durumda "Veri bulunamadı". `components/providers.tsx:212` `retry: 1`.
- **Sorun:** Neon kesintisi (500), oturum düşmesi (401) veya yetki hatası boş veriyle aynı görünür; operatör sistemin bozuk olduğunu anlayamaz.
- **Öneri:** `isError` için ayrı bir hata kartı (hata kodu, mesaj, "Tekrar dene" düğmesi → `refetch`), 503 için `responseIfDatabaseUnavailable` (`lib/api-http.ts:18`) kullanılarak "veritabanı geçici olarak erişilemiyor" mesajı; gerçek boş durum için "Henüz AI ile analiz edilmiş geri bildirim yok → AI Ayarları'na git" CTA'sı.
- **Efor:** S

### 6. [ORTA · Veri sunumu] Tema skoru yıldız puanı gibi sunuluyor
- **Kanıt:** `page.tsx:261` `<Star/> {(theme.avgScore * 5).toFixed(1)}`; skor tanımı `lib/ai-engine.ts:236` "score: 0-1" (anlamı belirsiz; örnekte `0.9` pozitif tema için); `route.ts:171` eksik skoru `0` sayıyor, `ai-engine.ts:380` ise `0.5` varsayıyor.
- **Sorun:** Okuyucu "Personel 4.5★" görünce müşteri puanı sanır; oysa bu LLM'in tema yoğunluk/güven skorudur. Eksik skorların 0 sayılması da ortalamayı aşağı çeker.
- **Öneri:** Tema satırında gerçek müşteri puanı ortalamasını (ilgili geri bildirimlerin `rating` ortalaması) yıldızla göster; LLM skorunu ya hiç gösterme ya da "AI güveni %" olarak ayrı etiketle. Varsayılan değeri tek yerde sabitle.
- **Efor:** S

### 7. [ORTA · Performans/Mimari] Her açılışta 6.000 satır JSON'u belleğe çekip JS'te toplama, önbelleksiz
- **Kanıt:** `route.ts:11` `force-dynamic`, `route.ts:56-68` 6.000 satır × `entities, themes, actionSuggestions, emotions` JSON; `route.ts:40-54` admin için kullanılmayan 50 tam metinli kayıt (+ `statementSentiments`); Redis önbelleği yok (projede Upstash mevcut).
- **Sorun:** Yanıt süresi ve Neon veri transferi geri bildirim hacmiyle doğrusal büyür; her "Yenile" aynı ağır işi tekrarlar. Yanıt `topEntities` 25 / `topThemes` 15 / `topActions` 20 / `topEmotions` 12 döndürüyor, UI 12/10/10/10 kullanıyor.
- **Öneri:** (a) Admin uç noktasını ayır ve `feedbacks` dizisini döndürme; (b) toplamaları SQL'e taşı (`groupBy` + `jsonb_array_elements` raw query) veya `cron` ile saatlik `AiSignalSnapshot` üret ve Redis'te 5-15 dk önbellekle (`Cache-Control: private` korunarak); (c) UI'ın kullandığı adet kadar dön veya "tümünü gör" için sayfalama ekle.
- **Efor:** M

### 8. [ORTA · Ürün değeri] Aksiyon önerileri hiçbir aksiyona bağlanmıyor ve tekilleştirme pratikte çalışmıyor
- **Kanıt:** `route.ts:151` birebir küçük harfli metinle anahtarlıyor; `route.ts:158-161` önce önceliğe sonra sayıya göre sıralıyor; `page.tsx:287-298` satırlar tıklanamaz; `ActionItem` modeli `sourceModule: ai_aggregate` desteğiyle hazır (`schema.prisma:1302-1313`).
- **Sorun:** LLM serbest metni nadiren birebir aynıdır → sayaçlar neredeyse hep "1x"; tek seferlik "critical" öneriler sık tekrarlanan "high" önerilerin önüne geçer. Liste bir "öneri duvarı" olarak kalır, operatör ne yapacağını bilmez.
- **Öneri:** Önerileri embedding/kategori + anahtar kelime ile kümeleyip (`clusterFromExistingThemes` benzeri, `lib/ai-engine.ts:567`) "küme başlığı + kapsadığı işletme sayısı + örnek geri bildirimler" olarak göster; her kümeye "İşletmelere görev olarak ata" (toplu `ActionItem` oluşturma) ve "Ekip görevine çevir" (`/admin/ekip`) aksiyonları ekle. Sıralamayı `öncelik ağırlığı × frekans × etkilenen işletme` skoruyla yap.
- **Efor:** L

### 9. [ORTA · Dil/i18n] Ham İngilizce etiketler ve emoji
- **Kanıt:** `page.tsx:227` varlık türü (`product`, `person`…), `page.tsx:291` öncelik rozeti (`critical`, `high`…), `page.tsx:315` duygu (`happy`, `frustrated`… — `lib/ai-engine.ts:195`), `page.tsx:232-233` 👍/👎 emojisi; sayfada `t()` hiç yok, menü anahtarı ise çevrilmiş (`messages/tr.json:2493`, `messages/en.json:2493`).
- **Sorun:** Türkçe arayüzde İngilizce/Türkçe karışıklığı; EN arayüzde ise başlıklar Türkçe kalır. Emoji, sistem fontuna göre farklı görünür ve ekran okuyucuda "başparmak yukarı" diye okunur.
- **Öneri:** `ENTITY_TYPE_LABELS`, `PRIORITY_LABELS`, `EMOTION_LABELS` sözlüklerini `messages/*.json`'a ekle; sayfayı `useTranslations` ile sar; emoji yerine `ThumbsUp/ThumbsDown` (zaten import edilmiş ama kullanılmıyor) + `sr-only` metin kullan.
- **Efor:** S

### 10. [ORTA · Erişilebilirlik] Grafikler yalnızca renk ve görselle anlam taşıyor
- **Kanıt:** `page.tsx:52-57` ilerleme çubuklarında `role`/`aria-valuenow` yok; `page.tsx:341` puan seviyesi yalnızca yıldız ikonlarıyla; `page.tsx:264-268, 350-354` yığılmış duygu çubuklarında legend ve metin yok; nötr rengi `blue-300` vs `blue-400` ve sıralama farklı.
- **Sorun:** Ekran okuyucu kullanıcı 5 sütundan hangisinin kaç yıldız olduğunu duyamaz; renk körü kullanıcı pozitif/negatif ayrımını yapamaz.
- **Öneri:** Tek bir `<DistributionBar segments=[...] />` bileşeni yaz (sabit sıra: pozitif → nötr → negatif, sabit renk tokenları, `aria-label="Pozitif %62, nötr %20, negatif %18"`, hover tooltip); puan sütunlarına `aria-label="1 yıldız: 42 geri bildirim"` ve görünür "1★" etiketi; her dağılım kartına tablo görünümü (görsel/tablo geçişi) ekle.
- **Efor:** S

### 11. [DÜŞÜK · UX] "Yenile" düğmesi geri bildirim vermiyor; ölçekler tutarsız
- **Kanıt:** `page.tsx:106` yalnız `refetch()`; `isFetching` kullanılmıyor. `page.tsx:127-129` aciliyet ve efor "/10", churn "%"; sunucu verisi 0-1.
- **Öneri:** Düğmede `isFetching` → dönen ikon + `disabled`; başarıda "Güncellendi · 14:05" damgası. Üç KPI'ı tek ölçekte (0-100 skor veya %) ve eşik bandıyla (yeşil/sarı/kırmızı + metin "düşük/orta/yüksek") göster; veri yoksa "—" göster, 0 değil.
- **Efor:** S

### 12. [DÜŞÜK · Kod kalitesi] Ölü importlar, `any` kaçakları, olası negatif genişlik
- **Kanıt:** `page.tsx:13-27, 30, 32` 11 kullanılmayan import; `route.ts:115, 138, 149, 167` `(e: any)`; `page.tsx:267` `100 - posRate - negRate` iki ayrı yuvarlamadan dolayı -1 olabilir (ör. 3/8 → 38, 5/8 → 63).
- **Öneri:** Importları temizle; JSON alanları için `zod` şemalarıyla tip güvenli ayrıştırıcı (`parseEntities`, `parseThemes`…) yaz ve ai-engine ile paylaş; nötr oranı sunucuda `100 - pos - neg` yerine sayıdan hesapla ve `Math.max(0, …)` ile sınırla.
- **Efor:** S

### 13. [DÜŞÜK · Hareket] Azaltılmış harekette çubuk animasyonları sürüyor; liste giriş gecikmeleri birikiyor
- **Kanıt:** `page.tsx:54-55` width animasyonu 1 sn, `page.tsx:344-345` height animasyonu; `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) yalnız transform/layout'u kapatır. Kademeli gecikmeler 0.5 sn + 10×0.05'e kadar uzuyor (`page.tsx:316`).
- **Öneri:** `useReducedMotion()` ile `transition={{ duration: 0 }}`; toplam giriş koreografisini 400 ms ile sınırla (yönetim aracında veri hızlı okunmalı).
- **Efor:** S

---

## Eksik özellikler (kıyas: PostHog, Stripe Dashboard, Linear Insights, Retool)

1. **Zaman aralığı + karşılaştırma:** "Son 7/30/90 gün, özel aralık" ve önceki döneme göre delta (PostHog Insights, Stripe "compare to previous period").
2. **Boyut filtreleri:** İşletme, sektör/kategori, segment, AI modeli/sürümü (`aiModelUsed`, `aiVersion` zaten seçiliyor ama kullanılmıyor — `route.ts:49`).
3. **Detaya inme (drill-down):** Varlık/tema/duygu/aksiyon satırına tıklayınca o sinyali taşıyan geri bildirimlerin listesi (yan panel/drawer) — PostHog "view persons", Linear "view issues".
4. **Trend grafikleri:** Niyet ve aciliyet için zaman serisi (yığılmış alan grafiği), "yükselen tema" tespiti (anomali rozetleri).
5. **Aksiyona dönüştürme:** Öneri kümesinden toplu `ActionItem`/ekip görevi oluşturma ve takibi (Linear benzeri).
6. **Dışa aktarma ve paylaşılabilir görünüm:** CSV/JSON indirme, filtre durumunu URL'de tutma (`?range=30d&dealer=…`) ve kayıtlı görünümler.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 10 saniyede cevap bulmalı: *"Platformda müşteri deneyimi bu dönem iyi mi kötü mü? Kötüleşen ne? Kime ne yaptırmalıyım?"* Mevcut sayfa yalnızca "ne var?" sorusunu cevaplıyor.

**Yerleşim (AI Kontrol sayfasında "Sinyaller" sekmesi olarak):**
1. **Üst çubuk (sticky):** Tarih aralığı seçici, işletme/sektör çoklu seçimi, "toksik/silinmiş hariç" anahtarı, kapsam satırı ("12.430 geri bildirim · %79 analiz edilmiş · son hesaplama 14:05"), Yenile + CSV.
2. **KPI şeridi (4 kart, tek ölçek 0-100):** Aciliyet, Efor, Churn riski, Negatif niyet oranı — her birinde önceki döneme göre delta ve 30 günlük sparkline; veri yoksa "—".
3. **Dağılımlar satırı:** Niyet / Aciliyet / Churn — tek `DistributionBar` bileşeni, yüzde + adet, eşik tooltip'leri, tıklanınca drill-down.
4. **"Ne değişti?" kartı:** Önceki döneme göre en çok artan 5 tema/varlık (anomali rozetiyle) — sayfanın en değerli bilgisi.
5. **İki sütun:** Sol "Temalar & Varlıklar" (tablo görünümü, sıralanabilir sütunlar: adet, gerçek ★ ortalaması, negatif %, etkilenen işletme sayısı); sağ "Aksiyon kümeleri" (küme başlığı, öncelik, etkilenen işletme, "Görev ata" düğmesi).
6. **Alt:** Puan × duygu matrisi (ısı haritası: satır puan, sütun duygu) — "5 yıldız verip negatif yazanlar" gibi tutarsızlıkları vurgular, tıklanınca o geri bildirimler açılır.

**Motion/3D:** 3D gereksiz ve yersiz — bu bir analiz aracı. Motion ölçülü olmalı: yalnızca filtre değişiminde değerlerin `layout` geçişi (200 ms), yeni anomali rozetinde tek seferlik hafif vurgu, `useReducedMotion` ile tamamen kapatılabilir. İlk girişteki kademeli kart animasyonları kaldırılmalı veya 300 ms'ye indirilmeli.

**Veri/API değişiklikleri:**
- Yeni `GET /api/admin/ai/signals?from&to&dealerIds&excludeToxic` — yalnız ADMIN (`requireAuth(['ADMIN'])`), yalnız toplamlar, ham metin yok, `deletedAt: null`.
- Toplamalar SQL'de (`groupBy` + `jsonb_array_elements`) veya cron ile saatlik `AiSignalSnapshot(dealerId, day, metrics jsonb)` tablosu; uç bu tablodan okur, Upstash'te kısa TTL önbellek.
- Drill-down için `GET /api/admin/ai/signals/feedbacks?signal=theme&value=…` (sayfalı, kullanıcı adı maskeli).
- `POST /api/admin/action-items/bulk` — kümeden işletmelere `ActionItem` (`sourceModule: 'ai_aggregate'`).
- Eşikler ve etiket sözlükleri tek modülde (`lib/experience-signals.ts`), dealer paneliyle paylaşılır.
- Mevcut `/api/ai/detailed` dealer/staff kapsamlı uç olarak kalır (izin listesi + `getStaffDealerId`).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-dashboard` ile güçlü çakışma:** O sayfada da "Niyet Dağılımı (Intent)" (`app/admin/ai-dashboard/page.tsx:549-551`), "Tema Kümeleri (Tüm Sistem)" (`:577-579`), "Sistem Duygu Dağılımı" (`:511-513`) ve "En Çok Bahsedilen Konular" (`:546`) var. İki sayfa aynı soruya iki farklı veri kaynağıyla (biri `/api/ai/analyze?action=insights`, diğeri `/api/ai/detailed`) iki farklı cevap verebilir. **Öneri:** `/admin/ai-detailed` kaldırılıp `/admin/ai-dashboard` içinde "Genel bakış · Sinyaller · İşletmeler · Asistan" sekme yapısına "Sinyaller" olarak taşınmalı; eski rota yönlendirmeyle korunmalı.
- **`/admin/ai-quality` ile ikon çakışması:** Menüde ikisi de `Eye` ikonu kullanıyor (`components/dashboard/sidebar.tsx:189, 191`; `app/admin/admin-utils.ts:118, 120`) — birleştirme olmasa bile ayırt edilebilirlik için düzeltilmeli.
- **`/admin/insights`** sektör benchmark'ı gösteriyor (`app/admin/insights/page.tsx:86-87`); Sinyaller sekmesindeki sektör filtresi buraya bağlantı vermeli, ayrı kalabilir.
- **Dealer `ai-insights`** aynı uç noktayı kullanıyor (`app/dealer/ai-insights/ai-insights-client.tsx:360`); güvenlik düzeltmesi (Bulgu 1) dealer akışını bozmamalı — dealer/staff için kapsamlı uç korunmalı, admin için ayrı uç açılmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod, proxy, auth ve Prisma şeması baştan okundu. DB'ye, sunucuya, teste dokunulmadı.

### 1. STAFF rolü `/api/ai/detailed` üzerinden çapraz kiracı veri sızıntısı — **DOĞRULANDI**
- `proxy.ts:105-118`: `/api/*` istekleri `withAuth`'a hiç girmeden `NextResponse.next()` ile geçiyor; rol kontrolü yalnızca uç noktanın kendisinde.
- `app/api/ai/detailed/route.ts:24-29` yalnız `CUSTOMER`'ı reddediyor; `Role` enum'u `ADMIN | DEALER | CUSTOMER | STAFF` (`prisma/schema.prisma:22-27`), yani STAFF içeri giriyor.
- `route.ts:34-37` ve `:57-58` kapsamı yalnız `DEALER` için daraltıyor; STAFF için `where = { text: { not: null } }` — tüm platform.
- STAFF hesapları bir işletmeye bağlı çalışan hesaplarıdır: `app/api/dealer/staff/route.ts:101,126` bayi tarafından `role: 'STAFF'` + `dealerStaff.create({ dealerId })` ile oluşturuluyor; `lib/auth.ts:254-256` token'a `dealerId` koyuyor ama bu uç onu kullanmıyor. Diğer dealer uçları STAFF'ı `dealerId`'ye daraltıyor (ör. `app/api/dealer/feedbacks/search/route.ts:31`), bu uç bu deseni atlamış.
- **Yeniden üretim:** A işletmesinin çalışanı (STAFF) kendi oturumuyla `GET /api/ai/detailed?limit=100` çağırır → yanıtta B, C… işletmelerinin son 100 geri bildiriminin tam `text`'i, `isPublic=false` olanlar dahil, AI çıktıları (`entities`, `actionSuggestions`, `churnRisk`…) ve `user.name` (`route.ts:50`) ile 6.000 kayıtlık platform toplamları gelir. Ek olarak soft-delete'li kayıtlar da gelir (bkz. 4).
- Not: Bir bayinin işten çıkardığı ama hesabı açık kalan çalışan da aynı erişime sahiptir. Düzeltme: izin listesi (`requireAuth(['ADMIN','DEALER','STAFF'])`) + STAFF için `getStaffDealerId` ile `qrCode.dealerId` kapsamı; hiçbir rolün kapsamsız (platform) sonuca düşmemesi için "ADMIN değilse dealerId zorunlu, yoksa 403" kuralı.

### 2. Aciliyet dağılımı sistematik olarak bir kademe yukarı kayık — **DOĞRULANDI (önem: orta, güvenlik değil)**
- Prompt çapaları `lib/ai-engine.ts:210-215`: 0.3=Düşük, 0.5=Orta, 0.7=Yüksek, 1.0=Kritik. Değer ham saklanıyor (`lib/ai-engine.ts:366`, yuvarlama/kalibrasyon yok).
- Kovalar `app/api/ai/detailed/route.ts:81-84`: `<0.3` low, `<0.5` medium, `<0.7` high, else critical. Sınırlar çapalarla çakıştığı ve sol-kapalı olduğu için LLM'in rubriğe sadık kaldığı tam çapa değerleri bir üst kovaya düşüyor: 0.3→Orta, 0.5→Yüksek, 0.7→Kritik.
- **Yeniden üretim:** "Yemek soğuktu, garson ilgisizdi" → LLM rubriğe göre `urgency: 0.7` ("Yüksek, ciddi memnuniyetsizlik") döndürür → admin grafiğinde "Kritik" sütununa sayılır.
- Kesinlik notu: "sistematik" ifadesi yalnızca çapa değerleri için geçerli; ara değerlerin (0.4, 0.6) dağılımı LLM çıktısına bağlı ve canlı veri incelenmedi. Platformda eşikler de tutarsız: `>0.7` (`app/api/admin/dealers-ai-stats/route.ts:101`, `app/admin/ai-dashboard/page.tsx:667`), `>=0.7` (`app/api/ai/analyze/route.ts:513`), `>0.5` "Acil" (`app/customer/ai-insights/page.tsx:588`), `>=0.8` (`lib/incident-detection.ts:138`). Öneri: eşikleri tek modülde (`lib/experience-signals.ts`) tanımlayıp çapaları kova ortasına alan kesimler kullanmak (ör. `<0.2 / <0.4 / <0.6 / <0.85`) ya da prompt'u kova sınırlarına göre yeniden yazmak; tüm yüzeyler aynı fonksiyonu çağırmalı.

### 3. "Toplam" sayısı 6.000'de donuyor, metrikler belirtilmemiş örneklem üzerinde — **DOĞRULANDI (önem: orta, doğruluk/etiketleme)**
- `route.ts:13` `AI_DETAILED_AGG_SAMPLE_MAX = 6_000`, `:59` `text: { not: null }`, `:66-67` en yeni 6.000 kayıt, `:222` `totalFeedbacks: allFeedbacks.length`; `app/admin/ai-detailed/page.tsx:113-114` bunu "Toplam" diye, `:103` sayfayı "Sistem geneli" diye sunuyor.
- Puan-only geri bildirimlerde `text` null kalıyor (`prisma/schema.prisma:772` `String?`, `app/api/feedbacks/route.ts:248` gelen `text` olduğu gibi yazılıyor), dolayısıyla "Toplam" ve "Puan Dağılımı" (`route.ts:187-190`) yalnız yazılı geri bildirimleri kapsıyor — puan dağılımı yazı yazanlara doğru yanlı.
- **Yeniden üretim:** Platformda 9.000 yazılı + 5.000 puan-only geri bildirim varsa hero "Toplam 6000" gösterir; tüm ortalamalar ve dağılımlar son 6.000 kaydın üzerinden hesaplanır, bu hiçbir yerde belirtilmez. Canlı kayıt sayısı (6.000'i aşıp aşmadığı) DB'ye dokunulmadığı için doğrulanmadı; puan-only dışlanması ise bugün de geçerli.
- Öneri: gerçek sayı için ayrı `count()` (yazılı ve toplam ayrı), toplamaları SQL `groupBy`/`jsonb_array_elements` veya günlük snapshot tablosuna taşımak; örneklem kullanılıyorsa UI'da "son N kayıt üzerinden" kapsam satırı.

### 4. Soft-delete edilmiş geri bildirimler istatistiklere ve dealer listesine dahil — **DOĞRULANDI**
- Admin silmesi soft-delete: `app/api/admin/feedbacks/route.ts:365-369` `deletedAt: new Date()`. Şema `prisma/schema.prisma:830`.
- `lib/prisma.ts` düz `PrismaClient`; `$extends`/`$use` ile otomatik `deletedAt` filtresi yok (repo genelinde grep ile doğrulandı).
- `route.ts:34` ve `:57-60` `deletedAt: null` filtresi içermiyor; oysa diğer admin/dealer analitik uçları bu filtreyi uyguluyor (ör. `app/api/admin/analytics/route.ts`, `app/api/dealer/analytics/route.ts`), yani bu uç platform sözleşmesinden sapıyor.
- **Yeniden üretim:** Admin, toksik/spam bir yorumu `/admin/feedbacks`'ten siler → kayıt `deletedAt` alır → ilgili bayi `/dealer/ai-insights`'ı açar → `fetch('/api/ai/detailed?limit=50')` (`app/dealer/ai-insights/ai-insights-client.tsx:360`) yanıtındaki `feedbacks` listesi (`:374`, `:2140`) silinen yorumun tam metnini döndürür ve listede göstermeye devam eder (yanıtta `user.name` da var; UI'da adın render edilip edilmediği doğrulanmadı); admin sayfasındaki toplamlar da silinen kayıtları sayar.
- Öneri: her iki sorguya `deletedAt: null`; uzun vadede Prisma client extension ile `Feedback` için varsayılan aktif-kayıt kapsamı (bilinçli `includeDeleted` bayrağı ile kaçış).
