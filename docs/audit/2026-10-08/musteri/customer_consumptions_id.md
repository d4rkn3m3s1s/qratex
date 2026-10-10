# /customer/consumptions/[id]

**Amaç:** Bayinin müşterinin fiziksel kartını okutarak oluşturduğu tek bir tüketim kaydının (`Consumption`) ayrıntısını göstermek ve müşterinin bu tüketime puan, boyut puanları ve yorum (`ConsumptionReview`) bırakmasını sağlamak. Karakter rozeti sistemi YALNIZCA bu yorumları saydığı için bu sayfa, oyunlaştırma ekonomisinin en kritik girdi noktalarından biri.

**Genel puan:** 4.4 / 10 · **Karar:** **yeniden tasarla** (rota korunur; tüketim yorumunun "tek doğru kaynağı" hâline getirilir, `/customer/feedbacks` içindeki tüketim yorumu sekmesi buraya bağlanır)

Denetlenen dosyalar: `app/customer/consumptions/[id]/page.tsx` (531 satır), `app/customer/consumptions/layout.tsx`, `app/customer/layout.tsx`, `app/api/customer/consumptions/[id]/route.ts`, `app/api/customer/consumptions/[id]/review/route.ts`, `lib/validations.ts`, `lib/points-rules.ts`, `lib/admin-toast.ts`, `lib/utils.ts`, `lib/character-badges.ts`, `lib/customer-reminders.ts`, `lib/idempotency.ts`, `app/api/dealer/feedbacks/[id]/reply/route.ts`, `app/api/dealer/consumptions/route.ts`, `components/dashboard/notification-center.tsx`, `app/customer/feedbacks/page.tsx`, `app/api/customer/reviews/route.ts`, `prisma/schema.prisma` (`Consumption`, `ConsumptionReview`, `PhysicalCard`), `messages/tr.json` + `messages/en.json`.

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel oku-yorumla-gönder akışı ve sunucu tarafı ekonomi koruması (tek transaction, unique kısıt, cap) sağlam; ama işletme yanıtı hiç gösterilmiyor, güncellemede metin silinemiyor, "AI" yardımcısı metni bozuyor. |
| UX | 4/10 | Ana eylem (yorum) mobilde katlanmanın altında kalıyor, gönderim sonrası tüm sayfa spinner'a dönüyor, ödül anı tek bir toast'a indirgenmiş; şikâyet odaklı yardımcı olumlu yorumları cezalandırıyor. |
| Görsel | 5/10 | Tutarlı shadcn kart düzeni ama liste sayfasındaki `DashboardPageHero` dili yok, ödül kutusu butonun altında, sabit amber→orange gradyan tema tokenı değil. |
| Mimari | 4/10 | 530 satırlık tek client bileşen, sabit kodlu ödül değerleri (admin matrisi yok sayılıyor), ölü state/importlar, AI analizi `after()` dışında, PUT yolu karakter rozetini atlıyor. |
| Performans | 6/10 | Tek GET + tek POST/PUT, N+1 yok; ama yenilemede gereksiz tam yeniden yükleme, `next/image` yok, kullanılmayan alanlar (kart token'ı, fiyat, görsel) çekiliyor, PUT'ta sınırsız AI çağrısı. |
| Erişilebilirlik + mobil | 3/10 | Yıldız butonlarında `aria-label`/radiogroup yok, `focus:outline-none` odak göstergesini siliyor, boyut yıldızları 20px dokunma hedefi, textarea etiketsiz, azaltılmış hareket desteği yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Geri butonu (listeye) | ÇALIŞIYOR | page.tsx:254-259 | Her zaman `/customer/consumptions`'a gider; `/customer/feedbacks`'ten gelen kullanıcı yanlış yere döner. |
| 2 | Tüketim verisini yükleme (GET) | ÇALIŞIYOR | page.tsx:154-177; route.ts:29-75 | `useEffect` bağımlılığında `fetchConsumption` yok (148-150), AbortController yok. |
| 3 | Yükleniyor durumu | KISMİ | page.tsx:225-231 | Yalnız ortada spinner; iskelet yok. Gönderim sonrası yenilemede de tüm sayfa spinner'a döner (217 → 156). |
| 4 | Hata durumu | KISMİ | page.tsx:167-174 | Her hatada toast + anında listeye yönlendirme; "tekrar dene" yok, oturum düşmesi ile 404 ayrımı yok. |
| 5 | Bulunamadı ekranı | KISMİ | page.tsx:233-247 | `router.push` zaten tetiklendiği için çoğunlukla bir an görünür; işlevsel bir boş durum değil. |
| 6 | Sahiplik / rol kontrolü | ÇALIŞIYOR | route.ts:22, 85; review/route.ts:99, 147, 325-328 | IDOR yok. 403/404 ayrımı kayıt varlığını sızdırır (cuid, düşük risk). |
| 7 | İşletme kartı (logo, ad, açıklama) | ÇALIŞIYOR | page.tsx:272-294 | Düz `<img>`; işletme profiline/keşfet sayfasına bağlantı yok. |
| 8 | Ürün bilgisi (kategori ikonu, ad, açıklama) | ÇALIŞIYOR | page.tsx:297-317 | `price` ve `image` çekiliyor ama gösterilmiyor (route.ts:47-48). |
| 9 | Tarih | KISMİ | page.tsx:326 | `formatDate` locale parametresi verilmiyor → EN arayüzde de Türkçe tarih (utils.ts:19). |
| 10 | Tutar | KISMİ | page.tsx:328-336 | `amount && (...)` deseni; `formatCurrency` sabit `tr-TR` (utils.ts:78). |
| 11 | İşletme notu | ÇALIŞIYOR | page.tsx:339-344 | — |
| 12 | Genel yıldız puanı (1-5) | KISMİ | page.tsx:367-388 | Erişilebilir ad yok, `focus:outline-none` (376), boşken "-/5" gösterimi. |
| 13 | Yıldız hover önizlemesi | ÇALIŞIYOR | page.tsx:374-375, 381 | Dokunmatikte anlamsız ama zararsız. |
| 14 | Detaylı boyut puanları (Lezzet/Hizmet/Ortam/Fiyat-Performans) | KISMİ | page.tsx:74-79, 398-425 | Etiketler TR sabit; seçim geri alınamaz; şemadaki `cleanliness` (validations.ts:293) arayüzde yok; işletme türünden bağımsız yemek odaklı set. |
| 15 | Yorum metni (textarea) | KISMİ | page.tsx:432-438 | `Label` `htmlFor` içermiyor, textarea `id`'siz → etiketsiz alan; `maxLength` yok (sunucu 2000'de keser). |
| 16 | Karakter sayacı | KISMİ | page.tsx:440 | "karakter" kelimesi ve 2000 sınırı sabit kodlu (`INPUT_LIMITS.feedbackText` kullanılmıyor). |
| 17 | "Detaylı yorum bonusu" göstergesi | KISMİ | page.tsx:441-446 | Eşik 50 sabit ve `trim` yok; sunucu `trim().length >= longTextThreshold` (points-rules.ts:277) kullanıyor ve eşik admin'den ayarlanabilir → istemci yanlış vaat verebilir. |
| 18 | "AI Geri Bildirim Kalitesi Yardımcısı" skoru | SAHTE | page.tsx:88-129, 450-471 | AI değil, 3 regex. Şikâyet şablonu: olumlu yorum "çözüm beklentisi yok" diye düşük puan alır. |
| 19 | Önerilen metin + "Öneriyi uygula" | BOZUK | page.tsx:123-126, 476-484 | Uygulandıkça iç içe "Merhaba, Merhaba, …" üretir; kısa metni yapay olarak 50+ karaktere çıkarıp bonus puan eşiğini aşırır. Bkz. Bulgu 1. |
| 20 | Yorum gönder (POST) | ÇALIŞIYOR | page.tsx:179-223; review/route.ts:86-291 | Tek transaction, unique kısıt + P2002, cap, `points_credited` olayı — ekonomi invariantlarına uygun. |
| 21 | Yorum güncelle (PUT) | KISMİ | review/route.ts:297-382 | Metin/boyut silinemez (351-352), karakter rozeti sınıflandırması yok, hız sınırı yok, işletmeye bildirim yok. |
| 22 | Gönderiliyor durumu | ÇALIŞIYOR | page.tsx:492-498 | Çift tıklamayı engelliyor. |
| 23 | Başarı/hata toast'ları | KISMİ | page.tsx:168, 201, 206; admin-toast.ts:15-20 | Müşteri panelinde admin toast'ı: "Basarili: " / "Dikkat: " ön ekleri (Türkçe karaktersiz); `data.error` undefined olabilir. |
| 24 | Puan kazanma toast'ı | KISMİ | page.tsx:208-214 | Cap 0'a indirirse "+0 puan kazandınız! 🎉"; XP, seviye atlama, rozet ilerlemesi gösterilmiyor (API `rewards.xp` dönüyor, review/route.ts:280). |
| 25 | "Kazanacağınız Ödüller" kutusu | SAHTE | page.tsx:514-525 | +50/+100 sabit kodlu; gerçek değer `getPointsMatrix()` (review/route.ts:163) ve cap'ten gelir. "+100" toplam mı ek mi belirsiz (gerçekte toplam 100). |
| 26 | Gönderim sonrası yeniden yükleme | KISMİ | page.tsx:217 | `setLoading(true)` tüm sayfayı spinner'a çevirir, kaydırma konumu kaybolur. |
| 27 | `submitted` state'i | SAHTE | page.tsx:146, 205 | Set ediliyor, hiçbir yerde okunmuyor (ölü kod). `session` (135), `CreditCard`, `ThumbsUp` importları da kullanılmıyor. |
| 28 | İşletme yanıtının gösterimi | EKSİK | schema `ConsumptionReview.dealerReply/dealerRepliedAt`; route.ts:64-73 | Bayi yanıt veriyor ve müşteriye "Tüketim yorumunuza işletme yanıt verdi" bildirimi gidiyor (dealer/feedbacks/[id]/reply/route.ts:128-134) ama bu sayfa yanıtı ne çekiyor ne gösteriyor. |
| 29 | Telafi (remedy) teklifi bağlantısı | EKSİK | schema `ConsumptionReview.remedyOffers`; feedbacks/page.tsx:459-472 | Düşük puanlı yoruma bağlı teklif yalnız `/customer/feedbacks`'te görünüyor. |
| 30 | Ödül anı kutlaması (seviye/rozet/karakter barı) | EKSİK | page.tsx:205-214 | Sadece toast; karakter rozeti barına katkı hiç görünmüyor. |
| 31 | İdempotency anahtarı | KISMİ | review/route.ts:91-94; page.tsx:188-196 | Sunucu destekliyor, istemci `Idempotency-Key` göndermiyor → mekanizma atıl (unique kısıt yine de çift krediyi engelliyor). |
| 32 | Arka plan AI duygu/churn analizi | KISMİ | review/route.ts:247-255, 357-365 | `after()` dışında, await'siz → serverless'ta yarıda kesilebilir; aynı dosyada rozetler `after()` ile korunuyor (263, 272-273). |
| 33 | Karakter rozeti sınıflandırması | KISMİ | review/route.ts:261-266; character-badges.ts:240 | Yalnız POST'ta çalışır; docstring "POST/PUT'undan çağrılır" diyor ama PUT çağırmıyor. |
| 34 | Bildirimden bu sayfaya derin bağlantı | EKSİK | dealer/consumptions/route.ts:284-297; customer-reminders.ts:76; notification-center.tsx:493-518 | Bildirim `consumptionId`/`ctaPath` taşıyor ama bildirim merkezi yalnız remedy için yönlendiriyor; `ctaPath`'i okuyan istemci kodu bulunamadı (grep). |
| 35 | Sayfa metadata'sı | KISMİ | consumptions/layout.tsx:4-6 | Başlık liste ile aynı ("Tüketimlerim"); detay için işletme/ürün adı yok. |
| 36 | Mobil yerleşim | KISMİ | page.tsx:261, 397, 405-420 | Mobilde detay kartı önce, form altta; boyut yıldızları 20px (`w-5 h-5`) dokunma hedefi. |
| 37 | Azaltılmış hareket desteği | EKSİK | page.tsx:371-372 | `whileHover/whileTap` ölçekleme; projede global `MotionConfig reducedMotion="user"` yok (grep). |
| 38 | Klavye odağı / ekran okuyucu | BOZUK | page.tsx:376, 410 | `focus:outline-none` ile odak halkası siliniyor, yerine `focus-visible` stili yok; butonların erişilebilir adı yok. |
| 39 | Çok dillilik (TR/EN) | KISMİ | page.tsx:75-78, 94-125, 440, 465, 521-522 | Başlıklar `t()` ile, ama boyut etiketleri, "Skor:", "karakter", tüm yardımcı ipuçları ve öneri metni, API mesajları TR sabit. |

**Toplam:** 39 özellik · ÇALIŞIYOR 9 · KISMİ 20 · BOZUK 2 · SAHTE 3 · EKSİK 5

---

## Bulgular

### 1. "Öneriyi uygula" bonus puan eşiğini yapay olarak aşırıyor ve metni bozuyor
- **Önem:** yüksek · **Kategori:** puan ekonomisi / veri bütünlüğü · **Efor:** S
- **Kanıt:** page.tsx:123-126 (`suggestedVersion` = `Merhaba, ${text} Bu konuda … rica ediyorum. Teşekkür ederim.`, `text.length >= 10` ise her zaman üretilir), page.tsx:481 (uygula), points-rules.ts:59-61 + 277 (`longTextThreshold: 50`, base 50 / detailed 100 puan).
- **Sorun:** 10 karakterlik "güzeldi tşk" gibi bir metin, uygulamanın kendi önerisiyle ~90 karaktere çıkar ve sunucu bunu "detaylı yorum" sayıp 50 yerine 100 puan + 50 XP verir. Ekonomi kuralının amacı (gerçekten detaylı yorumu ödüllendirmek) uygulamanın kendi düğmesiyle aşılıyor. Ayrıca öneri uygulandıktan sonra metin hâlâ 10+ karakter olduğu için yeni öneri yine üretilir; her tıklamada "Merhaba, Merhaba, …" iç içe büyür. Eklenen şablon cümle ("çözüm odaklı geri dönüş rica ediyorum") olumlu bir yorumu şikâyete çevirir → AI duygu/niyet analizi ve karakter rozeti kategori sınıflandırması (character-badges.ts:252) kirli metinle beslenir.
- **Profesyonel öneri:** Bu regex "yardımcı"yı tamamen kaldırın. Yerine gerçek bir yazım yardımcısı istenirse: (a) yalnızca kullanıcı metnini *yeniden yazan* (şablon eklemeyen) bir sunucu ucu (`POST /api/customer/review-assist`, mevcut `lib/ai-engine` ile, hız sınırlı); (b) bonus eşiği hesabını öneri metninden *bağımsız* tutun — öneri kabul edildiyse gövdeye `assisted: true` bayrağı ekleyip sunucuda uzunluk bonusunu kullanıcının özgün karakter sayısına göre verin; (c) ton analizi puan yönüne göre dallansın (4-5 yıldız → "neyi sevdiniz?" ipuçları, 1-2 yıldız → çözüm beklentisi ipuçları).

### 2. İşletme yanıtı müşteriye bildiriliyor ama bu sayfada hiç gösterilmiyor
- **Önem:** yüksek · **Kategori:** eksik özellik / kırık akış · **Efor:** S
- **Kanıt:** schema `ConsumptionReview.dealerReply`, `dealerRepliedAt`; app/api/customer/consumptions/[id]/route.ts:64-73 (select'te yok); app/api/dealer/feedbacks/[id]/reply/route.ts:143-169 (yanıt yazılıyor + `REVIEW_REPLY` bildirimi + e-posta); page.tsx'te `dealerReply` geçmiyor.
- **Sorun:** Döngünün en değerli anı ("işletme sizi duydu") kayıp. Müşteri bildirimi alıyor, tüketim detayına geliyor, yanıtı göremiyor; yanıtı yalnızca `/customer/feedbacks` içindeki ikinci bir sekmede bulabiliyor (feedbacks/page.tsx:449-456). Aynı kayıt için iki ekran, iki farklı gerçeklik.
- **Profesyonel öneri:** GET select'ine `dealerReply`, `dealerRepliedAt`, `updatedAt` ve `remedyOffers { id, status }` ekleyin. Sayfada yorumun altında bir "konuşma" bloğu: müşteri yorumu → işletme yanıtı (logo + zaman) → varsa telafi teklifi CTA'sı. Yanıt varsa yorum düzenleme "yanıtlandıktan sonra düzenlenemez" veya "düzenlendi" etiketiyle sınırlanmalı (Bulgu 6).

### 3. PUT ile yorum metni ve boyutlar silinemiyor
- **Önem:** orta · **Kategori:** hata (veri) · **Efor:** S
- **Kanıt:** page.tsx:193-194 (`text: reviewText || undefined`, `dimensions: … : undefined`), review/route.ts:351-352 (`text: text || undefined` → Prisma'da "değiştirme").
- **Sorun:** Kullanıcı yorum metnini tamamen silip "Güncelle" dediğinde başarı toast'ı görür, ardından yeniden yükleme eski metni geri getirir. Kişisel verisini kaldırmak isteyen kullanıcı bunu yapamaz (KVKK açısından da zayıf). Boyut puanı UI'da hiç sıfırlanamıyor.
- **Profesyonel öneri:** İstemci boş metni `null` olarak göndersin; şema `text: z.string().max(...).nullable().optional()` olsun; PUT `text === null` ise alanı `null` yapsın. Boyut yıldızlarında aynı yıldıza tekrar tıklayınca temizleme (toggle) ve PATCH semantiği (yalnız gönderilen alanlar değişir, `null` = sil).

### 4. Güncellemede eklenen yorum karakter rozetine hiç sayılmıyor
- **Önem:** orta · **Kategori:** oyunlaştırma veri bütünlüğü · **Efor:** S
- **Kanıt:** review/route.ts:261-266 (sınıflandırma yalnız POST'ta); review/route.ts:297-382 (PUT'ta yok); character-badges.ts:240 (docstring "POST/PUT'undan çağrılır"); customer-reminders.ts:66-78 (puan verip yorum yazmayanlara "kısa bir not ekle" dürtüsü, `ctaPath: /customer/consumptions/{id}`).
- **Sorun:** Sistem kullanıcıyı önce yalnız puan verip sonra yorumu PUT ile eklemeye dürtüyor; o yorum `characterCategory` almıyor → karakter barı ilerlemiyor. Kullanıcı "yorum yazdım ama barım dolmadı" deneyimi yaşar.
- **Profesyonel öneri:** PUT'ta metin değiştiyse ve `trim().length >= 8` ise aynı `after(() => processConsumptionReviewForCharacterBadge(...))` çağrısını yapın; sürpriz/aktivite rozetlerini de tetikleyin (idempotent). Ekonomi açısından yorum *eklemenin* puanı yoksa da bunu UI'da açıkça söyleyin.

### 5. Arka plan AI analizi `after()` dışında — churn sinyali kaybolabilir
- **Önem:** orta · **Kategori:** güvenilirlik / veri · **Efor:** S
- **Kanıt:** review/route.ts:247-255 ve 357-365 (await'siz promise), aynı dosyada 263 ve 272-273 `after()` kullanıyor; app/api/feedbacks/route.ts:450-453 aynı işi `after()` ile yapıyor.
- **Sorun:** Vercel serverless'ta yanıt döndükten sonra await edilmemiş promise yarıda kesilebilir; `sentiment`, `churnRisk`, `analyzedAt` null kalır → clv-core churn agregasyonu (schema yorumu) tüketim yorumlarını eksik görür. Doğrulanmadı: üretimde ne oranda kesildiği ölçülmedi, ama desen projede bilinen bir tuzak.
- **Profesyonel öneri:** İki çağrıyı da `after(() => analyzeAndPersistConsumptionReview(...))` içine alın; ai-retry cron'unun `analyzedAt IS NULL` tüketim yorumlarını da taradığını doğrulayın.

### 6. Güncelleme hız sınırsız ve işletme bağlamından kopuk
- **Önem:** orta · **Kategori:** güvenlik / maliyet / ürün · **Efor:** M
- **Kanıt:** review/route.ts:297-382 (rate limit, idempotency, bildirim yok); proxy.ts:105-118 (API için yalnız güvenlik/CORS başlıkları); review/route.ts:357 (her PUT'ta `analyzeWithFallback` → harici AI çağrısı).
- **Sorun:** Kullanıcı aynı yorumu sınırsız sıklıkta PUT edebilir; her istek ≥5 karakter metinde bir AI çağrısı tetikler (maliyet/kötüye kullanım). Ayrıca işletme yanıt verdikten sonra müşteri puanı 1→5 ya da metni tamamen değiştirebilir; işletme haberdar olmaz, yanıt bağlamsız kalır, "düzenlendi" işareti yok. POST'ta 50+ karakterle bonus alıp PUT ile metni kısa bir şeyle değiştirmek de mümkün (düşük etkili ekonomi açığı).
- **Profesyonel öneri:** PUT'a kullanıcı başına hız sınırı (Upstash, ör. 5/saat), metin değişmediyse AI çağrısını atlayın (hash karşılaştırma), `editedAt` + `editCount` alanları, işletme yanıtından sonra düzenlemede işletmeye "yorum güncellendi" bildirimi. Ürün kararı olarak düzenleme penceresi (ör. 48 saat ya da yanıta kadar) değerlendirilmeli.

### 7. Ödül vaatleri sabit kodlu, admin matrisi ve cap yok sayılıyor
- **Önem:** orta · **Kategori:** sahte veri / tutarlılık · **Efor:** S
- **Kanıt:** page.tsx:441 (`>= 50`), 521-522 (`+50`, `+100`); messages/tr.json `rewardLongComment: "50+ karakter yorum için:"`; points-rules.ts:204-213 (matris ayarlardan okunuyor); review/route.ts:187 (`capFeedbackPoints`).
- **Sorun:** Admin matrisi değiştirirse sayfa yanlış vaat verir. Kullanıcı günlük cap'e ulaştıysa "+100" vaadi ardından "+0 puan kazandınız! 🎉" toast'ı gelir — güven kırıcı. "+100"ün ek mi toplam mı olduğu belirsiz.
- **Profesyonel öneri:** GET yanıtına `rewardPreview: { base, detailed, threshold, remainingCapToday }` ekleyin (sunucu `getPointsMatrix()` + cap okuma). UI bunu "Bugün kazanabileceğin: 50 puan · 50+ karakter yazarsan 100" şeklinde ve canlı ilerleme çubuğuyla göstersin; cap doluysa "Bugünkü puan limitine ulaştın, yorumun yine de işletmeye ulaşır" mesajı. Kazanılan 0 ise kutlama toast'ı gösterilmesin.

### 8. Yıldız puanlama klavye ve ekran okuyucu için kullanılamaz
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** page.tsx:368-386 ve 406-420 (`aria-label` yok, `focus:outline-none`, ikon-only buton), 397-425 (20px hedefler), 432-438 (`Label` `htmlFor`'suz).
- **Sorun:** Ekran okuyucu "düğme, düğme, düğme…" okur; klavye kullanıcısı hangi yıldızda olduğunu göremez; mobilde boyut yıldızları WCAG 2.5.8 (24px) altında. Textarea erişilebilir ad almıyor.
- **Profesyonel öneri:** Ortak bir `<StarRating>` bileşeni (`components/ui/star-rating.tsx`): `role="radiogroup"` + her yıldız `role="radio" aria-checked aria-label="3 / 5 yıldız"`, ok tuşlarıyla gezinme, `focus-visible:ring-2`, minimum 44px dokunma alanı (görsel ikon küçük kalabilir, padding ile). Aynı bileşen `/customer/feedbacks` ve QR geri bildirim akışında da kullanılsın.

### 9. Ödül anı tek bir toast'a indirgenmiş; tam sayfa yeniden yükleme deneyimi bozuyor
- **Önem:** orta · **Kategori:** UX / oyunlaştırma · **Efor:** M
- **Kanıt:** page.tsx:205-217 (toast + `fetchConsumption()`), 156 (`setLoading(true)` → 225-231 tüm sayfa spinner), review/route.ts:190-219 (seviye atlama bilgisi yalnız bildirime yazılıyor, yanıtta yok), 146 (`submitted` ölü).
- **Sorun:** Kullanıcı yorumunu gönderdiği an, Duolingo/Starbucks'ta olduğu gibi bir "kazandın" anı yaşamıyor; ekran bir an kaybolup aynı formla geri geliyor. XP, seviye atlama, karakter barı ilerlemesi gösterilmiyor; "Basarili: Yorumunuz kaydedildi!" gibi admin ön ekli ve Türkçe karaktersiz toast görünüyor (admin-toast.ts:17).
- **Profesyonel öneri:** POST yanıtına `{ points, xp, leveledUp, level, characterProgress? }` ekleyin (transaction içinde `credited` zaten var). İstemcide yerinde (optimistic) güncelleme: form "teşekkürler" kartına dönüşsün → puan sayacı animasyonla artsın → seviye atlandıysa mevcut kutlama bileşeni → "Karakter barına +1" mikro-geri bildirimi. Müşteri panelinde `@/lib/admin-toast` yerine doğrudan `sonner` veya müşteri toast sarmalayıcısı kullanılmalı.

### 10. Bildirimlerden bu sayfaya giden yol yok
- **Önem:** orta · **Kategori:** bilgi mimarisi / dönüşüm · **Efor:** S
- **Kanıt:** dealer/consumptions/route.ts:284-297 ("Yorum bırakmayı unutmayın!" + `consumptionId`), customer-reminders.ts:76 (`ctaPath`), notification-center.tsx:493-518 (yalnız doğum günü ve remedy CTA'sı), notification-public-dto.ts:11, 37 (`consumptionId`, `ctaPath` istemciye açılıyor ama tüketilmiyor).
- **Sorun:** Yorum dönüşümünün ana tetikleyicisi olan bildirim, sayfaya tek dokunuşla götürmüyor; kullanıcı menüden Tüketimlerim → listeden doğru kaydı bulmak zorunda.
- **Profesyonel öneri:** Bildirim merkezinde genel bir `ctaPath` / `consumptionId` → `/customer/consumptions/{id}` çözümleyicisi (beyaz liste: yalnız `/customer/` ile başlayan yollar). Push bildiriminde de aynı derin bağlantı.

### 11. Kart token'ı ve kullanılmayan alanlar istemciye gönderiliyor
- **Önem:** düşük · **Kategori:** veri minimizasyonu · **Efor:** S
- **Kanıt:** route.ts:58-63 (`card: { id, token }`), schema `PhysicalCard.token` ("Benzersiz QR token"); page.tsx'te `card` hiç kullanılmıyor; `product.price`, `product.image`, `dealer.image` da kullanılmıyor.
- **Sorun:** Kendi kartı olduğundan IDOR değil, ama QR token'ı bayinin tüketim yazmak için okuttuğu kimlik; gereksiz yere tarayıcı ağ günlüğüne/eklentilere düşüyor.
- **Profesyonel öneri:** `card` select'ini kaldırın (gerekirse yalnız son 4 karakter). Kullanılmayan alanları ya kaldırın ya da tasarımda kullanın (ürün görseli hero için değerli).

### 12. Çok dillilik karışık; aynı boyutlar farklı sayfalarda farklı adlarla
- **Önem:** düşük · **Kategori:** i18n / tutarlılık · **Efor:** S
- **Kanıt:** page.tsx:75-78 ("Hizmet", "Ortam", "Fiyat/Performans"), feedbacks/page.tsx:439-442 ("Servis", "Ambiyans", "Fiyat/Değer"); page.tsx:94-125, 440, 465; utils.ts:19, 78.
- **Sorun:** EN arayüzde Türkçe ipuçları/etiketler/tarih; aynı veri iki sayfada farklı adla.
- **Profesyonel öneri:** `lib/review-dimensions.ts` tek kaynak (anahtar, ikon, `labelKey`), iki sayfa da buradan okusun; `formatDate(..., useAppLocale())`.

### 13. Ölü kod ve hook bağımlılıkları
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** page.tsx:135 (`session`), 146/205 (`submitted`), 13 ve 18 (`CreditCard`, `ThumbsUp`), 148-150 (`fetchConsumption` bağımlılıkta yok, AbortController yok), 188-196 (`Idempotency-Key` gönderilmiyor).
- **Profesyonel öneri:** Veri katmanını `useQuery(['customer','consumption',id])` + `useMutation`'a taşıyın (projede React Query zaten var, remedy sayfası kullanıyor); idempotency anahtarını mutation başına `crypto.randomUUID()` ile üretin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Konuşma görünümü (işletme yanıtı + telafi):** Google Maps/Trendyol yorumlarında olduğu gibi yorum → işletme yanıtı → çözüm zinciri; burada veri var ama UI yok.
2. **Ödül anı ve ilerleme bağlamı (Duolingo/Starbucks):** gönderim sonrası puan/XP sayacı, seviye çubuğu, "karakter barına +1", günlük cap durumu.
3. **Bağlama duyarlı puanlama boyutları:** ürün kategorisine göre boyut seti (kahve: tat/sıcaklık/hız; perakende: ürün/personel/fiyat) ve hızlı etiket çipleri ("Güler yüzlü personel", "Bekleme uzundu") — yazmadan zengin veri.
4. **Fotoğraf ekleme:** tüketim yorumuna 1-3 fotoğraf (R2 altyapısı mevcut); kıyas ürünlerin hepsinde var ve "detaylı yorum" bonusu için yazı uzunluğundan daha anlamlı bir sinyal.
5. **Tekrar ziyaret / işletme bağlantıları:** "Bu işletmeyi favorile", "Bu işletmedeki aktif kampanyalar", "Bu işletmedeki diğer tüketimlerin" (Revolut işlem detayındaki "bu satıcıyla tüm işlemler" gibi).
6. **Makbuz benzeri işlem kartı (Revolut/Monzo):** tutar, saat, kart (maskeli), işletme konumu, kazanılan puan tek bir "receipt" kartında; paylaş/sorun bildir aksiyonları.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Revolut'un işlem detayı netliği + Duolingo'nun "ders bitti" ödül anı. Kullanıcı bildirime dokunur, tek ekranda "neyi, nerede, ne zaman tükettim" görür ve 10 saniyede puan verip ödülünü hisseder. Yorum yapılmışsa sayfa bir "konuşma kaydı"na dönüşür.

**Yerleşim (mobil öncelikli, tek sütun; lg'de 2 sütun):**
1. **İşlem başlığı (receipt hero):** işletme logosu + adı (işletme sayfasına bağlantı), ürün görseli/kategori ikonu, büyük tutar, göreli tarih, kazanılan/kazanılabilecek puan rozeti. `DashboardPageHero` diliyle tutarlı ama daha kompakt.
2. **Durum şeridi:** "Yorum bekliyor · 50-100 puan" / "Yorumlandı · işletme yanıt verdi" / "Telafi teklifi var".
3. **Yorum bekliyorsa — adım adım kart:** (a) büyük yıldızlar (erişilebilir `StarRating`), (b) yıldız seçilince kayarak açılan boyutlar + hızlı etiket çipleri, (c) metin alanı ve altında *sunucudan gelen* eşikle dolan "detaylı yorum" ilerleme çubuğu, (d) yapışkan (sticky) alt gönder butonu — mobilde başparmak bölgesinde, `env(safe-area-inset-bottom)` ile.
4. **Yorumlandıysa — konuşma görünümü:** kullanıcının yorumu (düzenle menüsüyle), altında işletme yanıtı balonu, varsa telafi teklifi CTA'sı; "düzenlendi" etiketi.
5. **Bağlam bölümü:** bu işletmedeki aktif kampanya/görev, "tekrar gel" önerisi.

**Motion/3D (ölçülü):** Yıldız seçiminde tek seferlik küçük ölçek "pop" (spring, 150ms); gönderim sonrası form kartının "teşekkürler" kartına `layout` geçişi ve puan sayacının sayarak artması; seviye atlandıysa mevcut kutlama bileşeni. 3D gereksiz — bu sayfa hızlı bir işlem ekranı. Tüm animasyonlar `useReducedMotion()` ile kapatılabilir olmalı; tercihen kök layout'a `MotionConfig reducedMotion="user"`.

**Veri/API değişiklikleri:**
- `GET /api/customer/consumptions/[id]`: `card` select'i kaldırılır; `review` içine `dealerReply`, `dealerRepliedAt`, `updatedAt`, `remedyOffers { id, status }` eklenir; yeni `rewardPreview { base, detailed, threshold, remainingCapToday }`.
- `POST …/review`: yanıta `leveledUp`, `level`, (varsa) karakter barı özetini ekle; AI analizi `after()` içine.
- `PUT …/review` → PATCH semantiği: `null` = sil, hız sınırı, metin değiştiyse AI + karakter sınıflandırması `after()` ile, `editedAt`, yanıtlanmış yorum düzenlenirse işletmeye bildirim.
- Bildirim merkezi: `ctaPath`/`consumptionId` derin bağlantı çözümleyicisi.
- Regex "AI yardımcısı" kaldırılır; istenirse hız sınırlı gerçek yeniden yazım ucu, bonus hesabı özgün metne göre.
- İstemci: React Query + ortak `StarRating`, `lib/review-dimensions.ts`; sayfa ~530 satırdan `ConsumptionReceipt`, `ReviewComposer`, `ReviewThread`, `RewardMoment` bileşenlerine bölünür.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/feedbacks` (Tüketim yorumları sekmesi):** Aynı `ConsumptionReview` kayıtlarını `/api/customer/reviews` üzerinden gösteriyor ve bu sayfada OLMAYAN işletme yanıtı ile telafi bağlantısını içeriyor (feedbacks/page.tsx:449-472); ama kartlardan bu detay sayfasına bağlantı yok (feedbacks/page.tsx'te `/customer/consumptions/{id}` href'i yok). Öneri: tüketim yorumu için **tek kanonik ekran bu sayfa** olsun; feedbacks sekmesindeki kartlar buraya bağlansın, yanıt/telafi mantığı buraya taşınsın. Ayrıca `/api/customer/reviews` tüm review alanlarını (schema'ya göre kullanıcıya gösterilmemesi gereken `characterCategory`, `churnRisk`, `sentiment` dâhil) döndürüyor — o sayfanın denetiminde ele alınmalı.
- **`/customer/consumptions` (liste):** Kardeş sayfa; `/customer/feedbacks`'ten gelen `?hasReview=false` bağlantısı (feedbacks/page.tsx:395) liste sayfasında okunmuyor (filtre state'i her zaman `'all'` başlar, consumptions/page.tsx:67). Detayın "geri" davranışı da yönlendiren sayfaya dönmeli (`router.back()` + yedek).
- **QR geri bildirim akışı (`Feedback`) ile `ConsumptionReview`:** İki paralel yorum modeli; farklı yıldız bileşenleri, farklı boyut adları, farklı yanıt ekranları (`/customer/feedbacks/[id]/journey` yalnız QR için). Ortak `StarRating` + ortak "yorum yolculuğu" görünümü ile iki model tek UX diliyle sunulmalı; model birleştirme ise ayrı, daha büyük bir mimari karar.
- **Kaldırma/birleştirme:** Sayfa kaldırılmamalı — karakter rozeti ekonomisinin tek girdi kapısı. Rolü "tüketim + yorum + yanıt + telafi" merkezi olarak genişletilmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran/çağrılan kod, Prisma şeması ve ilgili yardımcılar baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. "Öneriyi uygula" detaylı yorum bonusunu tetikliyor — **DOĞRULANDI (önem: YÜKSEK değil, ORTA)**
- Davranış gerçek: `page.tsx:123-126` 10+ karakterlik her metni `Merhaba, … Bu konuda … rica ediyorum. Teşekkür ederim.` şablonuna sarıyor; `page.tsx:481` bunu doğrudan `reviewText`'e yazıyor. Eşik yalnız uzunluk: `lib/points-rules.ts:59-61` (50 karakter) + `getConsumptionReviewReward` (`lib/points-rules.ts:276-282`, `trim().length >= threshold`). Sunucu `review/route.ts:164` ile metne bakıp 100 puan / 50 XP veriyor.
- İç içe büyüme gerçek: uygulanan metin ≥10 karakter olduğundan öneri yeniden hesaplanıyor (`page.tsx:152`), ikinci tıklama `Merhaba, Merhaba, …` üretir; şablondaki "geri dönüş" ifadesi `hasExpectation` regex'ini (`page.tsx:103`) tetiklediğinden ikinci tur "hızlı bir geri dönüş" cümlesini ekler.
- Ekonomik etkinin sınırı (iddianın abartılı kısmı): uzunluk eşiği zaten 50 rastgele karakterle aşılabiliyor; düğme yeni bir saldırı vektörü değil, var olan zayıf kuralı tek tıka indiriyor. Puan `capFeedbackPoints` (`review/route.ts:187`) ile günlük/haftalık sınırlı ve her yorum dealer'ın oluşturduğu gerçek bir `Consumption`'a bağlı (`consumptionId @unique`, `prisma/schema.prisma:1604`) — sınırsız basım yok.
- Asıl zarar veri kalitesi: rating'den bağımsız olarak her yoruma şikâyet şablonu öneriliyor; "Çok lezzetliydi, bayıldık" (5 yıldız) yazan müşteri öneriyi uygularsa metin "çözüm odaklı bir geri dönüş rica ediyorum" ile kaydedilir. Bu metin AI duygu/churn analizine (`review/route.ts:48`) ve karakter kategorisi sınıflandırmasına (`lib/character-badges.ts:252`, `classifyFeedbackCategory(text)`) girer.
- Yeniden üretim: 5 yıldız ver → "Harika bir yerdi" (16 karakter) yaz → "Öneriyi uygula" → gönder. Sonuç: ~95 karakterlik şikâyet kalıplı metin, +100 puan, bu metinle AI analizi ve kategori ataması.
- Öneri: regex "AI yardımcısı" ya kaldırılmalı ya da rating ≤2 ile sınırlı, idempotent (zaten sarılı metni tekrar sarmayan) hâle getirilmeli; bonus kararı sunucuda "özgün kelime sayısı / tekrar oranı / şablon cümle çıkarılmış uzunluk" gibi içerik ölçütüne bağlanmalı.

### 2. İşletme yanıtı detay sayfasında yok — **DOĞRULANDI (önem: ORTA/DÜŞÜK; "akış kırık" ifadesi kısmen abartılı)**
- `ConsumptionReview.dealerReply` / `dealerRepliedAt` şemada var (`prisma/schema.prisma:1609-1610`); `app/api/customer/consumptions/[id]/route.ts:64-73` review select'inde yok; `page.tsx:65-71` arayüz tipinde de yok → detay sayfası yanıtı hiçbir koşulda gösteremez.
- Yanıt yazılıyor ve bildirim gidiyor: `app/api/dealer/feedbacks/[id]/reply/route.ts:143-169`.
- Düzeltme (iddiadaki iki yanlış): (a) e-posta CTA'sı `/customer/feedbacks`'e gidiyor (`lib/notify-email.ts:127`) ve orada `activeTab` varsayılanı zaten `'consumption'` (`app/customer/feedbacks/page.tsx:96`), yanıt `feedbacks/page.tsx:449-454`'te görünüyor — "ikinci sekme" değil, varsayılan sekme. (b) Uygulama içi `REVIEW_REPLY` bildirimi ise yalnız `{ reviewId }` taşıyor, `ctaPath` yok; `components/dashboard/notification-center.tsx` bu tür için yönlendirme yapmıyor → zil bildiriminden yanıta ulaşmanın yolu yok.
- Yeniden üretim: işletme bir tüketim yorumuna yanıt verir → müşteri zil bildirimine tıklar (yönlendirme yok) → `/customer/consumptions/{id}`'ye gider → yanıt görünmez.
- Öneri: GET select'ine `dealerReply`, `dealerRepliedAt` eklenip sayfada "İşletme yanıtı" konuşma balonu gösterilmeli; bildirim verisine `ctaPath: /customer/consumptions/{consumptionId}` eklenip bildirim merkezinde genel `ctaPath` çözümleyicisi kurulmalı.

### 3. PUT ile yorum metni silinemiyor — **DOĞRULANDI (metin için; boyutlar için kısmen)**
- İstemci boş metni `undefined`'a çeviriyor (`page.tsx:193`), sunucu da `text || undefined` yazıyor (`review/route.ts:351`); Prisma `undefined` alanı güncellemez → eski metin kalır, yanıt `'Yorumunuz güncellendi'` (`review/route.ts:370`) ile başarı döner, `fetchConsumption()` (`page.tsx:217`) eski metni geri yükler.
- Müşteri tarafında başka bir düzenleme/silme ucu yok (`app/api/customer/reviews/route.ts` yalnız GET; `consumptionReview.update/delete` çağrıları yalnız admin/dealer/bu rotada).
- Ek yan etki: boş metinli PUT, analizi `text: undefined` ile çağırır (`review/route.ts:357-362`) → `analyzeAndPersistConsumptionReview` rating'den sentiment türetir (`review/route.ts:28-33`) ama DB'de eski metin durur ve `churnRisk` sıfırlanmaz → metin ile sinyal tutarsızlaşır.
- Boyutlar: arayüzde bir boyutu "kaldırma" kontrolü zaten yok (`page.tsx:409` yalnız 1-5 atar); dolayısıyla "boyutlar silinemiyor" pratikte UI sınırlaması, ayrı bir veri kaybı senaryosu yok.
- Yeniden üretim: metinli yorumu aç → metni tamamen sil → "Güncelle" → başarı toast'ı → sayfa yenilenince eski metin geri gelir.
- Öneri: PATCH semantiği (`text: null` = sil), şemada `text: z.string().max(...).nullable().optional()`; sunucuda `text === null ? null : text` ayrımı; silmede sentiment/churnRisk/characterCategory'nin de temizlenmesi (KVKK "silme hakkı" ile uyumlu).

### 4. PUT ile eklenen yorum karakter rozetine sayılmıyor — **DOĞRULANDI**
- Sınıflandırma yalnız POST'ta (`review/route.ts:261-266`); PUT (`review/route.ts:297-382`) `processConsumptionReviewForCharacterBadge` çağırmıyor. Proje genelinde başka çağıran yok (yalnız `review/route.ts:264`; `app/api/admin/character-test` test yolu). Docstring `lib/character-badges.ts:240` "POST/PUT'undan çağrılır" diyor — kodla çelişiyor.
- Sayım `characterCategory` + `text: { not: null }` şartına bağlı (`lib/character-badges.ts:194, 353, 365`) → PUT ile metin eklenen yorum asla sayılmaz.
- Sistem kullanıcıyı tam bu akışa itiyor: `lib/customer-reminders.ts:66-78` "Puan verdin ama yorum boş kaldı" bildirimi `ctaPath: /customer/consumptions/{id}` ile detay sayfasına yönlendiriyor; orada gönderim PUT olur (`page.tsx:187`).
- Yeniden üretim: yalnız yıldızla yorum gönder (POST, metinsiz) → hatırlatma bildirimine tıkla → 60 karakterlik yorum yaz → güncelle → `characterCategory` null kalır, karakter barı ilerlemez (detaylı yorum puanı da verilmez; o ayrı bir ürün kararı).
- Öneri: PUT'ta metin değiştiyse ve `characterCategory` null ise (ya da metin anlamlı değiştiyse) `after()` ile sınıflandırma; puan farkının (base→detailed) tek seferlik, idempotent kredisi ayrı bir karar olarak değerlendirilmeli.

### 5. AI analizi `after()` dışında — **DOĞRULANDI (kod kusuru kesin; üretimdeki kayıp oranı ölçülmedi)**
- POST `review/route.ts:247-255` ve PUT `review/route.ts:357-365` analizi await'siz başlatıyor; aynı dosya `review/route.ts:259-260` yorumunda bu desenin Vercel serverless'ta "yarıda kesildiğini" kendisi söylüyor ve rozetleri `after()` ile koruyor. `app/api/feedbacks/route.ts:450-453` aynı işi `after()` ile yapıyor.
- Telafi mekanizması yok: `app/api/cron/ai-retry/route.ts:36` yalnız `prisma.feedback`'i tarıyor; `ConsumptionReview.analyzedAt` null kalan kayıtları yeniden işleyen bir yol yok (`analyzedAt` yalnız bu rotada yazılıyor).
- Etki: `lib/clv-core.ts:90-117` churn agregasyonu `ConsumptionReview.churnRisk`'i okuyor; analiz kesilirse o müşteri için sinyal hiç oluşmaz (sessiz eksik veri). AI çağrısı saniyeler sürebildiğinden, yanıt döndükten sonra örneğin dondurulma riski gerçek; ancak üretimde kaç kaydın etkilendiği DB'ye dokunulmadığı için doğrulanmadı (`analyzedAt IS NULL AND createdAt < now()-1h` sorgusu ile salt-okunur ölçülebilir).
- Öneri: her iki çağrıyı `after(() => analyzeAndPersistConsumptionReview(...))` içine almak; `ai-retry` cron'una `consumptionReview where analyzedAt null and createdAt < now-15m` dalı eklemek (idempotent, sınırlı batch).

**Özet:** 5 iddianın 5'i de kodda doğrulandı; ancak hiçbiri KRİTİK değil. #1 ekonomik açıdan yeni bir vektör değil (asıl zarar içerik/sinyal kirliliği), #2'deki "ikinci sekme" tespiti yanlış (yanıt varsayılan sekmede ve e-posta CTA'sı oraya gidiyor; kırık olan zil bildirimi ve detay sayfası). Gerçek öncelik sırası: #3 (silme hakkı + sessiz başarısızlık) ≈ #4 (karakter ekonomisi, hatırlatma akışıyla doğrudan tetikleniyor) > #5 > #1 > #2.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/voices` (Ben › Seslerim). Sunucu bileşeni `app/customer/me/voices/page.tsx` özet + ilk liste sayfası + telafileri paralel ön yükler; istemci adası `components/customer/m-seslerim/**` (çekmece gövdeleri `next/dynamic` ile yalnız açılınca yüklenir). Veri katmanı `lib/customer-voices/{types,core,server}.ts`; BFF uçları `GET /api/customer/voices` (imleç sayfalı birleşik liste), `GET /api/customer/voices/summary` ("Sesin"), `GET /api/customer/voices/[key]` (detay; `fb-<id>` / `cs-<consumptionId>`), `GET /api/customer/remedy` (telafi listesi, yeniden yazıldı). Hepsi `defineRoute` (yalnız CUSTOMER, zod, hız sınırı, zarf v2). Eski rotalar sorgu parametrelerini koruyarak `permanentRedirect` ile Seslerim'e gider. Testler: `__tests__/lib/customer-voices.test.ts`, `__tests__/api/customer-voices-routes.test.ts`, `__tests__/api/customer-review-write.test.ts` (35 test, yeşil).
### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Sayfa çekmeceye taşındı; kapatınca kullanıcı geldiği listede kalır. Eski rota `?id=cs-<id>`'ye kalıcı yönlenir. |
| 2 | ÇALIŞIYOR | react-query + `AbortSignal`. |
| 3 | ÇALIŞIYOR | İskelet; gönderim sonrası tam sayfa spinner yok (sorgu geçersizleştirme). |
| 4 | ÇALIŞIYOR | `QueryState` hata + "Tekrar dene"; 404/403 ayrı durum. |
| 5 | ÇALIŞIYOR | Gerçek "bulunamadı" durumu (otomatik yönlendirme yok). |
| 6 | ÇALIŞIYOR | `findFirst({ id, customerId })`; 403/404 ayrımı da kalktı (varlık sızmaz). |
| 7 | ÇALIŞIYOR | Logo + ad + "Mekânı gör" (`/customer/places/[dealerId]`). |
| 8 | ÇALIŞIYOR | Kategori ikonu + ad; kullanılmayan alanlar ve kart token'ı artık çekilmiyor (eski GET ucu silindi). |
| 9 | ÇALIŞIYOR | `Intl`, uygulama dili, Europe/Istanbul. |
| 10 | ÇALIŞIYOR | 0 ya da boş tutar gizli; para biçimi dile göre. |
| 11 | ÇALIŞIYOR | |
| 12 | ÇALIŞIYOR | DS `RatingInput` (radiogroup, ok tuşları, görünür odak, 56px). |
| 13 | ÇALIŞIYOR | `RatingInput`'un kendi davranışı. |
| 14 | ÇALIŞIYOR | 5 boyut (temizlik dahil), tek tek temizlenebilir, TR/EN. İşletme türüne göre boyut seti KALAN. |
| 15 | ÇALIŞIYOR | `<label htmlFor>`, `maxLength`. |
| 16 | ÇALIŞIYOR | Sınır `INPUT_LIMITS` ile aynı (2000), TR/EN. |
| 17 | ÇALIŞIYOR | Eşik SUNUCUDAN (admin matrisi), `trim` ile; ilerleme çubuğu. |
| 18 | KALDIRILDI | SAHTE regex "AI yardımcısı" kaldırıldı. |
| 19 | KALDIRILDI | BOZUK "Öneriyi uygula" (bonus eşiğini yapay aşırma + şikâyet şablonu) kaldırıldı. |
| 20 | ÇALIŞIYOR | `defineRoute` + `mintPoints` (tek seferlik `consumption_review:<id>`, `feedback` tavanı, `points_credited`); P2002 → 409. |
| 21 | ÇALIŞIYOR | PATCH semantiği: `text: null` siler (üslup kategorisi de), boyutlar silinebilir; saatlik hız sınırı; metin değiştiyse AI + karakter rozeti `after()` içinde; yanıtlanmış yorum düzenlenince bayiye bildirim. |
| 22 | ÇALIŞIYOR | |
| 23 | ÇALIŞIYOR | `sonner`; "Basarili:" önekli admin toast'ı yok. |
| 24 | ÇALIŞIYOR | Gerçek kredi; tavan doluyken "+0 🎉" yerine dürüst metin. Seviye ve puan kapsülü An Motoru'ndan (mintPoints → kredi anı). |
| 25 | ÇALIŞIYOR | SAHTE "+50/+100" yerine sunucu önizlemesi (taban/ayrıntılı + bugünkü kalan tavan). |
| 26 | ÇALIŞIYOR | Yerinde güncelleme; kaydırma konumu korunur. |
| 27 | KALDIRILDI | Ölü `submitted` state ve kullanılmayan importlar (dosya tümden yeniden yazıldı). |
| 28 | ÇALIŞIYOR | İşletme yanıtı + tarih. |
| 29 | ÇALIŞIYOR | Telafi teklifi aynı çekmecede seçilir. |
| 30 | ÇALIŞIYOR (kısmi) | Puan kapsülü ve seviye anı An Motoru'nda; "karakter barına +1" mikro geri bildirimi KALAN (rozet sürprizini bozmadan ürün kararı gerekli). |
| 31 | ÇALIŞIYOR | İstemci her gönderimde `Idempotency-Key` yollar; uç `idempotent: true`. |
| 32 | ÇALIŞIYOR | Analiz `after()` içinde; kısa/boş metinde churn sinyali temizlenir. `ai-retry` cron'unun tüketim yorumlarını taraması KALAN (sahiplik dışı). |
| 33 | ÇALIŞIYOR | PUT ile metin eklenince karakter rozeti sınıflandırması çalışır. |
| 34 | KALAN | Eski rota çekmeceye yönlenir ve teşekkür bildirimine `ctaPath` eklendi; bildirim merkezinin `ctaPath` izlemesi sahiplik dışı. |
| 35 | ÇALIŞIYOR | Seslerim başlığı; çekmece başlığında tür. |
| 36 | ÇALIŞIYOR | Mobilde alttan çekmece, yazma formu en üstte, dokunma hedefleri ≥ 44px. |
| 37 | ÇALIŞIYOR | Global hareket politikası (`MotionPolicyConfig`) + DS bileşenleri. |
| 38 | ÇALIŞIYOR | BOZUK düzeldi: `focus-visible` halkaları ve erişilebilir adlar. |
| 39 | ÇALIŞIYOR | Etiketler, ipuçları, tarih ve para TR/EN. |

### Kapanan bulgular
1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (rota yönlendirmesi; bildirim merkezi sahiplik dışı), 11, 12, 13 — **13/13**.

### ŞEMA İSTEKLERİ
- `ConsumptionReview.editedAt` / `editCount`: "düzenlendi" işareti için (`updatedAt` bayi yanıtında ve analizde de değiştiği için kullanılamıyor).
