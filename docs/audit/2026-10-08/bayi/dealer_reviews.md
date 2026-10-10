# /dealer/reviews

**Amaç:** Bayinin, müşterilerin kart/QR ile kaydedilen tüketimlerine bıraktığı yorumları (`ConsumptionReview`) tek listede görmesi. Sayfa puan ortalaması ve yıldız dağılımı gösterir, yıldıza göre filtreler, yapay zekâdan yanıt taslağı alıp birini müşteriye gönderir.

**Genel puan:** 5.0 / 10

**Karar:** **birleştir**. Bu sayfanın listelediği veri, aynı API'den (`/api/dealer/reviews`) beslenen `/dealer/feedbacks` sayfasındaki "Tüketim yorumları" sekmesinde de var. O sekmede boyut puanları, telafi gönderme ve düzenlenebilir yanıt dialog'u da bulunuyor. İki sayfa aynı işi yapıyor, yalnızca yetenekleri farklı. Doğru hedef, bu sayfanın güçlü yanlarını (puan özeti, dağılım filtresi, satır içi AI taslakları) tek bir "Yorum ve Geri Bildirim Gelen Kutusu"na taşımak. Sayfanın kendisi ayrıca sessizce 50 kayıtla sınırlı kalıyor, AI taslağı düzenlenmeden müşteriye gidiyor ve yanıt e-postasında HTML enjeksiyonu var. Bu üçü birleştirmeden bağımsız olarak hemen düzeltilmeli.

> Kapsam: `app/dealer/reviews/page.tsx` (432 satır), `app/dealer/reviews/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/reviews/route.ts`, `app/api/dealer/feedbacks/[id]/reply/route.ts`, `app/api/ai/generate-reply/route.ts`, `lib/groq.ts#suggestResponseWithGroq`, `lib/ai-reply-tone.ts`, `lib/notify-email.ts`, `lib/api-auth.ts`, `lib/api-http.ts`, `lib/app-locale.tsx`, `lib/utils.ts#formatRelativeTime`, `components/providers.tsx`, `components/dashboard/sidebar.tsx`, `prisma/schema.prisma` (`ConsumptionReview`, `Consumption`), `messages/{tr,en}.json`, `next.config.*` (images), karşılaştırma için `app/dealer/feedbacks/page.tsx`, `app/dealer/remedy-queue/page.tsx` ve `app/dealer/settings/page.tsx`. Kod çalıştırılmadı. Tüm bulgular kod okunarak doğrulandı. `node_modules/next-auth/react/index.js` yalnızca oturum yenileme davranışını doğrulamak için okundu.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme, yıldız filtresi ve AI taslak üretimi çalışıyor. Ancak liste sessizce 50 kayıtta kesiliyor ve sayfalama yok. Elle yanıt yazılamıyor, yanıt düzenlenemiyor, telafi gönderilemiyor, arama/sıralama/"yanıtsızlar" filtresi yok. |
| UX | 5/10 | Puan özeti ile dağılım filtresi anlaşılır. Buna karşın AI taslağı düzenlenmeden tek tıkla müşteriye gidiyor. Hata durumu "yorum yok" gibi görünüyor. Yanıtlanmış kartlarda boş bir "AI asistanı" başlığı duruyor. |
| Görsel | 6/10 | Kartlar temiz, amber yıldızlar ve iki sütunlu yerleşim okunaklı. Hero ise panelin geri kalanının kullandığı `DashboardPageHero` yerine elle yazılmış. Kartlarda öncelik/aciliyet hiyerarşisi yok. |
| Mimari | 4/10 | Veri çekme ham `fetch` + `useEffect` ile ve `session` nesnesine bağlı. Aynı iş için iki ayrı AI ucu kullanılıyor. API, `...r` ile ham alanları (ör. `customerId`) sızdırıyor. Ayarlarda kaydedilen `defaultReplyTemplate` hiçbir yerde kullanılmıyor. |
| Performans | 6/10 | Üç sorgu `Promise.all` ile paralel ve indeksli. Ancak oturum her yenilendiğinde liste baştan çekiliyor ve iskelet yanıp sönüyor. Filtreden bağımsız istatistikler her filtrede yeniden hesaplanıyor. Kaydetmeden sonra gereksiz bir `router.refresh()` var. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde yerleşim düzgün alt alta diziliyor ve azaltılmış hareket global olarak destekleniyor. Ancak yıldız puanları ekran okuyucuya hiç okunmuyor, filtre düğmelerinde `aria-pressed` yok ve masaüstündeki iç içe kaydırma alanı klavyeyle yönetilemiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment meta başlığı/açıklaması | ÇALIŞIYOR | `app/dealer/reviews/layout.tsx:4-6` | TR açıklama: "Yıldız puanları, yorum metinleri ve yanıt akışları". |
| 2 | Kenar menü girişi ("Geri bildirimlerim" grubu) + Keşfet bağlantısı | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:255`, `app/dealer/discover/page.tsx:42`, `lib/visibility-controls.ts:51` | Aynı grupta hemen üstünde `/dealer/feedbacks` var (bkz. Çakışmalar). |
| 3 | API rol koruması + token-replay kontrolü | ÇALIŞIYOR | `app/api/dealer/reviews/route.ts:17-18`, `lib/api-auth.ts:52-80` | |
| 4 | Veri kapsamı: yalnızca bayinin kendi yorumları (IDOR koruması) | ÇALIŞIYOR | `route.ts:29-31,41-43` | `consumption.dealerId = session.user.id`. Yanıt yazmada da `updateMany` sahiplik filtresi var (`reply/route.ts:143-149`). |
| 5 | ADMIN erişimi | KISMİ | `route.ts:17,30`, `generate-reply/route.ts:58` | Liste ADMIN'e açık ama admin'in kendi ID'siyle filtrelendiği için hep boş geliyor. AI ucu ADMIN'e 401 dönüyor. Bayi seçici yok. |
| 6 | Hero başlık (ikon + başlık + açıklama) | ÇALIŞIYOR | `page.tsx:176-198` | Elle yazılmış. Bayi panelinde 25 sayfa `DashboardPageHero` kullanıyor; `/dealer/feedbacks` de öyle (`feedbacks/page.tsx:406`). |
| 7 | "Telafi Merkezi →" bağlantısı | KISMİ | `page.tsx:190-196`, `components/dashboard/sidebar.tsx:256` | Metin sabit Türkçe, i18n'den gelmiyor. `next/link` yerine `<a>` olduğu için tam sayfa yeniden yükleniyor. Hedef sayfanın asıl adı "Telafi onay kuyruğu", yani etiket yanıltıcı. Menüde `remedy_offers` modülüne bağlı olmasına rağmen bağlantı bu kontrolü atlıyor. |
| 8 | Ortalama puan (büyük sayı) | ÇALIŞIYOR | `page.tsx:218`, `route.ts:129` | Filtreden bağımsız olarak tüm yorumların ortalaması gösteriliyor. |
| 9 | Ortalama için yıldız gösterimi | ÇALIŞIYOR | `page.tsx:219-223` | Erişilebilir metin yok (bkz. #50). |
| 10 | Toplam yorum sayısı | ÇALIŞIYOR | `page.tsx:224` | Yalnızca 50 kayıt listelendiği hâlde gerçek toplamı yazıyor. Bu çelişki için bkz. #21. |
| 11 | Yıldız dağılım çubukları (5→1) | ÇALIŞIYOR | `page.tsx:228-247`, `route.ts:86-90,100-106` | |
| 12 | Dağılım çubuğuna tıklayarak filtreleme (aç/kapa) | ÇALIŞIYOR | `page.tsx:233-236` | `aria-pressed` yok ve düğmenin erişilebilir adı "5 12" gibi anlamsız okunuyor. |
| 13 | "Filtreyi temizle" düğmesi | ÇALIŞIYOR | `page.tsx:249-253` | |
| 14 | İstatistik iskeleti | ÇALIŞIYOR | `page.tsx:209-214` | |
| 15 | İstatistik hata durumu | KISMİ | `page.tsx:148,158,255` | Hata olunca `stats=null` oluyor ve kart başlığı altında içerik bomboş kalıyor. Mesaj ya da yeniden dene düğmesi yok. |
| 16 | Masaüstünde yapışkan (sticky) yan panel | ÇALIŞIYOR | `page.tsx:202` | |
| 17 | Liste veri çekme (AbortController ile) | KISMİ | `page.tsx:129-171` | Yarış koruması doğru kurulmuş. Ancak bağımlılık dizisinde `session` nesnesi var ve her sekme odağında/5 dakikada bir liste yeniden çekiliyor (Bulgu B5). |
| 18 | Liste iskeleti | KISMİ | `page.tsx:262-274` | Her yeniden çekmede tüm liste iskelete dönüyor ve kaydırma konumu kayboluyor. |
| 19 | Boş durum | KISMİ | `page.tsx:275-282` | CTA yok. `/dealer/feedbacks` boş durumunda "Kart tara" CTA'sı bulunuyor (`feedbacks/page.tsx:595-600`). Filtreli boş sonuç ile hiç yorum olmaması aynı mesajla gösteriliyor. |
| 20 | Yükleme hatasında toast | ÇALIŞIYOR | `page.tsx:143-158` | |
| 21 | Sayfalama / "daha fazla yükle" | BOZUK | `route.ts:8-9,23`, `page.tsx:137` | API varsayılan olarak 50 kayıt döndürüyor ve istemci `limit` göndermiyor. 51. ve sonraki yorumlara **hiçbir yoldan ulaşılamıyor**, kullanıcıya bir uyarı da gösterilmiyor. Bu sırada sayaç "230 değerlendirme" yazabiliyor. |
| 22 | Kart giriş animasyonu (kademeli) | ÇALIŞIYOR | `page.tsx:285-290`, `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket destekleniyor. Sayfa ayrıca kendi `LazyMotion strict`'ini sarıyor; global LazyMotion zaten olduğu için bu gereksiz. |
| 23 | Müşteri avatarı (`next/image`) | KISMİ | `page.tsx:296-297`, `next.config.*:272-291`, `app/api/user/profile/route.ts:13` | `image` alanı serbest bir string (max 2048). İzinli listede olmayan bir alan adı (ör. R2 public URL, Facebook) üretimde kırık görsel, geliştirmede ise çalışma zamanı hatası veriyor. `onError` ile baş harfe düşen bir yedek yok. |
| 24 | Avatar baş harf yedeği | KISMİ | `page.tsx:299` | İsimsiz müşteri için sabit `'M'` gösteriliyor. EN arayüzde de "M". |
| 25 | Müşteri adı / "İsimsiz Müşteri" | ÇALIŞIYOR | `page.tsx:307` | |
| 26 | Müşteri e-postası | ÇALIŞIYOR | `page.tsx:308`, `route.ts:53-57` | Sistem genelinde tutarlı (`api/dealer/customers` da e-posta veriyor). KVKK açısından maskeleme düşünülebilir. |
| 27 | Yorum yıldızları | ÇALIŞIYOR | `page.tsx:311-315` | Ekran okuyucuya puan okunmuyor. |
| 28 | Göreli zaman ("3 saat önce") | ÇALIŞIYOR | `page.tsx:316-319`, `lib/utils.ts:33` | Mutlak tarih için tooltip/`<time dateTime>` yok. |
| 29 | Yorum metni / "Yazılı yorum bırakılmadı" | ÇALIŞIYOR | `page.tsx:323-336` | `comment` alanı DB'de yok, ölü bir geriye dönük alan (`page.tsx:23`). |
| 30 | Mevcut bayi yanıtı + gönderim zamanı | ÇALIŞIYOR | `page.tsx:338-352` | |
| 31 | Ürün rozeti + tutar | KISMİ | `page.tsx:354-364`, `prisma/schema.prisma:1580` | `amount` alanı `Float?`. Tutar null olunca yalnızca " ₺" yazıyor. `formatCurrency`/yerel biçim yok, ₺ sabit. Kategori ikonu API'den geliyor ama kullanılmıyor. |
| 32 | Boyut puanları (lezzet/servis/ambiyans/fiyat) | EKSİK | `schema.prisma:1608`, `feedbacks/page.tsx:643-654` | Veri modelde var ve kardeş sayfa bunu gösteriyor. Bu sayfa göstermiyor. |
| 33 | AI duygu / kayıp riski sinyali (`sentiment`, `churnRisk`) | EKSİK | `schema.prisma:1616-1618` | API yanıtında zaten var (`...r`). Ekranda bir triage/öncelik ipucu olarak hiç kullanılmıyor. |
| 34 | "Yanıt üret" (AI taslak) düğmesi | KISMİ | `page.tsx:108-127,372-383`, `generate-reply/route.ts:120-145` | Çalışıyor. Tek bir `generatingId` olduğu için iki karta peş peşe basılınca ilk kartın spinner'ı kayboluyor ve tekrar tıklanabilir hâle geliyor (Bulgu B11). |
| 35 | AI taslak listesi (3 ton) | ÇALIŞIYOR | `page.tsx:386-407`, `lib/groq.ts:216` | |
| 36 | "Bu yanıtı kullan" (gönder) | KISMİ | `page.tsx:63-106,392-404` | Taslak **düzenlenmeden** anında kaydediliyor; müşteriye bildirim ve e-posta gidiyor. Onay ve geri alma yok (Bulgu B2). |
| 37 | "Taslakları iptal et" | ÇALIŞIYOR | `page.tsx:408-415` | |
| 38 | Şablon yanıtların "yapay zekâ" diye sunulması | SAHTE | `generate-reply/route.ts:140-145`, `page.tsx:120-121` | LLM yoksa, başarısızsa ya da yorum metni boşsa sabit 3 şablon dönüyor. Bu durumda `source: 'template'` alanı görmezden geliniyor ve toast "Yapay zeka yanıtları oluşturuldu" diyor. |
| 39 | Yanıtlanmış kartlarda AI bölümü | BOZUK | `page.tsx:367-372` | `dealerReply` varken düğme gizleniyor ama "Yapay zeka yanıt asistanı" başlığı ve ayraç kalıyor. Her yanıtlanmış kartta boş bir bölüm görünüyor. |
| 40 | Elle yanıt yazma | EKSİK | `page.tsx` (textarea yok) | API serbest metni kabul ediyor (`reply/route.ts:29-32`). Kardeş sayfada dialog var. |
| 41 | Yanıtı düzenleme / geri çekme | EKSİK | `page.tsx:372` | API üzerine yazmaya izin veriyor (`reply/route.ts:143-149`) ama arayüzde yolu yok. |
| 42 | Ayarlardaki "varsayılan yanıt şablonu" kullanımı | EKSİK | `app/dealer/settings/page.tsx:623-627` | `defaultReplyTemplate` kaydediliyor ama projede okunduğu tek bir yer yok, yani ölü bir ayar. |
| 43 | Yorumdan telafi teklifi gönderme | EKSİK | `feedbacks/page.tsx:691-699`, `app/api/dealer/consumption-reviews/[id]/remedy/route.ts` | Uç hazır, kardeş sayfada düğme var, burada yok. Yalnızca kuyruğa giden genel bir bağlantı var. |
| 44 | Arama / tarih aralığı / sıralama / "yanıtsızlar" filtresi | EKSİK | `route.ts:21-23` | API yalnızca `rating` ve `limit` okuyor. |
| 45 | Dışa aktarma (CSV) | EKSİK | — | |
| 46 | Kaydettikten sonra `router.refresh()` | SAHTE | `page.tsx:100` | Sayfa tamamen istemci tarafında ve RSC verisi yok. Çağrı yalnızca layout'un sunucu bileşenlerini (`getSeoSettings` vb.) boşuna yeniden çalıştırıyor. |
| 47 | Yanıt sonrası müşteriye uygulama içi bildirim + e-posta | ÇALIŞIYOR | `reply/route.ts:158-172`, `lib/notify-email.ts:107-129` | E-posta gövdesi kaçışsız HTML (Bulgu B3). Hız sınırı ve tekrar engeli yok. |
| 48 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:200-202,261,305` | Alt alta diziliyor. Puan kartı listeyi yaklaşık bir ekran aşağı itiyor. Mobil için kompakt filtre çubuğu yok. |
| 49 | Masaüstünde iç kaydırma alanı (liste) | KISMİ | `page.tsx:261` | Ana `main` zaten kaydırılıyor, iç içe ikinci bir kaydırma oluşuyor. Alan odaklanamadığı (`tabIndex`/`role="region"` yok) için klavyeyle ok tuşlarıyla kaydırılamıyor. |
| 50 | Erişilebilir puan metinleri | EKSİK | `page.tsx:219-223,238-239,311-315` | `Star` ikonları `aria-hidden` değil ve `sr-only` "5 üzerinden 4" metni de yok. |
| 51 | AI ucunda hız sınırı / maliyet koruması | EKSİK | `app/api/ai/generate-reply/route.ts` (limiter yok) | `app/api/ai/analyze/route.ts` `rate-limit` kullanıyor, bu uç kullanmıyor. |
| 52 | Hata durumu ekranı + yeniden dene | EKSİK | `page.tsx:143-159,275-282` | Ağ veya sunucu hatasında liste "Yorum bulunamadı" boş durumunu gösteriyor. |

**Durum sayımı:** ÇALIŞIYOR 25 · KISMİ 13 · BOZUK 2 · SAHTE 2 · EKSİK 10 (toplam 52)

---

## Bulgular

### B1 · yüksek · İşlevsellik / veri bütünlüğü: Liste sessizce 50 kayıtta kesiliyor, eski yorumlara ulaşılamıyor
- **Kanıt:** `app/api/dealer/reviews/route.ts:8-9,23` (`REVIEW_LIST_DEFAULT = 50`), `app/dealer/reviews/page.tsx:137` (yalnızca `?rating=` gönderiliyor), `page.tsx:224` (toplam sayıyı gösteriyor).
- **Sorun:** 50'den fazla yorumu olan bir bayi, 51. ve sonraki yorumları hiçbir yoldan göremiyor ve yanıtlayamıyor. Sayaç gerçek toplamı (ör. 230) yazarken liste 50'de bitiyor ve bu kesinti hiçbir yerde belirtilmiyor. Yıldız filtresi bir ölçüde hafifletiyor ama 5 yıldızlı yorumlar tek başına 50'yi geçebilir. Aynı sorun `/dealer/feedbacks` sekmesinde de var: o sayfa `page/pageSize/needsReview` gönderiyor ama API bunları okumuyor (`feedbacks/page.tsx:318-325` ↔ `route.ts:21-23`).
- **Öneri:** API'yi cursor tabanlı sayfalamaya çevirin: `cursor` (son `createdAt`+`id`), `take` ve `{ items, nextCursor, total }` sözleşmesi. İstemcide `@tanstack/react-query` `useInfiniteQuery` kullanın (proje sağlayıcısı zaten kurulu, `components/providers.tsx:213`). Listenin sonunda `IntersectionObserver` ile otomatik yükleme ve "X / Y gösteriliyor" metni olsun. Uzun listeler için `@tanstack/react-virtual` ile sanallaştırma eklenebilir.
- **Efor:** M

### B2 · yüksek · UX / marka riski: AI taslağı düzenlenmeden tek tıkla müşteriye gönderiliyor; olumsuz yorumlarda telafi vaadi üretebiliyor
- **Kanıt:** `page.tsx:392-404` ("Bu yanıtı kullan" doğrudan `handleUseAiReply` çağırıyor), `page.tsx:63-73` (POST), `reply/route.ts:158-172` (anında bildirim + e-posta), `lib/groq.ts:211-213` (olumsuz yorumlarda "çözüm öner, **telafi teklif et**" talimatı).
- **Sorun:** Bayi, LLM'in ürettiği metni okumadan ya da düzeltmeden yayınlıyor. Gönderim geri alınamıyor ve e-posta anında gidiyor. Olumsuz yorum için model, bayinin onaylamadığı bir telafi sözü verebiliyor ("size ücretsiz ikram sunmak isteriz" gibi). Bu da sistemdeki telafi akışını (`remedy-queue`, onay kuyruğu) atlayan, kayıt dışı bir taahhüt anlamına geliyor. Model ayrıca her zaman Türkçe yazıyor (`groq.ts:211`) ve işletme adı, ürün, müşteri adı gibi bağlam almıyor.
- **Öneri:** Taslağı tıklayınca düzenlenebilir bir `Textarea`ya doldurun. Gönderim ayrı bir "Gönder" eylemi olsun ve ardından 5 saniyelik "Geri al" toast'u gelsin; bildirim ve e-posta bu süre dolunca kuyruktan çıksın (`after()` + gecikme, ya da `pendingReply` durumu). Prompt'tan telafi vaadini kaldırın. Telafi gerekiyorsa yanıt kutusunun yanında "Telafi teklifi ekle" seçeneği sunulsun ve bu seçenek mevcut `/api/dealer/consumption-reviews/[id]/remedy` akışına bağlansın. Prompt'a işletme adı, ürün adı, boyut puanları ve hedef dil (müşterinin `preferredLanguage` alanı) eklensin.
- **Efor:** M

### B3 · yüksek · Güvenlik: Yanıt e-postasında kaçışsız HTML (işletme adı ve yorum metni)
- **Kanıt:** `lib/notify-email.ts:113` (`<strong>${params.dealerName}</strong>`), `:116` (yorum alıntısı), `:79` (`bodyLines` ham HTML olarak `<p>` içine ekleniyor), `reply/route.ts:14-27` (`businessName` doğrudan geçiliyor), `app/api/user/profile/route.ts:14` (`businessName` serbest metin, max 100).
- **Sorun:** Bayi `businessName` alanına `<a href="https://kötü.site">Ödülünüzü alın</a>` gibi bir değer yazarsa, Qratex markalı ve Qratex alan adından giden bir işlem e-postasına oltalama bağlantısı yerleştirebiliyor. Bu sayfanın "Bu yanıtı kullan" eylemi bu e-postayı tetikliyor. Yorum metni de kaçışsız ekleniyor; bu yalnızca müşterinin kendisine dönen bir enjeksiyon olsa da e-posta düzenini bozabilir.
- **Öneri:** `sendEventEmail` her `bodyLines` öğesini varsayılan olarak HTML-escape etsin. Bilinçli olarak HTML gereken yerler için `{ html: string }` şeklinde açıkça işaretlenmiş bir tür kabul edilsin. `emailDealerReply` içinde işletme adı ve alıntı mutlaka kaçışlansın. Aynı deseni kullanan diğer `email*` fonksiyonları da taranmalı.
- **Efor:** S

### B4 · orta · Gizlilik / API sözleşmesi: `...r` yayılımı ham `customerId` ve iç alanları bayiye sızdırıyor
- **Kanıt:** `route.ts:52` (yorum: "Ham müşteri ID'si bayiye sızdırılmaz"), `route.ts:112-113` (`...r`), `prisma/schema.prisma:1605,1611-1618` (`customerId`, `characterCategory` ("kullanıcıya gösterilmez"), `sentiment`, `churnRisk`, `dimensions`, `analyzedAt`).
- **Sorun:** `include`, modelin bütün skaler alanlarını döndürüyor. Kod içi yorumun açıkça engellemeye çalıştığı ham müşteri kimliği bu yüzden yanıtta duruyor. Oyunlaştırma için tutulan ve "kullanıcıya gösterilmez" diye işaretlenmiş `characterCategory` de bayiye gidiyor. Kart için ayrıca `card.id` dönüyor.
- **Öneri:** `include` yerine açık bir `select` ile bir DTO tanımlayın (`id, rating, text, dimensions, sentiment, churnRisk, dealerReply, dealerRepliedAt, createdAt` + müşteri/ürün özeti). Yanıt şeklini `zod` ile tipleyip istemcideki `Review` arayüzünü buradan türetin (`z.infer`).
- **Efor:** S

### B5 · orta · Performans / UX: Oturum her yenilendiğinde liste yeniden çekiliyor ve iskelet yanıp sönüyor
- **Kanıt:** `page.tsx:171` (`[session, filterRating, t]`), `page.tsx:262` (`loading ? iskelet`), `components/providers.tsx:220` (`refetchInterval={5*60} refetchOnWindowFocus`), `node_modules/next-auth/react/index.js:408-419` (odak/aralık olayında yeni bir session nesnesiyle `setSession`).
- **Sorun:** Sekmeye her dönüşte ve her 5 dakikada bir yeni bir `session` nesnesi geliyor. Bu da yorum listesini sıfırdan çekiyor ve tüm liste iskelete dönüyor; bayi uzun bir listede ilerliyorsa kaydırma konumu kayboluyor. Bulunduğu konum 50 kayıtla zaten sınırlı (B1). Ayrıca oturum yoksa `fetchReviews` erken dönüyor ve `loading` hiç `false` olmuyor, iskelet sonsuza kadar kalıyor (`page.tsx:131`).
- **Öneri:** Bağımlılığı `session?.user?.id` olarak daraltın. Daha iyisi veri katmanını `useQuery(['dealer-reviews', filter])` ile React Query'ye taşımak: `placeholderData: keepPreviousData` ile yeniden çekmede eski liste yerinde kalır, arka plan yenilemesi için de yalnızca küçük bir göstergede "Yenileniyor" yazar.
- **Efor:** S

### B6 · orta · Ürün tutarlılığı: "Yapay zekâ" etiketiyle sabit şablon yanıtlar
- **Kanıt:** `generate-reply/route.ts:125,140-145` (metin yoksa ya da LLM yoksa `source: 'template'`), `page.tsx:119-121` (`source` okunmuyor, toast "Yapay zeka yanıtları oluşturuldu").
- **Sorun:** Yazılı metni olmayan her yorumda, ya da Groq yapılandırılmamışsa, bütün yorumlara birebir aynı 3 cümle "AI" diye sunuluyor. Bayi aynı şablonu farklı müşterilere gönderdiğinde müşteri tarafında yanıt kalitesi düşüyor ve AI özelliğine olan güven sarsılıyor.
- **Öneri:** `source` alanını arayüzde gösterin: "Hazır şablon" rozeti ve "AI kullanılamadı, hazır şablon önerildi" mesajı. Metinsiz yorumlar için LLM'e yalnızca puan, ürün ve boyut puanlarıyla kısa bir bağlam verilebilir. Şablonlar bayinin `defaultReplyTemplate` alanı ve kişiselleştirme değişkenleri (`{{isim}}`, `{{ürün}}`) ile beslenmeli (bkz. B9).
- **Efor:** S

### B7 · orta · Bilgi mimarisi: `/dealer/feedbacks` ile aynı veri, farklı ve parçalı yetenekler
- **Kanıt:** `feedbacks/page.tsx:325` (aynı `/api/dealer/reviews` ucu), `:643-654` (boyut puanları), `:683-699` (yanıt dialog'u + telafi gönder), `:293` (AI öneri için `reply` ucunun `action:'suggest'` modu). Bu sayfa ise `/api/ai/generate-reply` kullanıyor (`page.tsx:111`).
- **Sorun:** Aynı yorum iki sayfada iki farklı kartla gösteriliyor ve aynı iş için iki ayrı AI ucu var. Bu sayfada telafi ve elle yanıt yok; öbür sayfada puan özeti ve satır içi AI yok. Bayi hangi sayfada ne yapabileceğini ezberlemek zorunda kalıyor ve iki ucun bakımı ikiye katlanıyor.
- **Öneri:** Tek bir "Gelen kutusu" mimarisi kurun (bkz. Çakışmalar). AI öneriyi tek uçta toplayın (`/api/ai/generate-reply`, her iki kaynak türünü zaten destekliyor). `reply` ucundaki `suggest` modunu kaldırın.
- **Efor:** L

### B8 · orta · Hız sınırı: AI üretimi ve yanıt/e-posta uçlarında sınır yok
- **Kanıt:** `app/api/ai/generate-reply/route.ts` (limiter yok; `app/api/ai/analyze/route.ts` ise `lib/rate-limit.ts` kullanıyor), `reply/route.ts:143-172` (üzerine yazma serbest, her POST'ta bildirim ve e-posta), `lib/notify-email.ts:59-100` (tekrar engeli yok).
- **Sorun:** Oturum açmış bir bayi (ya da ele geçirilmiş bir hesap) betikle sınırsız Groq çağrısı yaparak maliyet doğurabilir. Aynı yoruma tekrar tekrar POST atarak bir müşteriye sınırsız "yanıt geldi" e-postası ve bildirimi gönderebilir.
- **Öneri:** `generate-reply` için bayi başına dakika ve gün sınırı koyun (`lib/rate-limit.ts`, Upstash). Yanıt ucunda aynı yorum için bildirim ve e-postayı yalnızca ilk yanıtta ya da en fazla N dakikada bir gönderin; düzenlemelerde "yanıt güncellendi" bildirimini sessiz yapın.
- **Efor:** S

### B9 · orta · Ölü ayar: `defaultReplyTemplate` hiçbir yerde kullanılmıyor
- **Kanıt:** `app/dealer/settings/page.tsx:623-627` (alan düzenleniyor), `app/api/user/profile/route.ts:21` (kaydediliyor). Projede bu alanı okuyan başka bir kod yok (grep ile doğrulandı).
- **Sorun:** Bayi ayarlardan "varsayılan yanıt şablonu" giriyor ama bu şablonun hiçbir etkisi yok. Kullanıcıya söz verilip yerine getirilmeyen bir özellik bu.
- **Öneri:** Yanıt editöründe "Şablonlarım" açılır menüsü olsun. İlk öğe `defaultReplyTemplate` olsun, ileride çoklu şablon tablosuna (`ReplyTemplate`) genişletilsin. Değişken yerleştirme (`{{isim}}`, `{{ürün}}`, `{{işletme}}`) mail modülündeki desenle aynı olsun.
- **Efor:** S

### B10 · düşük · UX: Yanıtlanmış kartlarda boş "AI asistanı" bölümü, hatanın boş durum gibi görünmesi
- **Kanıt:** `page.tsx:367-372` (başlık koşulsuz, düğme koşullu), `page.tsx:143-149,275-282`.
- **Sorun:** Yanıtlanmış her kartta ayraçla ayrılmış ve içi boş bir "Yapay zeka yanıt asistanı" başlığı görünüyor. Ağ hatasında ise toast kapandıktan sonra ekranda "Yorum bulunamadı" kalıyor ve bayi yorumu olmadığını sanıyor.
- **Öneri:** AI bölümünü yalnızca yanıtsız kartlarda gösterin. Yanıtlı kartta küçük bir "Yanıtı düzenle" bağlantısı olsun. Hata için ayrı bir `ErrorState` bileşeni (ikon, açıklama, "Tekrar dene") ekleyin.
- **Efor:** S

### B11 · düşük · Durum yönetimi: Tek `generatingId` ile çoklu üretimde yarış
- **Kanıt:** `page.tsx:58,110,124`.
- **Sorun:** A kartında üretim sürerken B'ye basılınca `generatingId=B` oluyor. A'nın düğmesi yeniden aktifleşiyor ve tekrar basılırsa çift istek gidiyor. A'nın isteği bittiğinde `finally` `null` yazıyor ve B'nin spinner'ı da kayboluyor, oysa B'nin isteği hâlâ sürüyor.
- **Öneri:** `Set<string>` ya da kart başına mutasyon kullanın (React Query `useMutation` + `variables`). Bu, kart bileşeninin ayrılmasıyla doğal olarak çözülür (`ReviewCard` kendi durumunu tutar).
- **Efor:** S

### B12 · düşük · i18n / biçim: Sabit Türkçe metinler, para birimi ve kırık avatar
- **Kanıt:** `page.tsx:195` ("Telafi Merkezi →"), `:299` (`'M'`), `:361` (`{amount} ₺`, null olduğunda " ₺"), `lib/groq.ts:211` (yanıt dili her zaman TR), `page.tsx:297` ve `next.config.*:272-291` (izin listesi dışındaki avatar alanları).
- **Sorun:** EN arayüzde Türkçe bağlantı metni ve Türkçe AI yanıtları çıkıyor. Tutar yerel biçimde değil. Kayıtlı bir avatar URL'si izin listesi dışındaysa kırık görsel görünüyor.
- **Öneri:** Tüm metinleri `messages/*` altına taşıyın. Tutarı `formatCurrency(amount, locale)` ile biçimlendirin ve null ise hiç göstermeyin. Avatar için shadcn `Avatar`/`AvatarImage`/`AvatarFallback` kullanın (kardeş sayfa öyle yapıyor); bu bileşen `onError`'da baş harfe düşer. Profil `image` alanını izinli alan adlarıyla doğrulayın.
- **Efor:** S

### B13 · düşük · Erişilebilirlik: Puanlar ve filtre durumu ekran okuyucuya aktarılmıyor
- **Kanıt:** `page.tsx:219-223,233-245,311-315,261`.
- **Sorun:** Yıldız ikonları dekoratif işaretlenmemiş ve yerlerinde metin yok. Dağılım düğmeleri seçili durumu bildirmiyor. Masaüstündeki iç kaydırma alanı odaklanamıyor.
- **Öneri:** Yıldız grubuna `role="img" aria-label="5 üzerinden 4 yıldız"` verin, ikonları `aria-hidden` yapın. Filtre düğmelerine `aria-pressed` ve `aria-label="4 yıldızlı yorumları göster (12)"` ekleyin. Liste kabına `role="region" aria-label tabIndex={0}` verin, ya da iç kaydırmayı kaldırıp sayfa kaydırmasına geçin. Liste yenilendiğinde sonuç sayısını `aria-live="polite"` ile duyurun.
- **Efor:** S

### B14 · düşük · Performans / ölü kod: Gereksiz `router.refresh()`, filtreden bağımsız istatistiklerin tekrar hesaplanması
- **Kanıt:** `page.tsx:100`, `route.ts:86-95` (istatistik sorguları `where.rating`'den bağımsız ama her filtre değişiminde çalışıyor), `route.ts:76-81` (`card.token` yalnızca son 4 hanesi için çekiliyor ve bu sayfa onu kullanmıyor), `page.tsx:23` (`comment` alanı).
- **Öneri:** `router.refresh()` çağrısını kaldırın. İstatistikleri ayrı bir uca (`/api/dealer/reviews/summary`) taşıyıp Redis'te kısa TTL ile önbelleğe alın; yanıt yazıldığında ya da yeni yorum geldiğinde etiketle geçersiz kılın. Listeyi ayrı sorgu olarak tutun.
- **Efor:** S

### B15 · düşük · Tutarlılık: Elle yazılmış hero ve yönlendirme bağlantısı
- **Kanıt:** `page.tsx:176-198` (25 bayi sayfası `DashboardPageHero` kullanıyor), `page.tsx:190` (`<a>` ile tam sayfa yükleme), `sidebar.tsx:256` (`remedy_queue` `featureKey: 'remedy_offers'` ile kapılı ama bağlantı koşulsuz).
- **Öneri:** `DashboardPageHero` kullanın; KPI'ları (ortalama, yanıt oranı, ortalama yanıt süresi) `actions` slotuna koyun. Bağlantıyı `next/link` yapın ve modül görünürlüğüne bağlayın (`useModuleVisibility`/`module-gate`).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Google Business Profile, Yelp for Business, Medallia, Qualtrics CX, Birdeye/Podium tarzı yorum gelen kutuları, Toast ve Square geri bildirim modülleri.

1. **Yanıt iş akışı ve SLA:** "Yanıtsız", "Yanıtlandı" ve "Takipte" durumları. Ortalama ilk yanıt süresi ve yanıt oranı KPI'ı (Google ve Yelp bunu öne çıkarıyor). Olumsuz yorumlar için "24 saat içinde yanıtla" sayacı. Veride `dealerRepliedAt` zaten var, yalnızca hesaplanması gerekiyor.
2. **Düzenlenebilir yanıt editörü + şablon kütüphanesi + geri al:** Taslağı düzenleme, değişkenli şablonlar, çoklu ton, gönderimden sonra kısa bir geri alma penceresi ve yanıtı sonradan düzenleme/silme (Google, yanıtın düzenlenmesine ve silinmesine izin veriyor).
3. **Gelişmiş filtreleme ve arama:** Metin araması, tarih aralığı, ürün/kategori, duygu (`sentiment`), kayıp riski, "yazılı yorumu olanlar", "yanıtsızlar" filtreleri, sıralama (en yeni, en düşük puan, en yüksek risk) ve URL'de kalıcı filtre durumu.
4. **Konu/tema analizi:** Yorumlardan çıkarılan konu etiketleri (servis hızı, lezzet, fiyat) ve zaman içindeki puan trendi (Medallia/Qualtrics "text analytics"). Boyut puanları (`dimensions`) bunun için hazır bir veri kaynağı.
5. **Kapalı döngü (closed-loop):** Kart içinden telafi teklifi, ekipten birine atama (ekip modülü) ve iç not. Olumsuz yorum otomatik olarak bir "incident"/görev açabilmeli.
6. **Dışa aktarma ve paylaşım:** CSV/Excel dışa aktarma ve iyi yorumları VoC duvarına ya da sosyal medyaya "öne çıkar" eylemi (Yelp ve GBP'deki "highlight" benzeri).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında önce "bugün ne yapmalıyım?" sorusunun cevabını görmeli. Örnek: "3 olumsuz yorum yanıt bekliyor, en eskisi 19 saat önce." Her yorum tek ekranda yanıtlanabilmeli, telafiye bağlanabilmeli ve işaretlenebilmeli. AI bir otomatik pilot değil, bayinin düzenlediği bir taslak üretici olmalı.

**Yerleşim (masaüstü):**
- **Üst şerit:** `DashboardPageHero` ve dört KPI: ortalama puan (30 günlük değişimle), yanıt oranı, ortalama ilk yanıt süresi, yanıtsız olumsuz yorum sayısı. KPI'lar tıklanınca ilgili filtreyi uygular.
- **Sol sütun (filtre rayı):** Mevcut yıldız dağılım çubukları korunur; bunlar iyi bir desen. Altına durum sekmeleri (Tümü / Yanıtsız / Yanıtlandı), duygu, ürün, tarih aralığı ve arama eklenir. Filtreler URL query'de tutulur.
- **Orta sütun (gelen kutusu listesi):** Kompakt satırlar: puan, ilk satır metin, ürün, süre, risk rozeti. Sanallaştırılmış ve sonsuz kaydırmalı. Klavye kısayolları: `j/k` gezinme, `r` yanıtla, `t` telafi.
- **Sağ panel (detay ve yanıt):** Yorumun tamamı, boyut puanları, müşterinin bu işletmedeki geçmişi (ziyaret sayısı, önceki puanlar), düzenlenebilir yanıt editörü (şablonlar, AI taslakları ve kaynak rozeti), "Telafi ekle" ve "Gönder" (geri al pencereli).
- **Mobil:** Liste tam ekran. Satıra dokununca alttan sheet açılır (detay ve yanıt). Filtreler üstte yatay kaydırılan çipler olur; KPI'lar tek satırda kaydırılabilir kartlar olarak durur.

**Motion (ölçülü):** Mevcut kademeli giriş animasyonu yalnızca ilk yüklemede kalsın; yeniden çekmede ve sayfa eklemede animasyon olmasın (`initial={false}`). Yanıt gönderildiğinde satır "Yanıtlandı" sekmesine kısa bir `layout` animasyonuyla geçsin. AI taslakları gelirken basit bir yazı-iskelet parıltısı yeterli. 3B ya da ağır efekt bu iş ekranında yersiz. Global `MotionConfig reducedMotion="user"` korunmalı ve sayfa içindeki ikinci `LazyMotion` kaldırılmalı.

**Veri/API değişiklikleri:**
- `GET /api/dealer/reviews`: açık `select` DTO (B4), cursor sayfalama, `status`/`sentiment`/`q`/`from`/`to`/`productId`/`sort` parametreleri. Yanıt şekli `zod` ile tanımlanıp istemciyle paylaşılsın.
- `GET /api/dealer/reviews/summary`: KPI'lar ve dağılım; Redis'te kısa TTL, yanıt ve yeni yorumda geçersiz kılma.
- `POST /api/ai/generate-reply`: hız sınırı, `source` alanının arayüzde kullanılması, prompt'a işletme ve ürün bağlamı ile hedef dil eklenmesi, telafi vaadinin prompt'tan çıkarılması. `reply` ucundaki `suggest` modu kaldırılsın.
- `POST/PATCH/DELETE /api/dealer/reviews/[id]/reply`: yanıtın oluşturulması, düzenlenmesi ve geri çekilmesi; bildirim ve e-postada tekrar engeli; e-posta gövdesinde kaçış (B3).
- Performans için isteğe bağlı: `ConsumptionReview` modeline denormalize bir `dealerId` ve `@@index([dealerId, createdAt])` eklenmesi. Böylece her sorgudaki `consumption` join'i ortadan kalkar ve "yanıtsızlar" filtresi için `@@index([dealerId, dealerRepliedAt])` kullanılabilir. Bu bir şema değişikliği olduğu için geri doldurma (backfill) planı gerekir.
- İstemci: React Query (`useInfiniteQuery` + `useMutation`), ayrı `ReviewCard`/`ReplyComposer` bileşenleri, shadcn `Avatar`.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/feedbacks` (güçlü çakışma):** Bu sayfadaki "Tüketim yorumları" sekmesi, aynı `/api/dealer/reviews` ucundan aynı kayıtları gösteriyor (`feedbacks/page.tsx:325,562-700`). Buna ek olarak boyut puanlarını, düzenlenebilir yanıt dialog'unu ve telafi göndermeyi de içeriyor. **Öneri:** İki sayfa tek bir "Yorum ve Geri Bildirim Gelen Kutusu" altında birleşsin. Kaynak türü (Tüketim yorumu / QR geri bildirimi) bir filtre çipi olsun. Bu sayfanın puan özeti, dağılım filtresi ve satır içi AI taslakları ortak sayfaya taşınsın. `/dealer/reviews`, birleşik sayfaya `?source=consumption` ile yönlendirilsin, menüde tek giriş kalsın.
- **`/dealer/remedy-queue`:** Rolü farklı (telafi onay kuyruğu), ayrı kalmalı. Ancak yorum kartından doğrudan telafi teklifi oluşturulabilmeli. Başlıktaki "Telafi Merkezi" etiketi hedef sayfanın asıl adıyla ("Telafi onay kuyruğu") eşleşmeli ve modül görünürlüğüne bağlanmalı.
- **`/dealer/consumptions`:** İşlem kaydı listesinde müşterinin puanı görünüyor. Oradaki puan rozeti, gelen kutusundaki ilgili yoruma derin bağlantı (`?review=<id>`) vermeli. Ayrı kalmalı.
- **`/dealer/voc-wall`:** Olumlu yorumları "öne çıkar" eylemi gelen kutusundan VoC duvarına beslenebilir. Bu sayfayla birleştirme gerekmiyor.
- **API tekrarları:** AI yanıt önerisi için iki uç var (`/api/ai/generate-reply` ve `reply` ucundaki `action:'suggest'` modu). Tek uçta birleşmeli.

---

## Doğrulama (şüpheci inceleme)

Üç KRİTİK/YÜKSEK iddia, çağıran ve çağrılan kod baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Yorum listesi sessizce 50 kayıtla sınırlı, sayfalama yok: **DOĞRULANDI**

- `app/dealer/reviews/page.tsx:137` isteği yalnızca `?rating=` ile atıyor; `limit`, `cursor` ya da `page` gönderilmiyor.
- `app/api/dealer/reviews/route.ts:23`: `clampTakeParam(null, 50, 100)` çağrısı `lib/api-http.ts:76-79` gereği 50 döndürüyor; `:46-49`'daki `findMany` de `orderBy createdAt desc, take: 50` ile çalışıyor. Ne `skip` ne `cursor` var.
- Öte yandan istatistikler (`:86-95`) tüm kayıtlar üzerinden hesaplanıyor ve sayfa `:224`'te gerçek toplamı gösteriyor. Kullanıcı "120 yorum" yazısını görüp listede yalnızca 50 kart buluyor; "daha fazla" düğmesi ya da uyarı yok.
- Yan kanıt: `app/dealer/feedbacks/page.tsx:318-325` aynı uca `page`, `pageSize` ve `needsReview` gönderiyor ama route bu parametrelerin hiçbirini okumuyor. Bu yüzden o sayfada sayfa numarası değişse bile tüketim yorumu sekmesi hep aynı ilk 50 kaydı gösteriyor. Eski yorumlara arayüzden ulaşmanın başka bir yolu da kalmıyor.
- **Yeniden üretim:** 51 veya daha fazla `ConsumptionReview` kaydı olan bir bayi `/dealer/reviews` sayfasını açar. Toplam "51 yorum" görünür ama en eski yorum listede yer almaz, dolayısıyla yanıtlanamaz. Yıldız filtresi ancak o puandaki yorum sayısı 50'yi geçmediğinde kısmen yardımcı olur.
- **Önem:** Veri kaybı ya da güvenlik sorunu yok; işlevsel bir eksik. Yine de yüksek hacimli bayilerde yanıtsız eski olumsuz yorumlar görünmez kalıyor ve bu da yanıt oranı KPI'ını bozuyor. YÜKSEK seviyesi kabul edilebilir.

### 2. Müşteriye giden yanıt e-postasında HTML enjeksiyonu: **DOĞRULANDI**

- `app/api/user/profile/route.ts:15,29,49`: Oturum açmış her kullanıcı `businessName` alanına en fazla 100 karakterlik serbest metin yazabiliyor. Şema yalnızca `z.string().max(100)`; HTML temizleme yapılmıyor ve `lib/prisma.ts` içinde bir sanitize uzantısı da yok.
- `app/api/dealer/feedbacks/[id]/reply/route.ts:14-27`: `businessName` olduğu gibi `emailDealerReply` fonksiyonuna aktarılıyor.
- `lib/notify-email.ts:113`: Değer `<strong>${params.dealerName}</strong>` biçiminde kaçışsız ekleniyor. `:79` satırı `bodyLines` öğelerini ham HTML olarak `<p>` içine sarıyor. `lib/transactional-email.ts:137` ise `bodyHtml` değerini kaçışsız basıyor; yalnızca `heading` alanı kaçışlı (`:99`).
- Tetikleyici bu sayfada mevcut: "Bu yanıtı kullan" düğmesi (`page.tsx:397` → `:68-73`) POST isteğini atıyor, o da `reply/route.ts:171` üzerinden e-postayı gönderiyor. Aynı kaçışsız yol `lib/auto-reply-engine.ts:95-97`'deki otomatik yanıtta da çalışıyor.
- **Yeniden üretim:** Bayi profilinde `businessName` alanına `<a href="https://kotu.example/giris">Hesabınızı doğrulayın</a>` yazar (100 karakter sınırına sığıyor). Ardından herhangi bir tüketim yorumunda "Bu yanıtı kullan" düğmesine basar. Müşteri, QRATEX logolu ve QRATEX'in gönderici adresinden çıkan işlem e-postasında tıklanabilir bir oltalama bağlantısı görür. Saldırgan yalnızca kendi müşterilerine ulaşabiliyor. Buna karşın e-posta platform kimliğiyle ve SPF/DKIM'den geçerek gidiyor, bu da marka itibarı ve oltalama açısından ciddi bir risk.
- Not: `feedbackSnippet` (`:116`) de kaçışsız. Ancak bu, müşterinin kendi metninin yine kendisine gitmesi demek; kullanıcılar arası bir saldırı yolu oluşturmuyor. Aynı desen `emailBadgeEarned` (`:144`) içinde de var, fakat `badgeName` yönetici kontrolünde.
- **Öneri:** `sendEventEmail` içinde satırları varsayılan olarak `escapeEmailHtml` ile kaçışlamak ve vurgu gerektiğinde `{ strong: string }` gibi yapılandırılmış parçalar kullanmak (çağıranın ham HTML vermesine izin vermeyen bir API). Ek olarak `businessName` girişinde `<`, `>` ve URL desenleri reddedilmeli ya da normalize edilmeli.

### 3. AI yanıtı düzenlenmeden ve onaysız müşteriye gönderiliyor; prompt telafi vaadi ürettiriyor: **ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK seviyesi için)

- **"Onaysız" doğru değil.** Taslaklar önce tam metin olarak bayiye gösteriliyor (`page.tsx:388-390`). Gönderim ancak bayi belirli bir taslağı seçip "Bu yanıtı kullan" düğmesine bastığında yapılıyor (`:397`). İnsan onayı var: bayi metni okuyup seçiyor. Otomatik gönderim yok; `generate-reply` (`app/api/ai/generate-reply/route.ts:122-145`) yalnızca taslak döndürüyor.
- **"Remedy onay akışını atlıyor" doğru değil.** Yanıt yalnızca `dealerReply` metnini yazıyor (`reply/route.ts:143-149`). Herhangi bir `Remedy` kaydı, puan ya da kupon oluşturulmuyor; ekonomi tarafında para veya puan basan bir yol bulunmuyor. Metindeki bir vaat sözel kalıyor; bayi onu okuyup seçtiği için bayinin kendi beyanı sayılıyor.
- **E-posta yanıt metnini taşımıyor.** `emailDealerReply` (`lib/notify-email.ts:112-118`) yalnızca "X yanıt verdi" bilgisini ve müşterinin kendi yorumundan bir alıntıyı gönderiyor. AI metni yalnızca uygulama içinde görünüyor (`app/customer/feedbacks/page.tsx:454`, React kaçışıyla).
- **Gerçek olan kısım (ORTA ya da DÜŞÜK UX sorunu):** (a) Bu sayfada taslağı düzenleme imkânı yok; düzenlenebilir yanıt dialog'u yalnızca `/dealer/feedbacks` sayfasında var. (b) Gönderilen yanıtı düzenleme veya geri çekme imkânı yok. (c) `lib/groq.ts:213`'teki "telafi teklif et" talimatı, modelin "bir sonraki kahveniz bizden" gibi somut taahhütler üretmesine yol açabilir. Hedef deneyim şöyle olmalı: taslak doğrudan gönderilmek yerine düzenlenebilir bir `ReplyComposer` bileşenine yüklenmeli, kısa bir "geri al" penceresi sunulmalı, prompt'taki talimat "somut telafi vaat etme; telafi gerekiyorsa iletişime geçileceğini belirt" olarak değiştirilmeli ve somut telafi yalnızca "Telafi ekle" eylemiyle remedy akışından yapılmalı. Bunlar gövdedeki önerilerle örtüşüyor, ancak kritik ya da yüksek seviyeli bir hata veya güvenlik bulgusu değil.

---

## Uygulama (Dalga 2)

Bu sayfa **birleştirildi**: `/dealer/reviews` artık `/dealer/inbox?source=consumption`'a kalıcı yönlendirir (`?rating=` korunur). Güçlü yanları (puan özeti, dağılım filtresi, satır içi AI taslakları) Gelen Kutusu'na taşındı; ayrıntılı mimari `dealer_feedbacks.md` → "Uygulama (Dalga 2)". Eski `GET /api/dealer/reviews` (ham `...r` yayılımı) ve `POST /api/ai/generate-reply` (hız sınırsız, şablonu "AI" diye sunan) uçları kaldırıldı; yerlerini `/api/dealer/inbox/*` aldı.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Segment meta | ÇALIŞIYOR | Gelen Kutusu meta verisi. |
| 2 | Menü girişi | ÇALIŞIYOR | Kayıtta tek giriş (`dealer.inbox`, `legacyIds: reviews`). |
| 3 | API rol koruması | ÇALIŞIYOR | `defineRoute` (rol + kiracı + zod + hız sınırı). |
| 4 | Veri kapsamı | ÇALIŞIYOR | Her sorgu `consumption.dealerId`; başkasının kaydı 404. |
| 5 | ADMIN erişimi | KALDIRILDI | Bayi sayfası proxy'de yalnız DEALER; API'de ADMIN yalnız `?dealerId=` ile salt-okunur. |
| 6 | Hero | ÇALIŞIYOR | Kabuk `PageHeader` (elle yazılmış hero yok). |
| 7 | "Telafi Merkezi →" | ÇALIŞIYOR | "Telafi onayı" sekmesi (modül kapalıysa gizli) + çekmecede "Telafi onayına git". |
| 8 | Ortalama puan | ÇALIŞIYOR | Dönemli + değişim. |
| 9 | Ortalama yıldız | ÇALIŞIYOR | Erişilebilir ad. |
| 10 | Toplam yorum | ÇALIŞIYOR | Gerçek sayılar; liste artık kesilmiyor. |
| 11 | Dağılım çubukları | ÇALIŞIYOR | İki kaynak, seçili dönem. |
| 12 | Dağılıma basarak filtre | ÇALIŞIYOR | `aria-pressed` + anlamlı ad. |
| 13 | Filtreyi temizle | ÇALIŞIYOR | Tek "Filtreleri temizle". |
| 14 | İstatistik iskeleti | ÇALIŞIYOR | |
| 15 | İstatistik hatası | ÇALIŞIYOR | `QueryState` + Tekrar dene. |
| 16 | Yapışkan yan panel | KALDIRILDI | Özet üst şeritte; iç içe kaydırma yok. |
| 17 | Liste veri çekme | ÇALIŞIYOR | React Query; oturum yenilemesi listeyi sıfırlamaz. |
| 18 | Liste iskeleti | ÇALIŞIYOR | `keepPreviousData`: yeniden çekimde liste yerinde kalır. |
| 19 | Boş durum | ÇALIŞIYOR | Filtreli / Yeni boş / hiç yorum yok ayrı, CTA'lı. |
| 20 | Hata toast'ı | ÇALIŞIYOR | Sayfa hatası `QueryState`, işlem hataları toast/satır içi. |
| 21 | Sayfalama | ÇALIŞIYOR | İmleç + sonsuz kaydırma. |
| 22 | Kart giriş animasyonu | KALDIRILDI | ops kaydında stagger yok. |
| 23 | `next/image` avatar | KALDIRILDI | İzin listesi dışı alan adında kırılıyordu; baş harf avatarı. |
| 24 | Baş harf yedeği | ÇALIŞIYOR | İsimsiz/anonimde "?" (dil bağımsız). |
| 25 | Müşteri adı | ÇALIŞIYOR | |
| 26 | Müşteri e-postası | KALDIRILDI | KVKK veri minimizasyonu. |
| 27 | Yorum yıldızları | ÇALIŞIYOR | |
| 28 | Göreli zaman | ÇALIŞIYOR | + `<time dateTime>` ve mutlak tarih ipucu. |
| 29 | Yorum metni | ÇALIŞIYOR | Ölü `comment` alanı yok. |
| 30 | Bayi yanıtı + zaman | ÇALIŞIYOR | |
| 31 | Ürün + tutar | ÇALIŞIYOR | null gizli, yerel para biçimi, kategori. |
| 32 | Boyut puanları | ÇALIŞIYOR | |
| 33 | Duygu / kayıp riski | ÇALIŞIYOR | Duygu rozeti, kayıp riski sinyali + filtre. |
| 34 | "Yanıt üret" | ÇALIŞIYOR | Kayıt başına mutasyon (yarış yok). |
| 35 | 3 ton taslak | ÇALIŞIYOR | |
| 36 | "Bu yanıtı kullan" | ÇALIŞIYOR | Taslak editöre gelir; düzenleyip "Gönder". |
| 37 | Taslakları iptal | KALDIRILDI | Taslaklar yalnız öneri kartı; editörde "Vazgeç". |
| 38 | Şablonu "AI" diye sunma (SAHTE) | KALDIRILDI | AI yoksa dürüst neden; şablonlar ayrı "Şablon" seçicide. |
| 39 | Yanıtlı kartta boş AI bölümü | ÇALIŞIYOR | Yanıtlıda "Yanıtı düzenle". |
| 40 | Elle yanıt | ÇALIŞIYOR | |
| 41 | Yanıt düzenleme / geri çekme | ÇALIŞIYOR | Düzenleme var (müşteriye tekrar bildirim gitmez, yanıt tarihi korunur); geri çekme bilinçli olarak yok (müşteri bildirimi gitmiş olur). |
| 42 | `defaultReplyTemplate` | ÇALIŞIYOR | "Varsayılan şablonum" + otomatik yanıt kural metinleri; `{{isim}}`, `{{ürün}}`, `{{işletme}}`. |
| 43 | Yorumdan telafi | ÇALIŞIYOR | |
| 44 | Arama/tarih/sıralama/yanıtsız | ÇALIŞIYOR | |
| 45 | CSV | ÇALIŞIYOR | |
| 46 | `router.refresh()` (SAHTE) | KALDIRILDI | |
| 47 | Bildirim + e-posta | ÇALIŞIYOR | Yalnız ilk yanıtta (tekrar engeli); e-posta gövdesi kaçışlı (`escapeEmailText`). |
| 48 | Mobil yerleşim | ÇALIŞIYOR | Açılır filtre paneli, alttan çekmece, ≥ 44 px. |
| 49 | İç kaydırma alanı | KALDIRILDI | Sayfa kaydırması. |
| 50 | Erişilebilir puan | ÇALIŞIYOR | |
| 51 | AI hız sınırı | ÇALIŞIYOR | `ai` politikası (10/dk) + kiracı bütçesi + bayi AI anahtarı. |
| 52 | Hata ekranı | ÇALIŞIYOR | |

### Kapanan bulgular (15/15)

B1 sayfalama · B2 taslak düzenlenmeden gitmiyor (prompt somut telafi vaadi yasak; telafi yalnız telafi akışından) · B3 e-posta kaçışı (P0 ile kapanmıştı, doğrulandı) · B4 açık DTO · B5 oturum yenilemesi listeyi sıfırlamıyor · B6 şablon "AI" değil · B7 tek AI ucu · B8 hız sınırı + tekrar bildirim engeli · B9 varsayılan şablon kullanılıyor · B10 boş AI bölümü / hata = boş · B11 kayıt başına üretim · B12 i18n/biçim/avatar · B13 erişilebilirlik · B14 ölü kod · B15 tutarlı kabuk ve modül görünürlüğü.

### Kalanlar

- "Gönderdikten sonra 5 sn geri al" penceresi yok (yerine sessiz düzenleme). AI taslak dili Türkçe. Konu/tema trendi ve "VoC duvarında öne çıkar" eylemi bu dalgada yok.
- ŞEMA İSTEĞİ: `ConsumptionReview.dealerFirstViewedAt`, yorum düzeyinde durum/atama alanları, yanıt geçmişi (ayrıntı: `dealer_feedbacks.md`).
