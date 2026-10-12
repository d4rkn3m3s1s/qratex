# Mağaza metinleri — Qratex (TR + EN)

Karakter sınırları her alanın yanında. Metinler pazarlama vaadi içermez ("en iyi", "1 numara" gibi
ifadeler iki mağazada da reddedilme sebebi). Puan **para değildir**, nakde çevrilmez. Bunu açıklamada
belirtmek hem inceleme hem de yaş derecelendirmesi için önemli.

| Alan | Değer |
|---|---|
| Paket / Bundle ID | `com.qratex.app` |
| Uygulama adı | **Qratex** |
| Kategori (birincil / ikincil) | Yemek ve İçecek / Yaşam Tarzı (Play: *Food & Drink*) |
| Destek URL | https://qratex.com/guven |
| Gizlilik politikası URL | https://qratex.com/gizlilik-politikasi |
| Kullanım şartları | https://qratex.com/kullanim-sartlari |
| Hesap silme URL'si (Play zorunlu) | https://qratex.com/customer/settings (uygulama içinden: Ayarlar > Hesabı sil) |
| İletişim e-postası | destek@qratex.com *(proje sahibi doğrulasın, mağazada görünür)* |

---

## Türkçe (tr-TR)

**Alt başlık / iOS Subtitle** (≤30): `QR okut, değerlendir, kazan`

**Play kısa açıklama** (≤80): `Mekândaki QR'ı okut, deneyimini anlat, puan topla ve ödülleri kasada kullan.`

**Tanıtım metni / iOS Promotional Text** (≤170, incelemesiz değişir):
`Bu hafta Qratex mekânlarında 2 kat puan fırsatları var. Masandaki QR'ı okut, birkaç saniyede değerlendir, ödülünü kasada göster.`

**Açıklama** (≤4000):

```
Qratex, gittiğin kafe ve restoranlarla arandaki köprü.

Masadaki ya da fişteki QR kodu okut, deneyimini birkaç dokunuşla anlat. Mekân geri bildirimini doğrudan görür; sen de her değerlendirmede puan kazanırsın.

NE YAPABİLİRSİN
• QR okut, değerlendir: Kamera ile kodu okut, yıldız ver, istersen yorum ve fotoğraf ekle.
• Puan topla: Değerlendirmeler, günlük hedefler ve giriş serisi puan kazandırır.
• Ödülleri kullan: Kazandığın ödülü kasada kartından göster; kasiyer okutur, iş biter.
• Fırsatları kaçırma: Yakınındaki mekânların happy hour ve çift puan saatlerini gör.
• İlerlemeni izle: Seviye, lig ve rozetlerle mekân alışkanlığın bir koleksiyona dönüşür.
• Oyna: Kısa mini oyunlar ve günlük kelime ile bekleme anlarını değerlendir.

İŞLETMELER İÇİN
Mekân sahipleri aynı uygulamadan işletme paneline girer: gelen değerlendirmeleri yanıtlar, işlem defterini ve ciroyu izler, QR kodlarını yönetir, olumsuz deneyim yaşayan müşteriye telafi sunar.

GİZLİLİK
Analitik yalnız onay verirsen açılır. Reklam yok, verin satılmaz. Hesabını ve verilerini uygulama içinden indirebilir ya da silebilirsin.

Puanlar Qratex içinde ödül almak için kullanılır; para değildir, nakde çevrilemez ve satın alınamaz.
```

**Anahtar kelimeler / iOS Keywords** (≤100, virgülle, boşluksuz; ad ve kategori kelimelerini tekrar etme):
`qr,değerlendirme,yorum,sadakat,puan,ödül,kafe,restoran,mekan,kampanya,fırsat,indirim,menü,rozet`

---

## English (en-US)

**Subtitle** (≤30): `Scan, review, earn rewards`

**Play short description** (≤80): `Scan the QR at your table, share your experience, earn points, redeem rewards.`

**Promotional text** (≤170):
`Double-point hours are live at Qratex venues this week. Scan the QR at your table, review in seconds and show your reward at the counter.`

**Description** (≤4000):

```
Qratex connects you with the cafés and restaurants you visit.

Scan the QR code on your table or receipt and tell the venue how it went in a few taps. The venue sees your feedback directly, and you earn points for every review.

WHAT YOU CAN DO
• Scan and review: Scan the code with your camera, rate, and add a comment or photo if you like.
• Earn points: Reviews, daily goals and visit streaks all earn points.
• Redeem rewards: Show your reward on your card at the counter; staff scan it and you're done.
• Catch the deals: See happy hours and double-point times at venues near you.
• Track your progress: Levels, leagues and badges turn your favourite spots into a collection.
• Play: Short mini-games and a daily word puzzle for the moments you're waiting.

FOR BUSINESSES
Venue owners use the same app to open their business panel: reply to reviews, follow the transaction log and revenue, manage QR codes, and offer make-good rewards to guests who had a bad experience.

PRIVACY
Analytics only turn on with your consent. No ads, and your data is never sold. You can export or delete your account and data from inside the app.

Points are used to claim rewards inside Qratex. They are not money, cannot be cashed out and cannot be purchased.
```

**Keywords** (≤100): `qr,review,feedback,loyalty,points,rewards,cafe,restaurant,venue,deals,discount,menu,badges`

---

## İnceleme notu (App Review Information / Play "App access")

Apple 4.2 (Minimum Functionality) riskine karşı native yetenekleri açıkça belirtin:

```
Qratex is a native shell around our live service with device features: camera-based QR scanning
(WebView getUserMedia, NSCameraUsageDescription), push notifications (APNs/FCM) for review replies
and rewards, universal links for qratex.com, native back/status bar handling and an offline screen.

Demo account (customer): <review-customer@...> / <parola>
Demo account (business): <review-dealer@...> / <parola>
Test QR code: attached image, or open https://qratex.com/q/<demo-kod> on another device and scan.
```
> **Yapılacak:** inceleme için **ayrı** hesaplar açın (geliştirme demo hesaplarını vermeyin), parolayı
> yalnız mağaza konsoluna yazın, repoya yazmayın. Test QR'ı için kalıcı bir demo mekân kodu üretin.
