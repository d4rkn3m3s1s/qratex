# i18n ve içerik kalitesi — genel denetim

Tarama: `node scripts/audit/i18n-scan.mjs [--detail]` (tr/en anahtar farkı, ASCII'leşmiş Türkçe, jenerik pazarlama dili, JSX içi sabit Türkçe).

## Bulgular (ölçüm, 2026-10-12)
| Ölçüt | Sonuç |
|---|---|
| en.json'da eksik anahtar | 0 |
| tr.json'da eksik anahtar | 0 |
| Türkçe değeri en.json'a aynen kopyalanmış | 0 |
| ASCII'leşmiş metin isabeti | 16 (15'i URL/param/slug/veri anahtarı — kullanıcıya görünmez; 1 gerçek) |
| Jenerik pazarlama dili | 7 (6'sı oyun "next level" = XP seviyesi, yanlış pozitif; 1 karakter alıntısı, bağlama uygun) |
| JSX içi sabit Türkçe | 260 dosya / 1102 satır |

## Düzeltilen
- `lib/admin-toast.ts`: tüm admin başarı bildirimleri **"Basarili: "** önekiyle çıkıyordu → **"Başarılı: "**. (9 admin dosyası bu sarmalayıcıyı kullanıyor; en sık görünen ASCII hatası.)

## Kalan (öncelik sırasıyla)
1. **Müşteri yüzü, EN modunda Türkçe kalan:** `components/customer/games/venue-quiz/venue-quiz-game.tsx` (23 sabit satır, dil desteği hiç yok). Diğer müşteri bileşenleri `copy.ts` desenini kullanıyor; bu oyun da aynı desene taşınmalı.
2. Admin panel JSX'i büyük ölçüde sabit Türkçe (ilk sıralar: users-automation-panel, key-dialogs, audit-center, kampanya editörü, seo-console). Admin yalnız TR kullanıyorsa kabul edilebilir — ürün kararı gerekli; değilse alan başına `copy.ts` göçü.
3. Yasal sayfalar (`kullanim-sartlari`, `gizlilik-politikasi`, `kvkk-aydinlatma-metni`) yalnız Türkçe — yasal metin olarak bilinçli olabilir; EN sürümü hukuk onayı ister.
4. Terim tutarlılığı (puan/point, rozet/badge) ve boş/hata/onay metinlerinin elle gözden geçirilmesi bu turda yapılmadı; betik tabanı hazır, desen eklenerek genişletilebilir.
