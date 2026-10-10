# /dealer/campaigns

**Amaç:** Bayinin (işletme sahibinin) geri bildirim bırakmış müşterilerine segment bazlı (Tüm / VIP / Sadık / Aktif / Kayıp riski) toplu mesaj kampanyası oluşturup "bildirim" veya "e-posta" kanalından göndermesi; admin playbook'larından gelen taslak kampanyaları yayınlaması ve kampanya performansına geçiş yapması.

**Genel puan: 3.8 / 10** · **Karar: yeniden tasarla** (UI iskeleti ve sahiplik kontrolleri sağlam; ancak gönderim hattı, segment tanımları, kanal, izin/tercih uyumu ve performans ölçümü ürün seviyesinde yeniden kurgulanmalı; segment-actions / win-back / risk-segment ile tek bir "Müşteri Erişimi" merkezine birleşmesi önerilir)

Kapsam: `app/dealer/campaigns/page.tsx` (287 satır), `app/dealer/campaigns/layout.tsx`, `app/dealer/campaigns/[id]/performance/page.tsx`, `app/api/dealer/campaigns/route.ts`, `app/api/dealer/campaigns/[id]/route.ts`, `app/api/dealer/campaigns/[id]/send/route.ts`, `app/api/dealer/campaigns/[id]/performance/route.ts`, `app/api/dealer/campaigns/risk-segment/route.ts`, `lib/module-gate.ts`, `lib/push.ts`, `lib/notification-prefs.ts`, `lib/notify-prefs-server.ts`, `lib/admin-toast.ts`, `app/api/admin/playbooks/apply/route.ts`, `lib/segment-action-center.ts`, `prisma/schema.prisma` (Campaign, Notification, Feedback, UserVIPStatus), `messages/tr.json` + `messages/en.json`. Salt okunur inceleme; uygulama çalıştırılmadı, görsel sonuçlar kod okumasına dayanır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Oluştur/listele/gönder/sil uçtan uca çalışıyor; fakat "E-posta" kanalı e-posta göndermiyor, "Sadık" segmenti "Aktif" ile birebir aynı, düzenleme/zamanlama yok, performans ekranı kampanyayla gerçekte ilişkilendirilmemiş veriyi gösteriyor. |
| UX | 4/10 | 500 kişiye geri alınamaz gönderim ve kalıcı silme tek tıkla, onaysız; kitle büyüklüğü, önizleme, tarih bilgisi yok; playbook ipucu "inceleyin" diyor ama düzenleme imkânı yok. |
| Görsel | 5/10 | Diğer bayi sayfalarıyla tutarlı kart/hero dili; ama liste tek tip, metrik/özet katmanı yok, segment renkleri dark mode varyantsız. |
| Mimari | 3/10 | Üç farklı "segment" tanımı (send route, risk-segment, segment-actions/CLV) birbiriyle çelişiyor; gönderim transaction'sız ve kullanıcı bildirim tercihlerini tamamen yok sayıyor; modül kapısı uçlar arasında tutarsız. |
| Performans | 5/10 | Liste sorgusu tek ve indeksli; ancak gönderimde 500 alıcı için `sendPushNotification` aynı anda 500 ayrı DB okuma + log yazımı başlatıyor (N+1, havuz tıkanması, olası zaman aşımı). |
| Erişilebilirlik + mobil | 4/10 | Global `MotionConfig reducedMotion="user"` var; ancak etiketler input'a bağlı değil, ikon-yalnız sil butonunda `aria-label` yok, kart aksiyon satırı dar ekranda içerik sütununu eziyor (görsel doğrulanmadı). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı + açıklama (hero kartı) | ÇALIŞIYOR | `app/dealer/campaigns/page.tsx:133-139` | i18n anahtarları TR/EN mevcut. |
| 2 | Playbook nerede ipucu metni | KISMİ | `page.tsx:140-142`, `messages/tr.json` `dealerCampaigns.playbookWhereHint` | "İnceleyip Gönder ile yayınlayın" diyor; ama sayfada düzenleme yok, sadece 2 satır kırpılmış mesaj görünüyor. |
| 3 | "Yeni kampanya" butonu | ÇALIŞIYOR | `page.tsx:144-146` | Mobilde tam genişlik. |
| 4 | Kampanya listesi yükleme (React Query) | ÇALIŞIYOR | `page.tsx:61-75`, `app/api/dealer/campaigns/route.ts:19-48` | `dealerId` sahipliği sunucuda; `take: 300`, sayfalama yok. |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:149-150`, `components/ui/inline-loading-status.tsx` | `role="status"` + sr-only etiket. İskelet (skeleton) yok. |
| 6 | Hata durumu + "Tekrar dene" | ÇALIŞIYOR | `page.tsx:151-159` | Sunucu mesajı gösteriliyor. |
| 7 | Boş durum + CTA | ÇALIŞIYOR | `page.tsx:160-169` | Şablon/öneri/playbook yönlendirmesi yok — boş durum öğretici değil. |
| 8 | Kart: kampanya başlığı | ÇALIŞIYOR | `page.tsx:186` | |
| 9 | Kart: Playbook rozeti | ÇALIŞIYOR | `page.tsx:187-191`, `app/api/admin/playbooks/apply/route.ts:50-58` | Kaynak playbook adı/gerekçesi gösterilmiyor. |
| 10 | Kart: durum rozeti (Taslak / Gönderildi / Zamanlandı) | KISMİ | `page.tsx:46-50,192` | `scheduled` durumu hiçbir kod yolunda üretilmiyor (zamanlama özelliği yok) — ölü varyant. |
| 11 | Kart: segment etiketi + segment renkli ikon | KISMİ | `page.tsx:38-44,181-182,193` | `seg.color.split(' ')` ile sınıf ayrıştırma kırılgan; dark mode varyantı yok (`text-blue-600` koyu zeminde düşük kontrast). |
| 12 | Kart: mesaj önizleme (2 satır) | ÇALIŞIYOR | `page.tsx:195` | Tam mesaj görme yolu yok. |
| 13 | Kart: "{n} müşteriye gönderildi" | KISMİ | `page.tsx:196-201`, `send/route.ts:98` | `sentCount` hedeflenen kişi sayısı; teslim/push/okunma değil. 500 sınırında sessiz kesme (bkz. Bulgu 7). |
| 14 | Kart: gönderim/oluşturma tarihi | EKSİK | `CampaignItem.sentAt/createdAt` `page.tsx:32-34` alınıyor ama render edilmiyor | Kampanya geçmişi zaman bilgisi olmadan okunamıyor. |
| 15 | Kart: "Performans" linki | SAHTE | `page.tsx:204-209`, `app/api/dealer/campaigns/[id]/performance/route.ts:10-49` | Başlıktan türetilen slug ile `utmCampaign` "contains" eşlemesi; kampanya bildirimleri hiç UTM taşımıyor (`send/route.ts:117-124`). Taslaklarda da gösteriliyor. |
| 16 | Kart: "Gönder" butonu | KISMİ | `page.tsx:210-220`, `send/route.ts` | Onay yok; `sendMutation.isPending` tüm kartlarda paylaşılıyor (bir gönderimde tüm Gönder butonları spinner + disabled). |
| 17 | Kart: Sil butonu | KISMİ | `page.tsx:221-223`, `[id]/route.ts:63-100` | Onay yok, `onError` yok (hata sessiz), `aria-label` yok, gönderilmiş kampanya da silinebiliyor (denetim izi kaybı). |
| 18 | Liste giriş/çıkış animasyonu | ÇALIŞIYOR | `page.tsx:172-177` | `motion` (LazyMotion non-strict sayesinde çalışır, `components/providers.tsx:238-241`), proje standardı `m as Motion` değil. |
| 19 | Oluşturma diyaloğu | ÇALIŞIYOR | `page.tsx:236-284` | |
| 20 | Alan: Başlık | KISMİ | `page.tsx:244-247` | `<Label>` `htmlFor` yok; `maxLength` yok (sunucu 200, `route.ts:12`). |
| 21 | Alan: Mesaj | KISMİ | `page.tsx:248-251` | Karakter sayacı yok; push için uzunluk rehberi yok; değişken/kişiselleştirme yok. |
| 22 | Alan: Hedef segment | BOZUK | `page.tsx:252-263`, `send/route.ts:40-83` | "Sadık" ve "Aktif" aynı sorguya düşüyor (`else` dalı); "VIP" bayiye özgü değil, platform geneli `UserVIPStatus`. |
| 23 | Alan: Kanal (Bildirim / E-posta) | SAHTE (e-posta) | `page.tsx:264-273`, `send/route.ts:107-127` | E-posta seçildiğinde hiçbir e-posta gönderilmiyor; yalnız uygulama içi kayıt oluşuyor ve push da atlanıyor. |
| 24 | İptal butonu | ÇALIŞIYOR | `page.tsx:277` | Form temizlenmiyor; sonraki açılışta eski taslak kalıyor (kasıtlı olabilir). |
| 25 | Oluştur butonu + istemci doğrulaması | ÇALIŞIYOR | `page.tsx:278-281`, `route.ts:69-73` | Boş başlık/mesajda disabled; Zod sunucu doğrulaması var. |
| 26 | Toast geri bildirimleri | KISMİ | `page.tsx:92,94,106,118`, `lib/admin-toast.ts:12-21` | Admin toast'ı "Basarili: " / "Dikkat: " ön ekini dil bağımsız ve Türkçe karaktersiz ekliyor (EN arayüzde "Basarili: Campaign created"). |
| 27 | Kampanya düzenleme | EKSİK | `[id]/route.ts:10-60` PATCH var; `page.tsx:9` `Edit` ikonu import edilmiş ama kullanılmıyor | Playbook taslağı değiştirilemiyor. |
| 28 | Zamanlanmış gönderim | EKSİK | `schema.prisma:2649` `scheduled` yorumu; zamanlama alanı/cron yok | |
| 29 | Kitle büyüklüğü önizleme / test gönderimi | EKSİK | — | Bayi kime ve kaç kişiye gideceğini göndermeden göremiyor. |
| 30 | Filtre / arama / sıralama / sayfalama | EKSİK | `route.ts:35-39` | Sabit `createdAt desc`, 300 kayıt. |
| 31 | Özet metrik şeridi (toplam gönderim, okunma oranı vb.) | EKSİK | — | `Notification.isRead/readAt` var (`schema.prisma:996-999`) ama kampanyaya bağlanmıyor. |
| 32 | Müşteri bildirim tercihine saygı | BOZUK | `send/route.ts:107-127`; `lib/notification-prefs.ts:49-53` | Müşteri "Kampanya & Sürprizler" grubunu kapatsa da kayıt + push gidiyor. |
| 33 | Modül / menü görünürlük kapısı | KISMİ | GET/POST: `route.ts:23-33,55-67`; send: `send/route.ts:19`; PATCH/DELETE/performance: kapı yok | Bkz. Bulgu 6. |
| 34 | Derin bağlantı ile ön-dolu oluşturma (churn-risk → "Kampanya oluştur") | EKSİK | `app/dealer/churn-risk/page.tsx:259-260` sadece `/dealer/campaigns`'e gider; `page.tsx` `useSearchParams` kullanmıyor | Risk sayfasından gelen bayi segmenti tekrar seçmek zorunda. |
| 35 | Çoğaltma (duplicate) / yeniden gönder | EKSİK | — | Gönderilmiş kampanya yeniden kullanılamıyor. |
| 36 | Rol / yetki (sayfa) | ÇALIŞIYOR | `proxy.ts:52`, `lib/api-auth.ts:52-63` | Sadece DEALER/ADMIN; personel (staff) için ayrı yetki/onay akışı yok. |
| 37 | Azaltılmış hareket desteği | ÇALIŞIYOR | `components/providers.tsx:232` `MotionConfig reducedMotion="user"` | Global çözüm. |
| 38 | Sayfa meta verisi | ÇALIŞIYOR | `app/dealer/campaigns/layout.tsx:4-6` | |

Durum sayımı: ÇALIŞIYOR 16 · KISMİ 10 · BOZUK 2 · SAHTE 2 · EKSİK 8 (toplam 38).

---

## Bulgular

### 1. Kampanya gönderimi müşterinin bildirim tercihini ve ticari ileti iznini tamamen yok sayıyor
- **Önem:** kritik · **Kategori:** güvenlik/uyum (KVKK, 6563 sayılı ETK) · **Efor:** M
- **Kanıt:** `app/api/dealer/campaigns/[id]/send/route.ts:107-127` doğrudan `prisma.notification.createMany` + `sendPushNotification` çağırıyor; `lib/notify-prefs-server.ts:49-60` (`notifyRespectingPrefs`) ve `lib/notification-prefs.ts:49-53,99-106` ("Kampanya & Sürprizler" grubu, `campaign` kind eşlemesi) mevcut olduğu hâlde kullanılmıyor. Oluşturulan bildirimlerde `data` alanı hiç yok, dolayısıyla `kind` de yok.
- **Sorun:** Müşteri `/customer/settings`'te kampanya bildirimlerini kapatsa bile bayi kampanyası uygulama içine düşüyor ve push gönderiliyor. Alıcılar "bu işletmeye bir kez geri bildirim bırakmış herkes" olarak seçiliyor; ticari ileti için açık rıza veya bayi bazlı abonelik kaydı yok. Bu hem güven hem yasal risk (Türkiye'de ticari elektronik ileti onay şartı).
- **Öneri:** Gönderimi tek bir `lib/campaign-delivery.ts` servisine taşıyın: (1) alıcı listesi çıkarıldıktan sonra tek sorguyla `user.notificationPrefs` toplu okunup `isChannelEnabled(prefs,'campaign',channel)` ile filtrelensin; (2) bayi bazlı pazarlama izni için `DealerMarketingConsent { userId, dealerId, channel, grantedAt, revokedAt, source }` modeli eklenip geri bildirim akışında açık onay kutusu ile toplanması; (3) her bildirime `data: { kind: 'campaign', campaignId, dealerId }` yazılması; (4) bildirimde "Bu işletmeden kampanya almayı durdur" tek tık abonelikten çıkma linki. Önizleme ekranında "izinli alıcı / toplam" ayrımı gösterilmeli.

### 2. "E-posta" kanalı sahte: hiçbir e-posta gönderilmiyor, push da atlanıyor
- **Önem:** yüksek · **Kategori:** işlevsellik (sahte özellik) · **Efor:** M
- **Kanıt:** `page.tsx:270` "E-posta" seçeneği; `send/route.ts:107-127` — e-posta gönderim kodu yok; `if (campaign.channel === 'notification')` dışında kalan e-posta kampanyası yalnız uygulama içi kayıt üretir.
- **Sorun:** Bayi e-posta kampanyası gönderdiğini sanıyor, müşteri hiçbir e-posta almıyor; üstelik bu seçenek push'u da kapattığı için erişim bildirim kanalından bile düşük. Kart "{n} müşteriye gönderildi" diyerek yanılgıyı pekiştiriyor.
- **Öneri:** Kısa vadede e-posta seçeneğini kaldırın veya "Yakında" olarak devre dışı gösterin. Orta vadede mevcut nodemailer altyapısı (stajyer mail modülü) üzerinden kuyruklu (Inngest/cron) e-posta teslimi; şablon + abonelikten çıkma başlığı (`List-Unsubscribe`) + bounce işaretleme; kanal çoklu seçim (uygulama içi + push + e-posta) ve kanal başına teslim sayıları.

### 3. Segment tanımları bozuk ve sistemin geri kalanıyla çelişiyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / mimari · **Efor:** L
- **Kanıt:** `send/route.ts:72-83` — `vip`, `all`, `risk` dışında kalan her değer (yani hem `loyal` hem `active`) "≥3 geri bildirim" kuralına düşüyor; `send/route.ts:53` VIP = platform geneli `UserVIPStatus` (`schema.prisma:1793-1806`, bayiye bağlı değil); `send/route.ts:61-66` risk = son 30 günde ort. puan ≤ 2; buna karşılık `risk-segment/route.ts:38-49` risk = `feedback.churnRisk ≥ 0.5`, `lib/segment-action-center.ts:1-8,51-60` ise CLV cron'undan gelen `CustomerSegment` ("Risk Altında", "Uyuyan", "VIP", "Sadık", "Yeni") kullanıyor.
- **Sorun:** "Sadık müşteriler" ile "Aktif kullanıcılar" seçimi aynı kişilere gidiyor; "VIP" başka işletmelerde puan kazanmış kullanıcıyı da içeriyor; "Kayıp riski" churn-risk sayfasında gösterilen kitle ile aynı değil. Bayi iki ekranda iki farklı "riskli müşteri" sayısı görüyor. Ayrıca `all` sorgusu `deletedAt` filtrelemiyor (`send/route.ts:41-46`), soft-silinmiş geri bildirimlerin sahipleri de hedefleniyor.
- **Öneri:** Segment çözümlemeyi tek kaynağa toplayın: `lib/dealer-audience.ts` içinde `resolveAudience(dealerId, segmentKey) → { userIds, total, eligible }`, kaynağı CLV/`CustomerSegment` (segment-actions ile aynı). Kampanya modelinde serbest metin `targetSegment` yerine `segmentKey` + isteğe bağlı kural JSON'u (son ziyaret, puan aralığı, ziyaret sayısı) tutun. PATCH ve POST aynı Zod enum'unu kullanmalı.

### 4. Gönderim atomik değil: kampanya "gönderildi" işaretlenip teslimat başarısız olabilir
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `send/route.ts:96-105` önce `status:'sent'` + `sentCount` yazılıyor, ardından `send/route.ts:107-114` `notification.createMany`, `116-127` push. Hata durumunda `catch` (`130-135`) yalnız 500 döndürüyor, durum geri alınmıyor.
- **Sorun:** `createMany` veya fonksiyon zaman aşımı (500 alıcıya paralel push, `maxDuration` yok) sonrası kampanya kalıcı olarak "Gönderildi" görünür, kimseye ulaşmamış olabilir; bayi yeniden denediğinde "Bu kampanya zaten gönderildi" (`send/route.ts:33-35`) alır. İstemci tarafında 504 HTML yanıtı `r.json()`'u patlatır (`page.tsx:100`), kullanıcı teknik "Unexpected token" hatası görür.
- **Öneri:** Durum makinesi: `draft → sending → sent | failed`. Claim adımı `sending`'e alsın; teslimat kuyrukta (Inngest/Vercel Queues) parti parti yürüsün, `CampaignDelivery { campaignId, userId, channel, status, error, deliveredAt, readAt }` tablosuna yazsın; bitince `sent` + gerçek `deliveredCount`. Uç nokta 202 + iş kimliği dönsün, UI ilerlemeyi izlesin. İstemcide `r.json().catch(() => ({}))` deseni (liste sorgusunda zaten var, `page.tsx:65`) tüm mutasyonlara uygulansın.

### 5. Push gönderimi alıcı başına N+1 sorgu ve sınırsız eşzamanlılık
- **Önem:** yüksek · **Kategori:** performans · **Efor:** M
- **Kanıt:** `send/route.ts:117-126` 500 alıcı için `customerIds.map(sendPushNotification)` aynı anda başlatılıyor; `lib/push.ts:25-27` her çağrı ayrı `pushSubscription.findMany`, sonrasında log `createMany` yapıyor.
- **Sorun:** 500 alıcıda ~1000 DB işlemi aynı anda Prisma havuzuna yığılıyor (proje notu: Neon pooler'da `connection_limit=5`); diğer istekler gecikir, fonksiyon zaman aşımına düşebilir. Bu, Bulgu 4'teki yarım kalma senaryosunu tetikler.
- **Öneri:** Tek sorguda `pushSubscription.findMany({ where: { userId: { in: ids }, isActive: true } })`, sonuç üzerinde `p-limit` (ör. 20) ile web-push, tek `createMany` log. Bu, kuyruk tabanlı teslimatın (Bulgu 4) bir partisi olarak çalışmalı.

### 6. Modül/menü kapısı uçlar arasında tutarsız; yönetici kapattığında bile gönderim/silme mümkün
- **Önem:** orta · **Kategori:** yetki · **Efor:** S
- **Kanıt:** GET/POST hem `assertMenuItemVisible` hem rol bağlamlı `assertModuleEnabled` çağırıyor (`route.ts:23-33,55-67`). Send yalnız `assertModuleEnabled('campaigns')` çağırıyor, rol vermiyor (`send/route.ts:19`); modül kapsamı `dealer` olduğundan (`lib/module-controls.ts:31`) `lib/module-gate.ts:96-101` rol görünürlüğünü hiç kontrol etmiyor. PATCH, DELETE (`[id]/route.ts`) ve performance (`[id]/performance/route.ts`) hiçbir kapı çağırmıyor.
- **Sorun:** Admin kampanyaları bayi rolü için gizlediğinde liste 403 döner ama daha önce oluşturulmuş (ör. playbook) taslaklar doğrudan API ile gönderilebilir/silinebilir.
- **Öneri:** Tüm `/api/dealer/campaigns/**` uçlarını tek `withDealerModule('campaigns', '/dealer/campaigns')` sarmalayıcısına alın (auth + menu + module). Ek olarak gönderim için bayi başına hız sınırı (`lib/rate-limit.ts` mevcut) ve müşteri başına frekans sınırı (ör. aynı bayiden 7 günde en fazla 2 kampanya).

### 7. 500 alıcı sınırında sessiz ve rastgele kesme
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:** `send/route.ts:12,41-46` `all` segmentinde `distinct userId` + `take: 500`, `orderBy` yok ve `userId: { not: null }` filtresi yok (null grup bir slot tüketir); `send/route.ts:68-71,79-82` groupBy sonuçları da sırasız `slice(0,500)`.
- **Sorun:** 500'den büyük kitlede kimin alacağı belirsiz; bayi kitlenin bir kısmına gittiğini bilmiyor, kalan müşterilere ikinci gönderim yolu da yok.
- **Öneri:** Önizlemede "Toplam kitle 1.240 · bu gönderimde 500" bilgisi; ya parti parti tümüne teslim (kuyruk), ya da açık bir sıralama (en son ziyaret edenler önce) ve "kalanlara gönder" aksiyonu.

### 8. "Performans" ekranı kampanya ile ilişkisiz veriyi ölçüm gibi sunuyor
- **Önem:** orta · **Kategori:** sahte veri / ürün · **Efor:** M
- **Kanıt:** `[id]/performance/route.ts:10-17,40-49` başlıktan 20 karakterlik slug çıkarıp `utmCampaign contains` eşlemesi; kampanya bildirimleri UTM taşımıyor ve push hedefi sabit `/customer/feedbacks` (`send/route.ts:122`); performans notu sabit Türkçe metin (`[id]/performance/route.ts:84-85`) EN arayüzde de görünür; link taslak kampanyalarda da gösteriliyor (`page.tsx:204-209`).
- **Sorun:** "Yaz" başlıklı kampanya "yaz" içeren herhangi bir UTM'i sayar; gerçek etki (okunma, tıklama, sonraki ziyaret) hiç ölçülmüyor. Bayiye yanlış güven veriyor.
- **Öneri:** Gerçek huni: teslim → okundu (`Notification.readAt` `data.campaignId` ile) → tıklandı (izlenen yönlendirme `/r/c/{campaignId}`) → kampanya sonrası 7/14 gün içinde aynı müşteriden geri bildirim/tüketim (kontrol grubuna karşı artış). Taslaklarda link gizlenmeli; liste kartında mini huni gösterilmeli.

### 9. Geri alınamaz eylemler onaysız ve hata geri bildirimi eksik
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** Gönder `page.tsx:211-219` doğrudan `mutate`; Sil `page.tsx:221` doğrudan `mutate`, `deleteMutation`'da `onError` yok (`page.tsx:111-120`); `components/ui/alert-dialog.tsx` mevcut ama kullanılmıyor; gönderilmiş kampanya silinebiliyor (`[id]/route.ts:63-92` durum kontrolü yok).
- **Sorun:** Yanlış tık 500 müşteriye mesaj atar ya da gönderim kaydını yok eder; silme hatası kullanıcıya hiç gösterilmez.
- **Öneri:** Gönder için özet onayı (kanal, segment, izinli alıcı sayısı, mesaj önizlemesi); Sil için AlertDialog; gönderilmiş kampanyalar silinmek yerine "arşivle" (soft delete, `archivedAt`). Gönder butonu `sendMutation.variables === c.id` ile yalnız ilgili kartta spinner göstermeli (şu an tüm kartlar kilitleniyor, `page.tsx:215-217`).

### 10. Düzenleme yok — playbook taslakları değiştirilemiyor
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** PATCH ucu var (`[id]/route.ts:10-60`) ama UI yok; `Edit` ikonu import edilmiş, kullanılmıyor (`page.tsx:9`); admin playbook'u bayi hesabına hazır metinle taslak yazıyor (`app/api/admin/playbooks/apply/route.ts:50-58`); ipucu "İnceleyip Gönder ile yayınlayın" diyor.
- **Sorun:** Bayi admin'in yazdığı genel metni kendi markasına uyarlayamıyor; ya olduğu gibi gönderiyor ya siliyor. PATCH ayrıca doğrulamasız: `targetSegment`/`channel` serbest string, başlık uzunluğu sınırsız (`[id]/route.ts:31-36`).
- **Öneri:** Oluşturma diyaloğunu "kampanya editörü" yapın (oluştur + düzenle aynı bileşen); PATCH'i POST'un Zod şemasının `partial()` hâli ile doğrulayın.

### 11. Dil ve tutarlılık sorunları
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `lib/admin-toast.ts:16-20` "Basarili: " / "Dikkat: " ön ekleri (Türkçe karaktersiz, locale'den bağımsız) bayi sayfasında kullanılıyor (`page.tsx:22`); sunucu hata mesajları sabit Türkçe (`route.ts:46,90`, `send/route.ts:28,34,88,102`), EN arayüzde Türkçe toast çıkar; `risk-segment/route.ts:51,61` sabit Türkçe bildirim metni.
- **Öneri:** Bayi paneli için ön eksiz bir `toast` (doğrudan `sonner`) kullanın; API'ler hata kodu (`code: 'CAMPAIGN_ALREADY_SENT'`) dönsün, istemci `t()` ile çevirsin.

### 12. Kod hijyeni ve erişilebilirlik
- **Önem:** düşük · **Kategori:** a11y / bakım · **Efor:** S
- **Kanıt:** Kullanılmayan importlar `Users, Clock, Edit, X` (`page.tsx:8-9`); `motion` doğrudan import (`page.tsx:5`) — proje standardı `m as Motion`; `<Label>` öğeleri `htmlFor` olmadan (`page.tsx:245,249,254,265`); ikon-yalnız sil butonunda `aria-label` yok (`page.tsx:221`); segment rengi sınıf dizesini `split(' ')` ile ayırıyor (`page.tsx:181-182`); kart aksiyon satırı `shrink-0` ile üç butonu yan yana tutuyor (`page.tsx:203`) — ~360 px genişlikte içerik sütunu daralır (görsel doğrulanmadı).
- **Öneri:** Segment meta verisini `{ bg, fg, darkBg, darkFg }` alanlı nesne yapın; mobilde aksiyonları kart altına taşıyın veya `DropdownMenu`'ya toplayın; form alanlarına `id`/`htmlFor`, sil butonuna `aria-label={t('dealerCampaigns.delete')}`.

---

## Eksik özellikler (kıyas: Square Marketing, Toast Marketing, Yelp for Business, Medallia/Qualtrics CX aksiyon modülleri)

1. **Kitle önizleme ve kitle oluşturucu:** Square/Toast gönderimden önce alıcı sayısını ve kural tabanlı kitleyi (son ziyaret, harcama, puan) gösterir. Burada kitle kör.
2. **Zamanlama ve otomasyon:** Zamanlanmış gönderim, tetikleyici tabanlı kampanyalar (doğum günü, 30 gün uyuyan, düşük puan sonrası telafi) — Toast'un "automated campaigns" muadili. `scheduled` durumu tanımlı ama boş.
3. **Teklif / kupon bağlama:** Kampanyaya ölçülebilir teklif (indirim kodu, QR ile kullanım) eklenmesi; kullanım = gerçek ROI. Mevcut `remedy-offers` / win-back teklifleri ile bağlanabilir.
4. **Gerçek performans hunisi:** teslim, okunma, tıklama, kullanım, sonraki ziyaret; A/B varyant ve kontrol grubu (Medallia/Qualtrics "closed loop" etkisi).
5. **Çok kanallı teslim ve izin yönetimi:** push + uygulama içi + e-posta (+ SMS/WhatsApp opsiyonel), kanal başına izin ve abonelikten çıkma, frekans sınırı.
6. **İçerik yardımcıları:** AI ile mesaj taslağı (bayinin AI içgörüleri mevcut), kişiselleştirme değişkenleri (`{{isim}}` — mail modülünde zaten var), cihaz önizlemesi, test gönderimi, çoğaltma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi "kime, ne, ne zaman, neden" sorularını tek akışta cevaplar ve gönderdikten sonra etkiyi görür. Sayfa bir "mesaj listesi" değil, bir **müşteri erişim merkezi** olur.

**Yerleşim:**
- **Üst şerit (KPI):** Son 30 gün gönderilen kampanya, ulaşılan müşteri, ortalama okunma oranı, kampanya sonrası geri dönüş oranı; yanında "Önerilen kampanya" kartı (segment-actions + next-best-action'dan beslenir, ör. "42 uyuyan müşteri — win-back gönder").
- **Liste:** Sekmeler (Taslak / Zamanlanmış / Gönderiliyor / Gönderildi / Arşiv), arama, segment filtresi. Her satırda tarih, kanal ikonları, alıcı sayısı ve mini huni (teslim → okundu → geri döndü).
- **Editör (sağdan açılan Sheet, mobilde tam ekran):** 1) Kitle — segment kartları canlı sayı ile ("Risk altında · 86 müşteri · 71'i izinli"); 2) İçerik — başlık/mesaj, karakter sayacı, değişkenler, AI taslak, teklif ekle; 3) Kanal ve zaman — çoklu kanal, şimdi/zamanla; 4) Önizleme — telefon bildirimi maketi + test gönderimi; 5) Onay özeti.
- **Derin bağlantı:** `/dealer/campaigns?new=1&segment=risk&source=churn-risk` editörü ön-dolu açsın; churn-risk, segment-actions, morning-briefing CTA'ları bunu kullansın.

**Motion / 3D:** 3D gerekmiyor — iş aracı. Ölçülü motion: editör adımları arası yatay kayma (150–200 ms), kitle sayısında sayı-akışı (count-up), gönderim sırasında satırda ilerleme çubuğu (kuyruk durumu), gönderim tamamlandığında satır içinde kısa "teslim edildi" geçişi. Konfeti vb. kutlama efektleri bu ekranda uygun değil. `m as Motion` + global `MotionConfig reducedMotion="user"` korunmalı.

**Veri / API değişiklikleri:**
- `Campaign`: `status` enum (`draft|scheduled|sending|sent|failed|archived`), `segmentKey`, `audienceRules Json?`, `channels String[]`, `scheduledAt`, `deliveredCount`, `readCount`, `clickCount`, `archivedAt`, `offerId?`.
- Yeni `CampaignDelivery` (alıcı × kanal satırı) ve `DealerMarketingConsent`.
- `GET /api/dealer/campaigns/audience-preview?segment=…` → `{ total, eligible, byChannel }`.
- `POST /api/dealer/campaigns/[id]/send` → 202 + kuyruk; `POST /[id]/test` (bayinin kendisine); `POST /[id]/duplicate`.
- Tüm uçlar tek bir modül sarmalayıcısı + Zod şeması + hız sınırı ile.
- Bildirimlere `data: { kind: 'campaign', campaignId }`; push URL'si izlenen yönlendirme (`/r/c/{id}`), böylece performans gerçek veriden hesaplanır.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/segment-actions`** (`lib/segment-action-center.ts:51-60`): Aynı işi (segmente toplu teklif/mesaj) farklı segment kaynağıyla (CLV) ve farklı uçlarla (`/api/dealer/campaigns/risk-segment`, `/api/dealer/win-back`, `/api/dealer/innovation/segment-proposals`) yapıyor. `risk-segment` ucu da bildirim tercihini yok sayıyor ve `kind` taşımıyor (`risk-segment/route.ts:58-65`). **Öneri:** segment-actions, kampanya merkezinin "Önerilen" sekmesi olsun; tüm tek-tık aksiyonlar ortak `campaign-delivery` servisinden geçen bir kampanya kaydı üretsin (geçmiş ve performans tek yerde).
- **`/dealer/churn-risk`** (win-back): Kendi gönderim mantığı var (`app/api/dealer/win-back/route.ts:13-15`, 100 alıcı sınırı) ve "Kampanya oluştur" CTA'sı ön-dolu olmadan bu sayfaya geliyor (`churn-risk/page.tsx:259-260`). Win-back bir kampanya şablonu olarak birleşmeli.
- **`/dealer/growth-hub`**: Sadece bu sayfaya link veren bir hub (`growth-hub/page.tsx:12`) — çakışma değil, giriş noktası; korunabilir.
- **`/dealer/innovation`** (segment önerileri / flash teklif): Teklif üretimi kampanya editörünün "teklif ekle" adımına bağlanmalı.
- **`/customer/campaigns`** isim çakışması: Müşteri tarafındaki "Kampanyalar" sayfası bayi kampanyalarını değil happy-hour kayıtlarını gösteriyor (`app/customer/campaigns/page.tsx:48`), happy-hour oluşturmanın ise bayi panelinde hiçbir arayüzü yok (`app/api/happy-hour/route.ts:109` POST var; `app/dealer` altında kullanan dosya yok). Bayinin gönderdiği kampanya müşteride yalnız bildirim olarak yaşıyor, kalıcı bir "teklifler" yüzeyinde görünmüyor. **Öneri:** Kampanyalar (mesaj) ve süreli teklifler (happy hour) kampanya merkezinde iki tür olarak yönetilsin; müşteri tarafındaki sayfa her ikisini de "Bu işletmeden teklifler" olarak listelesin.

## Doğrulama (şüpheci inceleme)

Her iddia kod baştan okunarak çürütülmeye çalışıldı (gönderim ucu, PATCH/DELETE ucu, liste/oluşturma ucu, `lib/module-gate.ts`, `lib/push.ts`, `lib/notification-prefs.ts`, `lib/notify-prefs-server.ts`, `lib/team-notify.ts`, `prisma/schema.prisma`, `proxy.ts`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Kampanya bildirimleri müşteri tercihini ve pazarlama iznini yok sayıyor — **DOĞRULANDI**
- `app/api/dealer/campaigns/[id]/send/route.ts:107-114` doğrudan `prisma.notification.createMany` çağırıyor; `data` alanı hiç yazılmıyor, dolayısıyla `data.kind` yok. Tercih motoru (`kindToGroup` → `isChannelEnabled`) yalnız `lib/team-notify.ts:23-35` ve `lib/character-badges.ts:288-307` içinde kullanılıyor; `notifyRespectingPrefs` (`lib/notify-prefs-server.ts:49-71`) projede hiçbir yerden çağrılmıyor.
- Push (`send/route.ts:116-127` → `lib/push.ts:13-30`) da tercih okumuyor; `sendPushNotification` yalnız aktif abonelik arar.
- Müşteri ayarlarında "Kampanya & Sürprizler" grubu için app/e-posta/push anahtarları gerçekten var (`lib/notification-prefs.ts:49-53`, `app/customer/settings/page.tsx:121-124`, kayıt `app/api/customer/settings/route.ts:216-236`).
- **Yeniden üretim:** Müşteri ayarlardan "Kampanya & Sürprizler → Uygulama içi" ve "Push" anahtarlarını kapatır → `notificationPrefs = {campaign:{app:false,push:false}}`. Bu müşterinin geri bildirim bıraktığı bayi `targetSegment:'all'` kampanya gönderir → müşterinin zilinde `type:'campaign'` kaydı oluşur ve cihazına push düşer.
- Not: Şemada ayrı bir pazarlama/ETK rızası alanı yok (`prisma/schema.prisma` içinde consent/opt-in alanı bulunamadı); hukuki risk (KVKK/6563) kod dışı bir değerlendirmedir, burada doğrulanmadı. Kod düzeyindeki somut hata tercih ihlalidir ve tek başına yeterli.

### 2. E-posta kanalı sahte — **DOĞRULANDI**
- Arayüz kanal olarak "E-posta" seçtiriyor (`app/dealer/campaigns/page.tsx:266-270`, `messages/tr.json:1143`) ve şema bunu kaydediyor (`app/api/dealer/campaigns/route.ts:15`, `schema.prisma:2648`).
- Gönderim ucunda e-posta kodu yok; push yalnız `campaign.channel === 'notification'` ise çalışıyor (`send/route.ts:116`). `channel:'email'` kampanyada sonuç: yalnız uygulama içi kayıt, e-posta yok, push yok.
- **Yeniden üretim:** Kanal "E-posta" seçilerek kampanya oluşturulup gönderilir → toast "{n} müşteriye gönderildi" (`page.tsx:106`, `messages/tr.json:1131`) görünür; hiçbir müşteriye e-posta gitmez, push da atlanır. Bayi aslında daha zayıf bir kanalla gönderdiğini bilmez.
- Küçük düzeltme: "Hiçbir şey gitmiyor" denemez, uygulama içi kayıt oluşuyor; iddia bu nüansla doğru.

### 3. 'Sadık' segmenti 'Aktif' ile aynı kitleye gidiyor; VIP bayiye özgü değil — **DOĞRULANDI**
- `send/route.ts:40-83`: yalnız `all`, `vip`, `risk` için özel dal var; `loyal` ve `active` ikisi de `else` dalına düşüyor (bu bayide ≥3 geri bildirim). İki farklı etiketli segment (`messages/tr.json:1146-1147`) birebir aynı alıcı kümesini üretir.
- VIP filtresi `user.vipStatus isNot null` (`send/route.ts:53`); `UserVIPStatus` modelinde `dealerId` yok, `userId @unique` ile platform geneli tek kayıt (`schema.prisma:1793-1806`).
- **Yeniden üretim:** Başka işletmelerde puan biriktirip VIP olmuş, bu bayiye yalnız bir kez geri bildirim bırakmış kullanıcı, bu bayinin "VIP üyeler" kampanyasını alır. Aynı bayi "Sadık" ve "Aktif" iki kampanya gönderirse aynı kişiler iki mesaj alır.

### 4. Gönderim transaction'sız: 'sent' kilitlenip teslimat başarısız olabilir — **DOĞRULANDI (önem: orta; push kısmı abartılı)**
- `send/route.ts:96-105` önce `status:'sent'`, `sentCount` yazıyor (çift gönderime karşı bilinçli "claim" deseni); ardından `createMany` (`:107-114`). `createMany` atarsa `catch` (`:130-135`) yalnız 500 döner, durum geri alınmaz; sonraki deneme `:33-35` ile "Bu kampanya zaten gönderildi" reddi alır.
- Somut tetikleyici: iki sorgu arasında geçici Neon/pooler hatası ya da alıcı listesi çekildikten sonra hesabı silinen bir kullanıcı (Notification.userId FK, `schema.prisma:1001`) → tüm `createMany` toplu başarısız olur → kampanya "N müşteriye gönderildi" gösterir ama 0 kayıt vardır.
- Push kısmı: `Promise.allSettled` (`:126`) push hatalarını yutar, ve `createMany` push'tan önce tamamlandığı için zaman aşımı uygulama içi teslimatı geri almaz; push için "geri alınmaz" iddiası sonuç değiştirmez. Ancak 500 alıcıda alıcı başına abonelik sorgusu (`lib/push.ts:25-27`) ve istek içinde senkron bekleme gerçek bir ölçek/zaman aşımı riskidir.
- Öneri: claim + `createMany` tek `prisma.$transaction` içinde; push teslimatını istek dışına (kuyruk/`after()`) taşıyıp kampanyaya `deliveredCount`/`failedCount` yazmak; başarısız kampanyayı `failed` durumuna alıp yeniden denemeye izin vermek.

### 5. Modül kapısı atlatılabiliyor — **DOĞRULANDI (kısmen; önem: orta)**
- Gönderim ucu kapıyı çağırıyor ama `role` vermeden: `assertModuleEnabled('campaigns')` (`send/route.ts:19`). `campaigns` modülünün scope'u `dealer` (`lib/module-controls.ts:31`), bu yüzden `lib/module-gate.ts:97-98` rolü `undefined` bırakır ve `:101` rol bazlı kapatmayı hiç kontrol etmez. Global kapatma (`:100`) ise çalışır; dolayısıyla iddia "global kapatmada bile gönderilir" anlamında DEĞİL, "yalnız bayi rolü için kapatma / menü gizleme atlatılır" anlamında doğrudur. `assertMenuItemVisible` de gönderim ucunda yok (liste/oluşturma ucunda var: `route.ts:23-33`, `:55-67`).
- PATCH/DELETE (`app/api/dealer/campaigns/[id]/route.ts`) hiçbir modül/menü kapısı çağırmıyor; global kapatmada bile çalışır. `proxy.ts` bu uçlar için ek kontrol yapmıyor.
- **Yeniden üretim:** Bayinin önceden oluşturduğu taslak (id'si önceki liste yanıtından bilinir). Admin `featureVisibility.dealer.campaigns=false` veya menüyü gizler → `GET /api/dealer/campaigns` 403 döner, ama `POST /api/dealer/campaigns/{id}/send` 200 ile müşterilere gönderir; PATCH ile mesaj değiştirilip öyle gönderilebilir.
- Frekans sınırı: her kampanya bir kez gönderilir, ancak oluşturma ucunda (`route.ts:50-91`) ve gönderimde rate limit yok; bayi art arda sınırsız kampanya oluşturup aynı 500 kişiye peş peşe mesaj atabilir. Doğrulandı.
- Öneri: tüm kampanya uçlarını ortak bir `assertDealerCampaignAccess(session, request)` yardımcısından geçirmek (menü + `role:'dealer'` modül kapısı), gönderime bayi başına günlük/haftalık kota ve müşteri başına frekans tavanı (ör. aynı müşteri 7 günde en fazla 2 kampanya) eklemek.

## Uygulama (Dalga 2)

Yeni yapı: sunucu bileşeni `app/dealer/campaigns/page.tsx` (yetki + ilk liste/özet SSR ön-yükleme, `loading.tsx` iskelet) → istemci adası `components/dealer/b-kampanyalar/ui/campaigns-screen.tsx`. Sunucu mantığı `components/dealer/b-kampanyalar/server/*` (audience, delivery, schedule, list, crud, performance, snapshot); tüm uçlar `lib/http/define-route.ts` (rol DEALER/ADMIN + zod + rate limit + kiracı kapsamı). Yeni uçlar: `audience`, `summary`, `[id]/preview`, `[id]/schedule`, `[id]/duplicate`, `[id]/archive`, `/api/campaigns/[id]/open` (izlenen push bağlantısı), `/api/cron/campaign-dispatch` (planlı gönderim).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Hero | ÇALIŞIYOR (QDL v2 sayfa başlığı) |
| 2 | Playbook ipucu | ÇALIŞIYOR — playbook taslağı artık düzenlenebiliyor; kaynak rozeti satırda |
| 3 | Yeni kampanya | ÇALIŞIYOR |
| 4 | Liste yükleme | ÇALIŞIYOR — SSR ön-yükleme + sunucu sayfalama (300 sabit sınırı kalktı) |
| 5 | Yükleniyor | ÇALIŞIYOR — iskelet (`loading.tsx` + QueryState) |
| 6 | Hata + tekrar dene | ÇALIŞIYOR (QueryState) |
| 7 | Boş durum | ÇALIŞIYOR — öğretici boş durum, sekme/filtre başına ayrı metin |
| 8–9 | Başlık, playbook rozeti | ÇALIŞIYOR |
| 10 | Durum rozeti | ÇALIŞIYOR — `scheduled` artık gerçek (zamanlama var); `failed`, `archived` eklendi |
| 11 | Segment etiketi | ÇALIŞIYOR — token tabanlı rozet, koyu tema kontrastı |
| 12 | Mesaj önizleme | ÇALIŞIYOR — önizleme diyaloğu tam mesajı gösterir |
| 13 | "{n} müşteriye gönderildi" | ÇALIŞIYOR — teslim edilen / açılan sayısı ve dışarıda kalanlar (izin, frekans, kontrol grubu, tavan) ayrı |
| 14 | Tarih | ÇALIŞIYOR — oluşturma/plan/gönderim tarihi, Europe/Istanbul |
| 15 | Performans linki | ÇALIŞIYOR — yalnız gönderilmiş kampanyada; gerçek huni (performans raporu) |
| 16 | Gönder | ÇALIŞIYOR — onay diyaloğu (net kitle + dışlananlar), satır başına bekleme durumu |
| 17 | Sil | ÇALIŞIYOR — yalnız taslak/başarısız silinir (onaylı); gönderilmiş kampanya arşivlenir (iz kaybı yok) |
| 18 | Animasyon | ÇALIŞIYOR — `m` + `useMotionPolicy`, azaltılmış hareket |
| 19–21 | Oluşturma diyaloğu, başlık, mesaj | ÇALIŞIYOR — `htmlFor`, `maxLength`, karakter sayacı + push uzunluk rehberi |
| 22 | Hedef segment | ÇALIŞIYOR — segmentler bayiye özgü yeniden tanımlandı (Sadık ≠ Aktif; VIP bu bayideki davranıştan); tanım `domain.ts`, testli |
| 23 | Kanal | ÇALIŞIYOR — sahte "E-posta" kaldırıldı; uygulama içi + push. Eski e-posta kayıtları gönderimde açık hata ile reddedilir (`CHANNEL_UNSUPPORTED`) |
| 24–25 | İptal / Oluştur + doğrulama | ÇALIŞIYOR (zod sunucuda otoriter) |
| 26 | Toast | ÇALIŞIYOR — yüzeyin kendi tam Türkçe metinleri |
| 27 | Düzenleme | ÇALIŞIYOR — taslak/planlı/başarısız düzenlenir |
| 28 | Zamanlanmış gönderim | ÇALIŞIYOR — `[id]/schedule` + günlük cron `campaign-dispatch` (gün hassasiyeti; şemada `scheduledAt` olmadığından plan audit kaydında) |
| 29 | Kitle önizleme / test gönderimi | ÇALIŞIYOR (kitle) — `audience` ucu: segment büyüklüğü, izinsiz/frekans tavanı düşülmüş net sayı. Test gönderimi KALDIRILDI (alıcı listesini/huniyi kirletir) |
| 30 | Filtre/arama/sıralama/sayfalama | ÇALIŞIYOR — sekme (taslak/planlı/gönderildi/arşiv), arama, segment filtresi, sayfalama |
| 31 | Özet şeridi | ÇALIŞIYOR — `summary` ucu: gönderim, ulaşılan kişi, açılma oranı (gerçek `readAt` + push açılışı) |
| 32 | Bildirim tercihine saygı (E3) | ÇALIŞIYOR — `lib/marketing-delivery` (fail-closed); bildirimler `data.kind='campaign'` taşır; push da tercih filtresinden geçer |
| 33 | Modül/menü kapısı | ÇALIŞIYOR — tüm uçlar aynı kapıdan |
| 34 | Ön-dolu derin bağlantı | ÇALIŞIYOR — `?new=1&segment=…&title=…&message=…&source=…` |
| 35 | Çoğalt | ÇALIŞIYOR — `[id]/duplicate` |
| 36–38 | Rol, azaltılmış hareket, meta | ÇALIŞIYOR |

### Kapanan bulgular (11/11)

1 tercih/izin ihlali (fail-closed filtre), 2 sahte e-posta (kaldırıldı), 3 segment tanımları, 4 atomiklik (durum kilidi + bildirimler + gönderim kaydı tek transaction; başarısızsa yeniden denenebilir), 5 push N+1/eşzamanlılık (transaction dışı, sınırlı eşzamanlılık), 6 kapı tutarsızlığı, 7 sessiz 500 kesme (1000 tavan + kesilen sayı açıkça gösterilir), 8 sahte performans (gerçek huni), 9 onaysız geri alınamaz eylemler, 10 düzenleme yok, 11 dil/tutarlılık. Ek: müşteri başına frekans tavanı, oluşturma/gönderim rate limit.

### A/B

Şemada varyant alanı yok. Mevcut altyapıyla kontrol grubu (holdout) uygulandı: gönderimde seçilen oranda alıcı ileti almadan bırakılır, performansta ziyaret oranı farkı (artış, yüzde puanı) gösterilir; örneklem küçükse "yetersiz örneklem" olarak işaretlenir.

### Kalanlar

- Gerçek A/B (iki mesaj varyantı) — ŞEMA İSTEĞİ: `Campaign.variants Json?` ya da `CampaignVariant` modeli.
- Saat hassasiyetli zamanlama — ŞEMA İSTEĞİ: `Campaign.scheduledAt DateTime?` + indeks; şu an plan günü audit kaydında, cron günlük.
- E-posta kanalı — ayrı ticari ileti onayı gerekiyor: ŞEMA İSTEĞİ `User.marketingEmailConsentAt`.
- `app/api/cron/daily/jobs.ts` içindeki `campaign-dispatch` kaydı paylaşılan dosyada (inbox-queues ile birlikte staged); o dosyanın sahibi commit'lemeli.
- segment-actions / churn-risk / happy-hour birleşmesi diğer yüzeylerin sahipliğinde; bu yüzey ön-dolu derin bağlantıyı sağlar.
