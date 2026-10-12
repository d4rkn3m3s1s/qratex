# Sayfa tasarım düzeltmesi (20 ajan, 2026-10-12)

Her ajan yaklaşık 13 rotayı 390 ve 1440 px genişlikte DOM ölçümü ve ekran görüntüsüyle inceledi. Yatay sayfa taşması hiçbir sayfada bulunmadı. Ölçümde çıkan CLIP/OVL kayıtlarının çoğu yanlış pozitifti: sr-only metinler, SVG path'leri, bilerek kesilen (truncate) metinler.

Doğrulama: tsc 0 hata, jest 364/364 suite (5130 test) geçti.

## Düzeltmeler

| Sayfa | Sorun | Düzeltme | Commit |
|---|---|---|---|
| /admin/analytics | Isı haritası saat etiketleri mobilde dikey kırılıyordu | activity-heatmap.tsx: whitespace-nowrap | c7443cec |
| /admin/coupons | "Sayfa başına" seçicisi boştu (25 seçeneklerde yoktu) | coupons-center.tsx: COUPON_PAGE_SIZES=[10,25,50,100] | 0fab6ee3 |
| /admin/dealers-health | Mobil kartta skor rozeti tam genişliğe uzuyordu | skor hücresine items-start | 0fab6ee3 |
| /admin/games (ortak MetricTile) | "· n = 11" iki satıra bölünüyordu | metric-tile.tsx: nowrap span | fc2d16d4 |
| Tüm DataTable sayfaları (/admin/rewards vb.) | Sayfa boyutu seçenek listesinde yoksa seçici boş görünüyordu | data-table-pagination.tsx: mevcut boyut seçeneklere ekleniyor | 4597829e |
| /admin/rewards (ödül, kozmetik ve talep sekmeleri) | Mobil kartta sayılar sağa yaslanıyordu | hücrelerden text-right kaldırıldı | 4597829e |
| /admin/segments | Arama kutusu mobilde yaklaşık 70 px'e sıkışıyordu | arama tam satır, dışa aktarma alt satırda | 4597829e |
| /admin/seasonal-campaigns, seasonal-concepts | Zaman çizelgesinde etiketler çakışıyordu ("28 Eyl1 Eki") | timeline.tsx ticks(): yakın etiketler eleniyor | 4597829e |
| /admin/referrals | Veri yokken "Son Davet Logları" kartı boş kalıyordu | boş durum metni (TR/EN) | 4597829e |
| /customer/me/year | Ay ve yıl çipleri üst üste biniyordu | period-picker.tsx: [&>li]:shrink-0 | 7c0e31d1 |
| /customer/quests (ortak GlowCard) | Gradient kenar 16 px aşağı kayıyordu (space-y marjı) | glow-card.tsx: kenar span'ine !m-0 | ecd3e24f |
| /dealer/automation/{replies,remedy,alerts} | Kart blokları arasında boşluk yoktu (QueryState fragment) | gövdeye flex flex-col gap-section; boş Warnings null | cf2e63b0 |
| /dealer/products | Yüzen +Ürün düğmesi son kartı örtüyordu | ızgaraya pb-24 md:pb-0 | 627db4ba |
| /dealer/surveys/[id]/edit, create | Soru tipi seçicisinde ikon üstte duruyor, metin kesiliyordu | question-editor.tsx: !flex, truncate, min-w-[11rem], eylemler alt satıra sarıyor | fa901e48 |

## Kalanlar

- **Global maskot FAB** (fixed, sağ altta): mobilde içeriğin üstüne biniyor. Görüldüğü yerler: /admin KVKK satırı, /admin/ai, /customer/wallet/card "Puanla", /dealer/assistant. Öneri: main'e alt boşluk eklemek ya da düğmeyi kaydırırken gizlemek. Ortak kabukta olduğu için dokunulmadı.
- **QueryState fragment + div.relative**: gap kaybettiren bu desen başka ekranlarda da olabilir. Ortak bileşende ayrı bir iş olarak düzeltilmeli.
- **Ana kapsayıcıda 4 px fark** (max-w-7xl): scrollWidth > clientWidth, ama sayfa taşması yok. Büyük olasılıkla odak halkasından ya da gölgeden geliyor.
- **Görülemeyen sayfalar** (dev sunucusu yükü ya da oturum düşmesi):
  - /admin/shop
  - /customer (yükleme hatası ekranı açıldı)
  - /customer/games hub
  - /customer/places/[dealerId]
  - /customer/remedy/[offerId]
  - /customer/consumptions/[id]
  - /dealer/campaigns/[id]/performance
  - /dealer 1440 taraması (innovation, offers)
  - /staff, /staff/defter, /staff/field, /staff/kasa (personel girişi yapılamadı)
  - /wall/[token] (geçerli token yok)
  - /experience/[token] (geçerli token yok)
  - /c/[token] (geçerli token yok)
- **Yetki sınırlı demo admin**: 2FA kapalı olduğu için navigation, pricing ve observability sayfalarında veri dolu görünüm doğrulanamadı.
- **Kozmetik, düzeltilmedi**:
  - "Düşük örneklem" rozeti /admin/analytics ve /dealer/team'de iki satıra sarıyor.
  - me/invite düğme etiketleri iki satıra kırılıyor.
  - /admin/seo mobilde büyük bir boşluk var (kök neden bulunmadı).
  - "[TEST]" adlarda avatar baş harfi "[A" görünüyor.
  - Benchmark/impact grafiklerinde veri yokken boş durum metni yok.
- Bazı düzeltmeler (heatmap, me/year, products, surveys) sonradan ekran görüntüsüyle yeniden doğrulanmadı.
