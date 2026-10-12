# Karar: personel işlem defteri kapsamı + zorunlu admin 2FA (2026-10-12)

## 1. Personel tüketim listesi kapsamı
- Bayi ayarı (`Settings` tablosu, anahtar `dealer:<dealerId>:staffLedgerScope`; migration yok):
  `today` | `today_own` (**varsayılan**) | `all`.
- `today_own` = bugünün TÜM tüketimleri + personelin KENDİ girdiği geçmiş kayıtlar
  (kart denetimi `CONSUMPTION_ADDED`, `userId` = personel; en yeni 2000 kayıt).
- Zorlama sunucuda: `GET /api/dealer/consumptions` ve `/dealer/consumptions` RSC ön yüklemesi
  `resolveStaffLedgerAccess` → `listLedger({ scopeWhere })` (sayım, satırlar, özet aynı filtre).
  Ayar okunamazsa varsayılan `today_own`; asla kendiliğinden `all`'a genişlemez.
- CSV dışa aktarma personele kapalı kalır (değişmedi).
- Ayar: `GET/PATCH /api/dealer/settings/staff-ledger-scope` (yalnız DEALER, denetim kaydı
  `STAFF_LEDGER_SCOPE_SET`); UI `/dealer/team` üstündeki kart. Defter sayfası personelde
  geçerli kapsamı tek satırla yansıtır.

## 2. Zorunlu admin 2FA
- `lib/auth/admin-2fa.ts` + `requireAdminPage` (admin layout): gizli kapıdan SONRA, 2FA'sı
  kurulmamış ADMIN → `/admin/account-security?zorunlu=1`. Kurulum sayfası muaf (döngü yok).
- Karar DB'den (`twoFactorEnabled && twoFactorSecret`), JWT'ye claim eklenmedi → `sid`/kapı
  çerezi mantığına dokunulmadı; 2FA açılınca yönlendirme anında biter.
- Yol bilgisi: proxy her `/admin*` isteğinde `x-qx-pathname` başlığını EZEREK yazar.
- Muaf: `isDemo=true` ya da `ADMIN_2FA_EXEMPT_EMAILS` (varsayılan `admin@qratex.com`; demo
  giriş bloğu kalır).
- Break-glass: `ADMIN_2FA_BREAK_GLASS=1` → zorunluluk kapalı, `ADMIN_2FA_BREAK_GLASS_USED`
  denetim kaydı (oturum başına saatte bir; Redis yoksa her sayfa isteğinde) + console.warn.
- DB okunamazsa fail-open (rol + kapı zaten geçti; panel düşmez), hata loglanır.

## Kalanlar
- Zorunluluk yalnız panel SAYFALARINDA; `/api/admin/*` uçları 2FA'sız admin için ayrıca
  kesilmiyor (kapı çerezi şart olmaya devam ediyor). İstenirse `requireAuth` ADMIN dalına eklenir.
