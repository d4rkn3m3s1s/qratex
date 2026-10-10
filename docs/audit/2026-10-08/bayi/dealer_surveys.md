# /dealer/surveys

**Amaç:** Bayinin (işletme sahibinin) kendi müşterilerine yönelik özel anketleri listelediği, yeni anket oluşturmaya, anketi aktif/pasif yapmaya, paylaşım linkini kopyalamaya, sonuçlara gitmeye ve anketi silmeye yarayan yönetim listesi. Anket modülünün (`/dealer/surveys/create`, `/dealer/surveys/[id]/results`, herkese açık `/surveys/[id]`) giriş sayfası.

**Genel puan:** 4.8 / 10
**Karar:** yeniden tasarla (modülü koru ama geri bildirim omurgasına bağla; liste sayfası ince, güvenilirliği zayıf ve ürünün geri kalanından kopuk)

İncelenen dosyalar: `app/dealer/surveys/page.tsx`, `app/dealer/surveys/layout.tsx`, `app/dealer/layout.tsx`, `app/dealer/surveys/create/page.tsx` (liste tazeleme etkisi için), `app/dealer/surveys/[id]/results/page.tsx` (link hedefi), `app/surveys/[id]/page.tsx` (kopyalanan linkin hedefi), `app/api/dealer/surveys/route.ts`, `app/api/dealer/surveys/[id]/route.ts`, `app/api/dealer/surveys/[id]/results/route.ts`, `app/api/surveys/[id]/fill/route.ts`, `prisma/schema.prisma` (Survey/SurveyQuestion/SurveyResponse, satır 2598-2635), `lib/admin-toast.ts`, `lib/api-auth.ts`, `lib/module-gate.ts`, `components/providers.tsx`, `components/dashboard/sidebar.tsx`, `components/ui/switch.tsx`, `proxy.ts`, `messages/tr.json` + `messages/en.json` (`dealerSurveys.*`), `e2e/surveys.spec.ts`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel CRUD (listele/aç-kapa/sil/link) çalışıyor; ancak hata durumu boş liste gibi görünüyor, silme onaysız ve geri dönüşsüz, oluşturma sonrası liste bayat kalabiliyor, düzenleme/çoğaltma/QR yok. |
| UX | 4/10 | Yalnızca ikonlu eylemler, durum metni yok (pasif = sadece soluk), başlık tıklanamıyor, kota/tarih/yanıt oranı görünmüyor; anketin "ne işe yaradığı" boş durumda anlatılmıyor. |
| Görsel | 6/10 | Panel diliyle tutarlı temiz kartlar ve hero; fakat bilgi yoğunluğu çok düşük, her kart aynı ağırlıkta, KPI/özet satırı yok. |
| Mimari | 5/10 | Basit ve okunur; ama `fetch().json()` hata ayıklamıyor, `motion` (tam paket) kullanılıyor, modül kapısı API'de uygulanmıyor, anket modeli QR/şube/geri bildirim/AI'dan tamamen kopuk. |
| Performans | 7/10 | Tek sorgu + `_count`, `take: 200`, `staleTime` var; tek sorun global LazyMotion'a rağmen tam `motion` importu ve sonuç sayfasında sınırsız yanıt yükleme. |
| Erişilebilirlik + mobil | 4/10 | Switch ve sil düğmesinin erişilebilir adı yok, ikon düğmeler 32px (dokunma hedefi < 44px), pasif kartta tüm içerik `opacity-60` ile kontrastı düşürüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık + açıklama | ÇALIŞIYOR | `app/dealer/surveys/page.tsx:67-74` | i18n anahtarları TR/EN mevcut (`messages/*.json` → `dealerSurveys`). |
| 2 | "Yeni anket" CTA (→ `/dealer/surveys/create`) | ÇALIŞIYOR | `page.tsx:75-77` | Mobilde tam genişlik, iyi. Kota (50) dolunca uyarı yok. |
| 3 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/dealer/surveys/layout.tsx:4-6` | `segmentLayoutMetadata` ile. |
| 4 | Anket listesi verisi (GET `/api/dealer/surveys`) | KISMİ | `page.tsx:31-35`; `app/api/dealer/surveys/route.ts:25-46` | Sunucu tarafı doğru kapsamlı (`dealerId`), ama istemci `r.ok` kontrol etmiyor. |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:80-81` | `InlineLoadingStatus`; iskelet (skeleton) değil, düzen kayması var. |
| 6 | Boş durum + "İlk anketini oluştur" | ÇALIŞIYOR | `page.tsx:82-91` | Açıklama/şablon/fayda metni yok; yalnız "Henüz anket yok". |
| 7 | Hata durumu (401/403/500/503) | BOZUK | `page.tsx:33`, `page.tsx:63`, `page.tsx:82` | Hata JSON'u `{error}` döner → `surveys = []` → kullanıcıya "Henüz anket yok" gösterilir; yeniden dene yok. |
| 8 | Kart: anket başlığı | ÇALIŞIYOR | `page.tsx:105` | Tıklanabilir değil (bkz. #22). |
| 9 | Kart: soru sayısı rozeti | ÇALIŞIYOR | `page.tsx:106` | EN'de çoğul hatası: "1 questions" (`messages/en.json` `questionsBadge`). |
| 10 | Kart: yanıt sayısı rozeti | KISMİ | `page.tsx:107`; `app/api/surveys/[id]/fill/route.ts:73,108-114` | Sayım doğru ama yanıtlar tekilleştirilmiyor; IP başına dakikada 10 yanıt mümkün → sayı şişirilebilir. |
| 11 | Kart: açıklama (tek satır) | ÇALIŞIYOR | `page.tsx:109` | |
| 12 | Aktif/pasif görsel durum | KISMİ | `page.tsx:97-101` | Durum yalnız renk/opaklıkla anlatılıyor, metin etiketi ("Yayında/Durduruldu") yok. |
| 13 | Link kopyala | KISMİ | `page.tsx:58-61`, `page.tsx:112-114` | `clipboard.writeText` beklenmiyor/yakalanmıyor → başarısızlıkta da "kopyalandı" toast'ı; pasif ankette ölü link kopyalanıyor. |
| 14 | Sonuçlar linki | ÇALIŞIYOR | `page.tsx:115-117` | Erişilebilir ad `title` ile. |
| 15 | Aktif/pasif Switch (PATCH) | KISMİ | `page.tsx:37-47`, `page.tsx:118`; `app/api/dealer/surveys/[id]/route.ts:10-54` | İşliyor; ancak `aria-label` yok, bekleme/disabled durumu yok, iyimser güncelleme yok (gecikmeli tepki). |
| 16 | Sil (DELETE) | KISMİ | `page.tsx:49-56`, `page.tsx:119-121`; `app/api/dealer/surveys/[id]/route.ts:57-94`; `prisma/schema.prisma:2629` (Cascade) | Onaysız tek tık; tüm yanıtlar cascade ile kalıcı silinir; erişilebilir adı yok. |
| 17 | Toast bildirimleri | KISMİ | `page.tsx:15`; `lib/admin-toast.ts:12-21` | `admin-toast` "Basarili: " / "Dikkat: " önekini ekler — Türkçe karaktersiz ve EN arayüzde de Türkçe. |
| 18 | Liste giriş/çıkış animasyonu | ÇALIŞIYOR | `page.tsx:94-96`; `components/providers.tsx:232,241` | `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket destekleniyor; ama `m` yerine tam `motion` kullanılıyor. |
| 19 | Mobil yerleşim | KISMİ | `page.tsx:99-122` | Kırılmıyor; fakat 3 ikon düğme `h-8 w-8` (32px) — dokunma hedefi küçük. |
| 20 | Yetki/IDOR koruması | ÇALIŞIYOR | `proxy.ts:51-62`; `route.ts:27-31`; `[id]/route.ts:19-25,39-41,66-86` | Liste `dealerId` ile, PATCH/DELETE sahiplik + `updateMany/deleteMany where dealerId`. IDOR yok. |
| 21 | Modül kapatma (`dealer_surveys`) uygulaması | KISMİ | `components/dashboard/sidebar.tsx:259`; `lib/module-gate.ts:92`; anket route'larında `assertModuleEnabled` yok | Yönetici modülü kapatınca yalnız menü gizleniyor; doğrudan URL ve API çalışmaya devam ediyor. |
| 22 | Başlığa/karta tıklayıp detaya gitme | EKSİK | `page.tsx:105` | E2E testi bile başlığa tıklamayı bekliyor (`e2e/surveys.spec.ts:35`). |
| 23 | Arama / durum filtresi / sıralama | EKSİK | `page.tsx:63,95` | Yalnız `createdAt desc` (sunucu). |
| 24 | Anket düzenleme | EKSİK | `[id]/route.ts:28-32` (title/description destekli) | API başlık/açıklama güncellemeyi destekliyor ama UI yok; soru düzenleme hiç yok. |
| 25 | Anket çoğaltma (duplicate) | EKSİK | — | |
| 26 | QR kodu / paylaşım kanalları | EKSİK | `prisma/schema.prisma:2598-2611` | QR merkezli üründe anketi QR'a, masaya, şubeye bağlama yolu yok. |
| 27 | Oluşturma sonrası liste tazeleme | BOZUK | `app/dealer/surveys/create/page.tsx:113-117`; `page.tsx:34` | Create sayfası `invalidateQueries` yapmıyor; `staleTime: 30_000` içinde dönülürse yeni anket listede görünmez. |
| 28 | Kota göstergesi (50 anket sınırı) | EKSİK | `route.ts:60-63` | Kullanıcı sınırı ancak POST hatasında (yalnız Türkçe mesajla) öğreniyor. |
| 29 | Yanıt oranı / son yanıt / trend / oluşturma tarihi | EKSİK | `page.tsx:23` (`createdAt` çekiliyor ama gösterilmiyor) | |
| 30 | Önizleme / herkese açık sayfayı aç | EKSİK | `page.tsx:7` (`ExternalLink`, `LinkIcon`, `Power` import edilip kullanılmıyor) | Planlanıp yarım bırakılmış iz. |
| 31 | Toplu işlem / dışa aktarma (CSV) | EKSİK | — | Sonuç sayfasında da yok. |

Durum sayıları: ÇALIŞIYOR 11 · KISMİ 9 · BOZUK 2 · SAHTE 0 · EKSİK 9 (toplam 31).

---

## Bulgular

### 1. Silme onaysız, geri dönüşsüz ve tüm yanıtları cascade ile yok ediyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / UX
- **Kanıt:** `app/dealer/surveys/page.tsx:119` (`onClick={() => deleteMutation.mutate(s.id)}`), `app/api/dealer/surveys/[id]/route.ts:80-82` (hard `deleteMany`), `prisma/schema.prisma:2629` (`SurveyResponse … onDelete: Cascade`).
- **Sorun:** Switch'in hemen yanındaki çöp kutusu ikonuna tek bir yanlış dokunuş (özellikle mobilde, 32px hedeflerle) anketi ve topladığı tüm müşteri yanıtlarını kalıcı olarak siler. Ne onay, ne geri al, ne çöp kutusu var. Aynı panelde QR sayfası en azından `confirm()` kullanıyor (`app/dealer/qr-codes/page.tsx:231`).
- **Profesyonel öneri:** (a) Yanıtı olan anketlerde silme yerine **arşivleme** varsayılan olsun: `Survey.archivedAt DateTime?` ekleyin, liste varsayılan olarak arşivlenmemişleri göstersin. (b) Gerçek silme `components/ui/alert-dialog.tsx` ile, anket başlığını ve "N yanıt da silinecek" bilgisini gösteren, yanıt > 0 ise başlığı yazdırarak onaylatan bir diyalogla yapılsın. (c) Silme sonrası 8 sn'lik "Geri al" toast'ı (soft-delete + gecikmeli hard-delete cron'u). Sil düğmesini satır içi ikon yerine "⋯" eylem menüsüne taşıyın.
- **Efor:** M

### 2. API hatası "Henüz anket yok" olarak gösteriliyor
- **Önem:** yüksek · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:33` (`const r = await fetch(...); return r.json();` — `r.ok` yok), `page.tsx:63`, `page.tsx:82-91`; sunucu 500/503 döndürebiliyor (`app/api/dealer/surveys/route.ts:42-44`).
- **Sorun:** DB erişilemediğinde, oturum düştüğünde (401) veya token-replay 403'ünde (`lib/api-auth.ts:70-76`) `data = { error }` olur, `surveys` boş dizi olur ve bayiye "Henüz anket yok — ilk anketini oluştur" denir. Kullanıcı anketlerinin silindiğini sanabilir ve mükerrer anket oluşturabilir. React Query de hatayı başarı sayıp 30 sn önbelleğe alır.
- **Profesyonel öneri:** `queryFn` içinde `if (!r.ok) throw new Error(...)`; `isError` için ayrı bir hata kartı (`role="alert"`, "Tekrar dene" → `refetch()`); 401'de oturum yenileme akışına yönlendirme. Bu deseni panelde ortak bir `fetchJson` yardımcı fonksiyonuna çekin ki diğer bayi sayfaları da aynı hatayı tekrarlamasın.
- **Efor:** S

### 3. Oluşturma sonrası liste bayat kalıyor
- **Önem:** orta · **Kategori:** veri tutarlılığı
- **Kanıt:** `app/dealer/surveys/create/page.tsx:113-117` (`router.push('/dealer/surveys')`, `invalidateQueries` yok); `page.tsx:32-34` (`staleTime: 30_000`).
- **Sorun:** Bayi listeden "Yeni anket"e gidip 30 sn içinde kısa bir anket kaydederse liste önbellekten gelir ve yeni anket görünmez; "Anket oluşturuldu" toast'ıyla çelişen bir ekran oluşur, mükerrer oluşturmaya iter.
- **Profesyonel öneri:** Create sayfasını `useMutation` + `onSuccess: queryClient.invalidateQueries({ queryKey: ['dealer','surveys'] })` ile yazın ya da POST yanıtındaki anketi `setQueryData` ile listeye ekleyin. Yeni oluşturulan kartı listede kısa süreli vurgulayın.
- **Efor:** S

### 4. Toast metinleri dil karışık ve Türkçe karaktersiz ("Basarili:", "Dikkat:")
- **Önem:** orta · **Kategori:** i18n / tutarlılık
- **Kanıt:** `page.tsx:15` (`import { toast } from '@/lib/admin-toast'`), `lib/admin-toast.ts:12-21`.
- **Sorun:** Bayi arayüzü EN iken "Basarili: Survey deleted" görünür; TR'de ise "Başarılı" yerine "Basarili" yazılır. Ayrıca adı "admin" olan bir yardımcı bayi paneline sızmış (panelde 34 dosya aynı importu kullanıyor). Sunucu hata metinleri de yalnız Türkçe (`route.ts:62` "En fazla 50 anket…") ve create sayfası bunu doğrudan gösteriyor (`create/page.tsx:114`).
- **Profesyonel öneri:** Panel-agnostik bir `lib/toast.ts` (önek yok; ikon/renk zaten durumu anlatıyor) ve API'lerde makine-okunur `code` alanı (`SURVEY_QUOTA_REACHED`) döndürüp istemcide `t()` ile çevirin.
- **Efor:** S (bu sayfa) / M (panel geneli)

### 5. Yanıt sayısı şişirilebilir; yanıt verisi doğrulanmıyor
- **Önem:** orta · **Kategori:** veri bütünlüğü / güvenlik
- **Kanıt:** `app/api/surveys/[id]/fill/route.ts:73` (IP+anket başına 10/dk), `:53-56` (`questionId` ve `value` serbest; `z.string()` uzunluk sınırı yok), `:108-114` (tekilleştirme yok); sonuç toplama `app/api/dealer/surveys/[id]/results/route.ts:44-49` gelen her string'i seçenek anahtarı olarak sayıyor.
- **Sorun:** Bu sayfadaki "N yanıt" rozeti, tek bir IP'den günde ~14.000 yanıtla şişirilebilir; seçmeli sorulara listede olmayan keyfi değerler eklenip sonuç grafikleri kirletilebilir; `rating` için 1-5 dışı değerler ortalamayı bozar; açık metin sınırsız uzunlukta. Ayrıca anketin hangi soruya ait olduğu kontrol edilmeyen `questionId`'ler JSON'a yazılır.
- **Profesyonel öneri:** Gönderimde soruları sunucuda tip bazında doğrulayın (seçim ∈ options, rating ∈ [1..5] tamsayı, metin ≤ 2000, `questionId` ∈ anket soruları, boş string zorunluyu karşılamaz). Oturumlu kullanıcı için `@@unique([surveyId, userId])`, anonim için cihaz parmak izi/çerez + IP kombinasyonlu tekilleştirme ve opsiyonel Turnstile. Listede "doğrulanmış/anonim" ayrımı gösterin.
- **Efor:** M

### 6. Modül kapatma yalnızca menüyü gizliyor
- **Önem:** orta · **Kategori:** yetki / platform kontrolü
- **Kanıt:** `components/dashboard/sidebar.tsx:259` (`moduleKey: 'dealer_surveys'`), `lib/module-controls.ts:45`; `app/api/dealer/surveys/**` ve `app/api/surveys/[id]/fill/route.ts` içinde `assertModuleEnabled` çağrısı yok (karşılaştırma: `app/api/dealer/experience-pulse/route.ts:19-26`).
- **Sorun:** Yönetici "Anketler (bayi)" modülünü kapatsa bile bayi `/dealer/surveys` URL'ini açıp anket oluşturabilir, açık anketler müşterilerden yanıt toplamaya devam eder.
- **Profesyonel öneri:** Tüm anket route'larına `assertModuleEnabled('dealer_surveys', { role: 'dealer', … })` ekleyin; public `fill` uçlarında modül kapalıysa "Bu anket şu an kullanılamıyor" döndürün; sayfada modül kapalıysa açıklayıcı bir durum kartı gösterin.
- **Efor:** S

### 7. Erişilebilirlik: adsız kontroller, küçük hedefler, opaklıkla anlatılan durum
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** `page.tsx:118` (Switch'te `aria-label` yok), `page.tsx:119-121` (sil düğmesinde ne `aria-label` ne `title`), `page.tsx:112,115,119` (`h-8 w-8`), `page.tsx:97` (`opacity-60` tüm kartta).
- **Sorun:** Ekran okuyucu Switch'i yalnızca "anahtar, açık" diye okur — hangi anket olduğu belli değil; sil düğmesi "düğme" olarak okunur. 32px hedefler WCAG 2.5.8 (24px) geçer ama mobil kılavuzların 44px önerisinin altında ve sil ile Switch yan yana. Pasif kartta başlık, rozetler ve kontrollerin hepsi soluklaşıyor; kontrast düşüyor ve durumun tek ipucu renk/opaklık (WCAG 1.4.1).
- **Profesyonel öneri:** `aria-label={t('dealerSurveys.toggleAria', { title })}`, sil için `aria-label`; durum için metinli `Badge` ("Yayında" / "Durduruldu"); opaklık yerine yalnız ikon/kenarlık tonunu değiştirin; mobilde eylemleri tek bir `DropdownMenu` (⋯) içine alıp 44px hedef verin; `title` yerine `aria-label` + Tooltip.
- **Efor:** S

### 8. Link kopyalama başarısızlığı yutuluyor ve pasif ankette ölü link veriliyor
- **Önem:** düşük · **Kategori:** hata yönetimi / UX
- **Kanıt:** `page.tsx:58-61` (`writeText` beklenmiyor, `catch` yok); `app/api/surveys/[id]/fill/route.ts:19` (`isActive: true` değilse 404).
- **Sorun:** İzin reddi/iframe/eski Safari'de kopyalama başarısız olsa da "kopyalandı" görünür. Pasif ankette kopyalanan link müşteriye "Anket bulunamadı" gösterir.
- **Profesyonel öneri:** `await navigator.clipboard.writeText(...)` + `catch` → seçilebilir metin alanı fallback'i; pasif ankette "Anket durduruldu, link çalışmaz — yayına al?" uyarısı. Kopyalama yerine bir **Paylaş paneli** (link + QR + WhatsApp/SMS metni + `navigator.share`) sunun.
- **Efor:** S

### 9. Switch'te bekleme durumu ve iyimser güncelleme yok
- **Önem:** düşük · **Kategori:** UX / yarış koşulu
- **Kanıt:** `page.tsx:37-47`, `page.tsx:118`.
- **Sorun:** Switch sunucu yanıtı + yeniden çekme bitene kadar eski konumda kalır; kullanıcı tekrar tıklayınca aynı değeri gönderen ikinci istek kuyruğa girer. Hata halinde geri alma yok (zaten iyimser değil ama gecikme "çalışmadı" hissi veriyor).
- **Profesyonel öneri:** `onMutate` ile `setQueryData` iyimser güncelleme + `onError` rollback; satır bazında `disabled={toggleMutation.isPending && toggleMutation.variables?.id === s.id}`.
- **Efor:** S

### 10. Ölü importlar, tam `motion` paketi, zayıf E2E
- **Önem:** düşük · **Kategori:** mimari / bakım
- **Kanıt:** `page.tsx:6-7` (`Power`, `LinkIcon`, `ExternalLink` kullanılmıyor); `page.tsx:4` (`motion` — projede standart `m as Motion`, `components/providers.tsx:238-241`); `e2e/surveys.spec.ts:16-17` (CTA bir `Link` olduğu için `getByRole('button')` bulamaz → oluşturma adımı sessizce atlanır), `:35` (başlık link değil, tıklama hiçbir yere gitmez).
- **Sorun:** Tam `motion` importu LazyMotion'un sağladığı paket ertelemesini bu rota için boşa çıkarır. E2E testi bu sayfanın davranışını gerçekte doğrulamıyor.
- **Profesyonel öneri:** `m as Motion`'a geçin, ölü importları silin; E2E'yi `getByRole('link', { name: /yeni anket/i })` ile ve onay diyaloglu silme, hata durumu, liste tazeleme senaryolarıyla yeniden yazın.
- **Efor:** S

### 11. Bağlantılı sonuç ucunda tutarsızlık ve sınırsız yükleme (komşu sayfa, bu sayfadan ulaşılıyor)
- **Önem:** düşük · **Kategori:** performans / tutarlılık
- **Kanıt:** `app/api/dealer/surveys/[id]/results/route.ts:19-25` (tüm yanıtlar `take` olmadan belleğe), `:27` (ADMIN için sahiplik bypass yok; PATCH/DELETE'te var).
- **Sorun:** Yanıt sayısı büyüdükçe (bkz. bulgu 5) sonuç sayfası yavaşlar; ADMIN'e farklı kural uygulanması rota mantığını tutarsız kılıyor.
- **Profesyonel öneri:** Toplamaları SQL tarafında (JSONB üzerinden `jsonb_array_elements` ile) veya yanıt yazımında artımlı sayaçlarla yapın; açık metinleri sayfalı ayrı uçtan çekin.
- **Efor:** M

---

## Eksik özellikler (kıyas: Medallia, Qualtrics CX, Google Business Profile, Yelp for Business, Toast, Square)

1. **Şablon galerisi + standart metrikler:** NPS, CSAT, CES, menü/ürün memnuniyeti, personel değerlendirmesi hazır şablonları; NPS sorusu için 0-10 ölçek tipi (şu an yalnız 1-5 `rating`). Qualtrics/Medallia'nın temel giriş noktası.
2. **Dağıtım kanalları:** Ankete özel QR (mevcut QR modülüyle bağ — masa/şube etiketi), işlem sonrası otomatik gönderim (Toast/Square "post-purchase survey"), kampanya modülüyle segmentlere gönderim, gömülebilir link.
3. **Yaşam döngüsü yönetimi:** Taslak → Yayında → Durduruldu → Arşiv; başlangıç/bitiş tarihi, yanıt hedefi/üst sınırı, düzenleme (soru ekle/çıkar, yanıt geldiyse sürümleme), çoğaltma.
4. **Liste düzeyinde içgörü:** Her kartta yanıt sayısı + son 7 gün sparkline, son yanıt zamanı, tamamlanma oranı (açılış/başlama/bitiş), ortalama puan; sayfa üstünde KPI şeridi ve arama/filtre/sıralama.
5. **AI özet ve aksiyon köprüsü:** Açık metin yanıtlardan tema/duygu çıkarımı (mevcut AI içgörü/VoC altyapısına bağlanarak), düşük puanlı yanıttan remedy/aksiyon maddesi oluşturma (Medallia "close the loop").
6. **Dışa aktarma ve entegrasyon:** CSV/XLSX, webhook; yanıtların müşteri profiliyle (oturumlu yanıtta `userId` zaten var) ilişkilendirilmesi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi bu sayfaya girdiğinde "hangi anketim çalışıyor, ne kadar yanıt geliyor, nerede sorun var" sorularına 3 saniyede yanıt almalı; yeni bir anketi 1 dakikada şablondan yayınlayıp QR'ını masaya koyabilmeli.

**Yerleşim:**
1. **Hero + KPI şeridi:** Aktif anket sayısı, son 7 gün yanıt, ortalama memnuniyet/NPS, kota (ör. "12/50"). Birincil CTA "Yeni anket" bir **şablon seçici** sheet'i açar (boş başlangıç + 5-6 şablon).
2. **Araç çubuğu:** Arama, durum sekmeleri (Tümü / Yayında / Taslak / Durduruldu / Arşiv), sıralama (en yeni, en çok yanıt, son yanıt).
3. **Anket satırları (kartlar):** Tıklanabilir başlık (→ sonuçlar), metinli durum rozeti, soru/yanıt sayısı, son yanıt göreli zamanı, mini sparkline; sağda Switch ("Yayında") + "Paylaş" düğmesi + "⋯" menü (Düzenle, Çoğalt, Önizle, QR indir, Arşivle, Sil).
4. **Paylaş paneli (Dialog/Sheet):** Link + kopyala (fallback'li), QR önizleme/indirme (mevcut QR üretim kütüphanesiyle), WhatsApp/SMS hazır metni, `navigator.share`.
5. **Boş durum:** Değer önerisi ("Müşterilerinize 3 soruyla ne düşündüklerini sorun"), 3 şablon kartı, örnek sonuç görseli.
6. **Hata durumu:** Ayrı kart + tekrar dene.

**Motion:** Ölçülü kalmalı — bu bir yönetim listesi. `m as Motion` ile mevcut giriş animasyonu korunabilir; durum değişiminde rozet için kısa renk geçişi, silme/arşivlemede `layout` ile satır kapanması, yeni oluşturulan anket için tek seferlik vurgu. 3D gereksiz. `MotionConfig reducedMotion="user"` zaten global; sparkline animasyonları da buna uymalı.

**Veri / API değişiklikleri:**
- `Survey`: `status` (`draft|active|paused|archived`) veya `archivedAt`, `startsAt/endsAt`, `responseGoal`, `templateKey`, opsiyonel `qrCodeId`/`branchId`.
- `GET /api/dealer/surveys`: `?q&status&sort` parametreleri; yanıt bazlı özet alanları (`lastResponseAt`, `responses7d`, `avgRating`) — tek `groupBy` sorgusuyla, N+1 olmadan; kısa TTL Redis önbelleği (yazımda tag/anahtar silme).
- `POST /api/dealer/surveys/[id]/duplicate`, `POST …/archive`, `GET …/export.csv`.
- Tüm uçlarda `assertModuleEnabled('dealer_surveys')`; hata yanıtlarında `code` alanı.
- Public `fill`: tip bazlı doğrulama, tekilleştirme, uzunluk sınırları (bkz. bulgu 5).
- İstemci: ortak `fetchJson` (ok kontrolü), iyimser toggle, `AlertDialog` onaylı silme, panel-agnostik toast.

---

## Çakışmalar / birleştirme önerisi

- **Doğrudan kopya yok.** Anket modülü (`Survey*` modelleri) sistemdeki tek yapılandırılabilir soru seti; `/dealer/feedbacks`, `/dealer/reviews`, `/dealer/consumptions` sabit akışlı geri bildirimleri gösteriyor.
- **Kavramsal kopukluk var:** Anket yanıtları `/dealer/feedbacks`, `/dealer/voc-wall`, `/dealer/ai-insights`, `/dealer/radar` ve aksiyon/remedy akışlarına hiç girmiyor (`app/api` altında `survey` geçen yalnız 4 route var). Bu nedenle anket sayfası "ada" gibi duruyor.
- **Öneri:** Sayfayı kaldırmak yerine "Geri bildirimlerim" grubunun (`components/dashboard/sidebar.tsx:254-259`) içinde **"Anketler"** sekmesi olarak bir Geri Bildirim Merkezi'ne bağlayın: anket yanıtları ortak geri bildirim akışına (kaynak = "anket") düşsün, AI içgörü/VoC temaları anket açık metinlerini de işlesin, düşük puanlı yanıtlar remedy kuyruğuna aday olsun. `/dealer/surveys/create` ve `/dealer/surveys/[id]/results` aynı modülün alt sayfaları olarak kalmalı; liste sayfası yukarıdaki vizyonla yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia; sayfa, çağrılan API route'ları, `lib/api-auth.ts`, `lib/module-gate.ts`, `lib/rate-limit.ts`, `lib/request-metadata.ts`, `app/dealer/layout.tsx` ve `prisma/schema.prisma` baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, DB'ye dokunulmadı.

### 1. Onaysız tek tık silme tüm anket yanıtlarını kalıcı yok ediyor — **DOĞRULANDI**
- `app/dealer/surveys/page.tsx:119` çöp ikonu doğrudan `deleteMutation.mutate(s.id)` çağırıyor; arada `AlertDialog`, `confirm` veya geri al yok. `:54` yalnız "silindi" toast'ı gösteriyor (undo eylemi yok).
- `app/api/dealer/surveys/[id]/route.ts:80-82` sert `deleteMany`; soft-delete alanı yok (`prisma/schema.prisma:2598-2611` `Survey` modelinde `archivedAt/deletedAt` yok).
- `prisma/schema.prisma:2616` (`SurveyQuestion`) ve `:2629` (`SurveyResponse`) `onDelete: Cascade` → sorular ve tüm müşteri yanıtları da gider.
- İkon `h-8 w-8` (32px) ve `:118` Switch ile aynı `gap-2` satırında; mobilde Switch'e basmak isteyen bayinin çöpe dokunması gerçekçi.
- **Yeniden üretim:** Yanıt almış bir anketin satırında çöp ikonuna bir kez dokun → istek hemen gider, kart kaybolur; `/dealer/surveys/{id}/results` 404 döner, yanıtlar geri getirilemez (yedek dışında).
- **Not:** Bayinin kendi verisi; yetki ihlali değil, veri kaybı/UX riski. Önerilen düzeltme raporun ana bölümüyle aynı: `AlertDialog` (yanıt sayısını gösteren, yanıtı olan anket için başlığı yazdırarak onay) + tercihen `archivedAt` soft-delete ve 30 gün sonra temizleyen cron.

### 2. Liste API hatası boş liste olarak gösteriliyor — **DOĞRULANDI**
- `app/dealer/surveys/page.tsx:33` `r.json()` döndürüyor, `r.ok` kontrolü yok. `requireAuth` (`lib/api-auth.ts:58-63`) 401/403'ü `{ error }` gövdesiyle; route (`app/api/dealer/surveys/route.ts:42-44`) DB kesintisinde 503/500'ü `{ error }` ile döndürüyor. Bu gövde başarılı sorgu verisi olarak kabul ediliyor.
- `:63` `data?.surveys ?? []` → `[]`; `:82` boş durum ("Henüz anket yok" + "Oluştur" CTA) render ediliyor. Gövde JSON değilse (ör. HTML hata sayfası) `r.json()` fırlatır, `isError` olur; `isError` hiç okunmadığı için yine boş durum görünür.
- `staleTime: 30_000` (`:34`) nedeniyle `{error}` gövdesi başarılı veri olarak 30 sn önbellekte kalır.
- **Yeniden üretim:** Neon kısa süreli erişilemez/soğuk başlangıç → `GET /api/dealer/surveys` 503 → bayi 50 anketi olmasına rağmen boş durum ve "Anket oluştur" görür. Ayrıca token-replay reddi (`lib/api-auth.ts:69-72`) gibi bir 401'de de aynı tablo oluşur.
- **Not:** Mükerrer oluşturma, `POST`'taki 50 anket limiti (`route.ts:60-63`) ile sınırlı ama yanıltıcı durum gerçek. Düzeltme: ortak `fetchJson` (ok değilse fırlat), `isError` için ayrı hata kartı + "Tekrar dene".

### 3. Public anket yanıtları tekilleştirilmiyor ve tip doğrulaması yok — **DOĞRULANDI**
- `app/api/surveys/[id]/fill/route.ts:53-56`: `questionId` serbest string, `value` serbest `string | string[] | number`; string uzunluğu, dizi boyutu ve `questionId`'nin ankete ait olup olmadığı kontrol edilmiyor. `:100-106` yalnız zorunlu soruların varlığına bakıyor; seçenek kümesi/1-5 aralığı doğrulanmıyor.
- `:73` sınır `survey-fill:{id}:{ip}` başına 10/dk → tek IP'den ~14.400 yanıt/gün; IP değiştirerek (mobil ağ, proxy) sınırsız. Oturum/cihaz/çerez bazlı tekilleştirme veya `SurveyResponse` üzerinde unique kısıt yok (`prisma/schema.prisma:2626-2635`).
- `app/api/dealer/surveys/[id]/results/route.ts:44-49` seçeneklerde olmayan değerleri `optionCounts`'a yeni anahtar olarak ekliyor; `:55-58` rating'de `Number(value)` ile 999 veya -50 ortalamaya ve dağılıma giriyor; `:62-63` open_text'te sınırsız uzunluklu metin dönüyor. Ayrıca `:23` tüm yanıtları sınırsız (`take` yok) belleğe çekiyor — şişirme bu ucu da yavaşlatır.
- `x-forwarded-for` sahteciliği (`lib/request-metadata.ts:9-21` ilk değeri alıyor): Vercel bu başlığı kendisi yeniden yazdığı için Vercel üzerinde istismar edilemez; bu alt iddia **doğrulanmadı**, ana bulguyu etkilemiyor.
- **Yeniden üretim:** Public anket ID'si (paylaşılan linkte açık) ile `POST /api/surveys/{id}/fill` gövdesi `{"answers":[{"questionId":"<rating soru id>","value":999},{"questionId":"<seçim soru id>","value":"RAKİP DAHA İYİ"}]}` dakikada 10 kez → listede yanıt rozeti şişer, sonuç sayfasında ortalama puan 5'in üstüne çıkar, grafikte uydurma seçenek çubuğu belirir.

### 4. dealer_surveys modülü kapatıldığında API çalışmaya devam ediyor — **DOĞRULANDI**
- `dealer_surveys` anahtarı yalnız `components/dashboard/sidebar.tsx:259` (menü gizleme) ve `lib/module-controls.ts:45` (katalog) içinde geçiyor. `app/api/dealer/surveys/route.ts`, `[id]/route.ts`, `[id]/results/route.ts` ve `app/api/surveys/[id]/fill/route.ts` içinde `assertModuleEnabled` çağrısı yok (aynı desen `app/api/dealer/campaigns/route.ts:28,61`'de uygulanmış — tutarsızlık).
- Sayfa düzeyinde de koruma yok: `app/dealer/layout.tsx` modül kontrolü yapmıyor, `proxy.ts` içinde modül kapısı yok.
- **Yeniden üretim:** Admin `/admin/modules`'ten "Anketler (bayi)"yi kapatır → menü kaybolur ama bayi `/dealer/surveys` URL'sini yazınca sayfa çalışır, `POST /api/dealer/surveys` 201 döner; müşteriler daha önce paylaşılan `/surveys/{id}` linkinden yanıt göndermeye devam eder.
- **Not:** Veri sızıntısı değil; yöneticinin "geçici kapat" niyetinin atlatılması. Severity orta. Düzeltme: tüm bayi uçlarına `assertModuleEnabled('dealer_surveys', { role: 'dealer', request, userId })`, public `fill` GET/POST'a da aynı kapı (kapalıyken "Anket şu an kullanılamıyor"), sayfada 403 `moduleKey` yanıtını tanıyan bir "modül kapalı" durumu.

### Özet
| # | İddia | Karar |
|---|---|---|
| 1 | Onaysız tek tık kalıcı silme | Doğrulandı |
| 2 | API hatası boş liste olarak görünüyor | Doğrulandı |
| 3 | Public yanıt tekilleştirme/tip doğrulaması yok | Doğrulandı (XFF sahteciliği alt iddiası Vercel'de geçersiz) |
| 4 | Modül kapatılınca API açık kalıyor | Doğrulandı (önem: orta) |

## Uygulama (Dalga 2)

Commit'ler: `36b86af` (Anket Stüdyosu), `6603aa4` (kota kilidi, hidrasyon-güvenli kimlikler, e2e). Sayfa sunucu bileşeni (`app/dealer/surveys/page.tsx` → `gateSurveyPage` + `listDealerSurveys` SSR ön-yükleme), istemci adası `components/dealer/b-anketler/surveys-screen.tsx`; API'ler `defineRoute` (rol + kiracı + `module: 'dealer_surveys'` + rate limit), iş mantığı `lib/dealer-surveys/*`.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Hero | ÇALIŞIYOR | `PanelPage` (QDL v2). |
| 2 | "Yeni anket" CTA | ÇALIŞIYOR | Kota dolunca devre dışı + gerekçe. |
| 3 | Metadata | ÇALIŞIYOR | |
| 4 | Liste verisi | ÇALIŞIYOR | SSR ön-yükleme; istemci `r.ok` denetler. |
| 5 | Yükleniyor | ÇALIŞIYOR | İskelet. |
| 6 | Boş durum | ÇALIŞIYOR | Fayda metni + şablonla başla. |
| 7 | Hata durumu | ÇALIŞIYOR | Hata kartı + Tekrar dene; modül kapalı/yetkisiz ayrı ekran (`blocked.tsx`). |
| 8 | Başlık | ÇALIŞIYOR | Sonuçlara bağlantı. |
| 9 | Soru sayısı | ÇALIŞIYOR | Çoğul doğru. |
| 10 | Yanıt sayısı | ÇALIŞIYOR | Public doldurmada tekillik + tip doğrulaması (paylaşım yüzeyi, `922912e`); toplama bilinmeyen seçenek ve aralık dışı puanı saymaz. |
| 11 | Açıklama | ÇALIŞIYOR | |
| 12 | Durum | ÇALIŞIYOR | Metinli rozet (Yayında/Durduruldu), opaklık yok. |
| 13 | Link kopyala | ÇALIŞIYOR | `await` + hata bildirimi; durdurulmuş ankette uyarı. Paylaş diyaloğu (link + QR). |
| 14 | Sonuçlar linki | ÇALIŞIYOR | |
| 15 | Yayın aç/kapa | ÇALIŞIYOR | İyimser güncelleme + geri alma, aria-label, bekleme durumu. |
| 16 | Sil | ÇALIŞIYOR | Onay diyaloğu; yalnız YANITSIZ anket silinir (tek atomik sorgu), yanıtlı → 409 "durdur + CSV indir". Cascade veri kaybı kapandı. |
| 17 | Toast | ÇALIŞIYOR | Önek yok, TR/EN tutarlı. |
| 18 | Animasyon | ÇALIŞIYOR | `m` + hareket politikası. |
| 19 | Mobil | ÇALIŞIYOR | ≥44px hedefler, ikincil eylemler menüde. |
| 20 | IDOR | ÇALIŞIYOR | `resolveDealerScope`; ADMIN yalnız `?dealerId=` ile salt-okunur. |
| 21 | Modül kapısı | ÇALIŞIYOR | Tüm bayi uçları + sayfa kapısı. |
| 22 | Karta tıklayıp detay | ÇALIŞIYOR | `/dealer/surveys/[id]` → sonuçlar. |
| 23 | Arama/filtre/sıralama | ÇALIŞIYOR | İstemci tarafı (liste 50 kota ile sınırlı). |
| 24 | Düzenleme | ÇALIŞIYOR | `/dealer/surveys/[id]/edit`; yanıtlı ankette yapısal kilit (`edit-policy.ts`). |
| 25 | Çoğaltma | ÇALIŞIYOR | `POST [id]/duplicate`, kota kilidi altında. |
| 26 | QR / paylaşım | ÇALIŞIYOR | Link, QR (PNG indir), WhatsApp. Anketi masa/şube QR'ına bağlama şema gerektirir → kalan. |
| 27 | Oluşturma sonrası tazeleme | ÇALIŞIYOR | `invalidateQueries` + SSR. |
| 28 | Kota göstergesi | ÇALIŞIYOR | Kullanılan/sınır sunucudan. |
| 29 | Son yanıt/trend/tarih | ÇALIŞIYOR | Son yanıt, son 7 gün, oluşturma tarihi (Europe/Istanbul). "Yanıt oranı" paydası (gösterim) verisi yok → gösterilmiyor. |
| 30 | Public sayfayı aç | ÇALIŞIYOR | "Müşteri sayfasını aç". |
| 31 | CSV / toplu işlem | ÇALIŞIYOR (CSV) | Sunucu CSV sonuç sayfasında (`[id]/export`). Toplu işlem KALDIRILDI: 50 anket sınırında değeri düşük. |

**Kapanan bulgular (11/11):** 1 onaysız silme/cascade, 2 hata=boş liste, 3 bayat liste, 4 toast dili, 5 yanıt şişirme/doğrulama (toplama burada; tekillik public yüzeyde), 6 modül kapısı, 7 erişilebilirlik, 8 kopyalama hatası, 9 switch bekleme, 10 ölü import/motion/e2e, 11 sonuç ucu sınırsız yükleme (SQL toplama).

**Kalanlar:** Anketi QR/masa/şubeye bağlama — ŞEMA İSTEĞİ (`Survey` ↔ `QRCode` ilişkisi). Soft-delete (`archivedAt`) şemada yok; yerine "yanıtlı anket silinemez, durdurulur" kuralı.
