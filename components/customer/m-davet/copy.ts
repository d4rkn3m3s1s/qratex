/**
 * Davet yüzeyi metinleri (TR/EN). Hitap tek tip: "sen".
 * Sunucu hata kodları (`code`) burada kullanıcının dilinde karşılanır; sunucunun Türkçe
 * mesajı yalnız bilinmeyen kodda yedek olarak gösterilir.
 */
import { useDsLocale, type DsLocale } from '@/components/ds/a11y';

export type InviteLocale = DsLocale;

const TR = {
  eyebrow: 'Ben · Davet',
  title: 'Arkadaşını davet et',
  description: 'Arkadaşın ilk QR deneyimini tamamladığında ikiniz de puan kazanırsınız.',

  offerYou: 'Sana',
  offerFriend: 'Arkadaşına',
  pointsUnit: 'puan',
  offerAria: (you: string, friend: string) => `Her başarılı davette sana ${you}, arkadaşına ${friend} puan`,

  yourCode: 'Davet kodun',
  codeAria: (spelled: string) => `Davet kodun: ${spelled}`,
  codePreparing: 'Davet kodun hazırlanıyor…',
  codeError: 'Davet kodun hazırlanamadı.',
  codeInactive: 'Davet kodun şu anda devre dışı. Yeni davetler kabul edilmiyor; mevcut davetlerin etkilenmez.',
  retry: 'Tekrar dene',

  shareLink: 'Bağlantıyı paylaş',
  copyLink: 'Bağlantıyı kopyala',
  copyCode: 'Kodu kopyala',
  copied: 'Kopyalandı',
  linkCopied: 'Davet bağlantın kopyalandı.',
  codeCopied: 'Davet kodun kopyalandı.',
  shared: 'Paylaşım açıldı.',
  copyFailed: 'Kopyalanamadı. Aşağıdaki bağlantıyı seçip elle kopyalayabilirsin.',
  manualLinkLabel: 'Davet bağlantın',
  whatsapp: 'WhatsApp ile gönder',
  showQr: 'QR ile davet et',
  hideQr: 'QR kodunu gizle',
  qrTitle: 'Yüz yüze davet',
  qrHint: 'Arkadaşın telefon kamerasıyla okutsun; kayıt sayfası kodunla açılır.',
  qrAlt: (code: string) => `Davet bağlantını açan QR kodu (kod ${code})`,
  qrError: 'QR kodu oluşturulamadı.',
  qrDownload: 'QR görselini indir',
  shareTitle: (site: string) => `${site} daveti`,
  shareText: (site: string, friend: string) =>
    `${site}'te QR okut, puan kazan! Bağlantımla kaydol; ilk QR deneyiminde +${friend} puan senin.`,

  howTitle: 'Nasıl çalışır?',
  how1: 'Bağlantını ya da kodunu paylaş.',
  how2: 'Arkadaşın kaydolup e-postasını doğrular.',
  how3: (days: number) => `${days} gün içinde ilk QR deneyimini tamamlar; ödüller ikinize de geçer.`,

  statsTitle: 'Davet özetin',
  statCompleted: 'Tamamlanan',
  statPending: 'Bekleyen',
  statEarned: 'Davetlerden kazancın',
  earnedBreakdown: (perInvite: string, milestones: string) => `${perInvite} davet + ${milestones} kademe`,
  statExpiredNote: (n: string) => `${n} davetin süresi doldu.`,

  milestonesTitle: 'Davet kademeleri',
  milestonesDesc: 'Başarılı davetlerin arttıkça kademe bonusları açılır.',
  milestoneStop: (count: number) => `${count} davet`,
  stateClaimed: 'Alındı',
  stateClaimable: 'Hazır',
  stateLocked: (n: number) => `${n} davet kaldı`,
  nextMilestone: (n: number, pts: string) => `${n} başarılı davet daha → +${pts} puan`,
  allMilestonesDone: 'Tüm kademeleri tamamladın. Her yeni davet yine puan kazandırır.',
  claim: (pts: string) => `Kademe ödülünü al (+${pts})`,
  claiming: 'Alınıyor…',
  claimedToast: (pts: string) => `Kademe ödülün hesabına geçti: +${pts} puan.`,
  claimError: 'Kademe ödülü alınamadı.',
  progressLabel: 'Sonraki kademe',

  listTitle: 'Davet ettiklerin',
  listDesc: 'Arkadaşının hangi adımda olduğunu buradan izle.',
  friend: 'Arkadaşın',
  invitedOn: (d: string) => `Davet: ${d}`,
  statusCompleted: 'Tamamlandı',
  statusPending: 'Bekliyor',
  statusExpired: 'Süresi doldu',
  stepJoined: 'Kaydoldu',
  stepVerified: 'E-postasını doğruladı',
  stepFirstQr: 'İlk QR deneyimi',
  stepDone: 'tamam',
  stepTodo: 'bekleniyor',
  expiresOn: (d: string) => `Son gün: ${d}`,
  earnedPoints: (pts: string) => `+${pts} puan`,
  nudge: 'Hatırlat',
  nudgeSent: 'Hatırlatma gönderildi.',
  nudgeNext: (d: string) => `Yeniden hatırlatma: ${d}`,
  nudgeNeedsVerify: 'Arkadaşın önce e-postasını doğrulamalı; giriş yapınca adımları görecek.',
  check: 'Ödülü kontrol et',
  checkQualified: (pts: string) => `Davet tamamlandı: +${pts} puan.`,
  checkNotYet: 'Davet henüz tamamlanma koşullarını sağlamıyor.',
  actionError: 'İşlem tamamlanamadı.',
  loadMore: 'Daha fazla göster',
  loadingMore: 'Yükleniyor…',
  emptyTitle: 'Henüz kimseyi davet etmedin',
  emptyDesc: 'İlk davetini gönder; arkadaşın katılınca burada adım adım görürsün.',

  referredTitle: 'Hoş geldin bonusun',
  referredBy: (name: string) => `Seni ${name} davet etti.`,
  referredByAnon: 'Bir arkadaşın seni davet etti.',
  referredPending: (pts: string) => `İlk QR deneyimini tamamla, +${pts} puan hesabına geçsin.`,
  referredCompleted: (pts: string) => `Hoş geldin bonusun hesabına geçti: +${pts} puan.`,
  referredExpired: 'Davetin süresi doldu; hoş geldin bonusu verilmedi.',
  scanCta: 'QR okut',

  applyTitle: 'Davet kodun var mı?',
  applyDesc: (d: string) => `Bir arkadaşının kodunu ${d} tarihine kadar girebilirsin.`,
  applyLabel: 'Arkadaşının davet kodu',
  applyPlaceholder: 'Örn. 7KQ2M9XA',
  apply: 'Kodu uygula',
  applying: 'Uygulanıyor…',
  applyPending: 'Kod kaydedildi. E-postanı doğrulayıp ilk QR deneyimini tamamladığında bonusun hesabına geçecek.',
  applyCompleted: (pts: string) => `Tebrikler! Hoş geldin bonusun hesabına geçti: +${pts} puan.`,

  rulesTitle: 'Kurallar ve sınırlar',
  ruleQualify: (days: number) =>
    `Ödül, arkadaşın e-postasını doğrulayıp ${days} gün içinde ilk QR deneyimini (geri bildirim ya da kart kullanımı) tamamladığında verilir.`,
  ruleMonthly: (used: string, max: string, reset: string) => `Kodunla bu ay ${used}/${max} kayıt. Sayaç ${reset} tarihinde sıfırlanır.`,
  ruleLifetime: (used: string, max: string) => `Toplam davet hakkın: ${used}/${max} kullanıldı.`,
  ruleCodeUsage: (used: string, max: string) => `Bu kodun kullanım sınırı: ${used}/${max}.`,
  ruleApplyWindow: (days: number) => `Davet kodu yalnız kayıttan sonraki ${days} gün içinde elle girilebilir.`,
  ruleFair: 'Kendi kodunu kullanmak ve karşılıklı davet (birbirini davet etmek) ödüllendirilmez. Davet yalnız müşteri hesaplarına açıktır.',
  ruleNudge: (hours: number) => `Bekleyen bir arkadaşına ${hours} saatte en fazla bir hatırlatma gönderebilirsin.`,
  usageMeter: (label: string) => `${label} kullanım oranı`,

  errors: {
    WINDOW_EXPIRED: (days: number) => `Davet kodu yalnız kayıttan sonraki ${days} gün içinde kullanılabilir.`,
    MODULE_DISABLED: 'Davet programı şu anda kapalı.',
    INVALID_CODE: 'Geçerli bir davet kodu gir.',
    VALIDATION: 'Geçerli bir davet kodu gir.',
    CODE_NOT_FOUND: 'Bu davet kodu bulunamadı. Harfleri kontrol et.',
    CODE_INACTIVE: 'Bu davet kodu artık kullanılamıyor.',
    NOT_ELIGIBLE: 'Davet programı yalnız müşteri hesaplarına açıktır.',
    SELF_REFERRAL: 'Kendi davet kodunu kullanamazsın.',
    ALREADY_REFERRED: 'Daha önce bir davet kodu kullandın.',
    RECIPROCAL: 'Seni davet ettiğin kişinin kodunu kullanamazsın.',
    LIFETIME_LIMIT: 'Bu davet kodu davet sınırına ulaştı.',
    MONTHLY_LIMIT: 'Bu davet kodunun bu ayki kullanım sınırı doldu.',
    MAX_USAGE: 'Bu davet kodunun kullanım sınırı doldu.',
    RATE_LIMITED: 'Çok fazla deneme yaptın. Biraz sonra tekrar dene.',
    NOTHING_TO_CLAIM: 'Talep edilebilir kademe ödülü yok.',
    NOT_PENDING: 'Bu davet artık beklemede değil.',
    NOT_VERIFIED: 'Arkadaşın önce e-postasını doğrulamalı.',
    RECENTLY_NUDGED: 'Bu arkadaşına kısa süre önce hatırlatma gönderdin.',
    NOT_QUALIFIED: 'Davet henüz tamamlanma koşullarını sağlamıyor.',
    NOT_FOUND: 'Davet bulunamadı.',
    SERVICE_UNAVAILABLE: 'Hizmete şu an ulaşılamıyor. Birazdan tekrar dene.',
    OFFLINE: 'İnternet bağlantın yok gibi görünüyor.',
  } as Record<string, string | ((days: number) => string)>,
};

type InviteCopy = typeof TR;

const EN: InviteCopy = {
  eyebrow: 'Me · Invite',
  title: 'Invite a friend',
  description: 'When your friend completes their first QR experience, you both earn points.',

  offerYou: 'For you',
  offerFriend: 'For your friend',
  pointsUnit: 'points',
  offerAria: (you, friend) => `For every successful invite you get ${you} and your friend gets ${friend} points`,

  yourCode: 'Your invite code',
  codeAria: (spelled) => `Your invite code: ${spelled}`,
  codePreparing: 'Preparing your invite code…',
  codeError: 'Your invite code could not be prepared.',
  codeInactive: 'Your invite code is currently disabled. New invites are not accepted; existing ones are not affected.',
  retry: 'Try again',

  shareLink: 'Share link',
  copyLink: 'Copy link',
  copyCode: 'Copy code',
  copied: 'Copied',
  linkCopied: 'Your invite link was copied.',
  codeCopied: 'Your invite code was copied.',
  shared: 'Share sheet opened.',
  copyFailed: 'Could not copy. Select the link below to copy it manually.',
  manualLinkLabel: 'Your invite link',
  whatsapp: 'Send via WhatsApp',
  showQr: 'Invite with QR',
  hideQr: 'Hide QR code',
  qrTitle: 'Invite in person',
  qrHint: 'Let your friend scan it with their camera; sign-up opens with your code.',
  qrAlt: (code) => `QR code that opens your invite link (code ${code})`,
  qrError: 'The QR code could not be generated.',
  qrDownload: 'Download QR image',
  shareTitle: (site) => `${site} invite`,
  shareText: (site, friend) => `Scan QR codes on ${site} and earn points! Sign up with my link and get +${friend} points on your first QR experience.`,

  howTitle: 'How it works',
  how1: 'Share your link or code.',
  how2: 'Your friend signs up and verifies their email.',
  how3: (days) => `They complete their first QR experience within ${days} days; you both get rewarded.`,

  statsTitle: 'Your invite summary',
  statCompleted: 'Completed',
  statPending: 'Pending',
  statEarned: 'Earned from invites',
  earnedBreakdown: (perInvite, milestones) => `${perInvite} invites + ${milestones} milestones`,
  statExpiredNote: (n) => `${n} invites expired.`,

  milestonesTitle: 'Invite milestones',
  milestonesDesc: 'Milestone bonuses unlock as your successful invites grow.',
  milestoneStop: (count) => `${count} invites`,
  stateClaimed: 'Claimed',
  stateClaimable: 'Ready',
  stateLocked: (n) => `${n} to go`,
  nextMilestone: (n, pts) => `${n} more successful invites → +${pts} points`,
  allMilestonesDone: 'You completed every milestone. Each new invite still earns points.',
  claim: (pts) => `Claim milestone reward (+${pts})`,
  claiming: 'Claiming…',
  claimedToast: (pts) => `Milestone reward added: +${pts} points.`,
  claimError: 'The milestone reward could not be claimed.',
  progressLabel: 'Next milestone',

  listTitle: 'People you invited',
  listDesc: 'Track which step your friend is on.',
  friend: 'Your friend',
  invitedOn: (d) => `Invited: ${d}`,
  statusCompleted: 'Completed',
  statusPending: 'Pending',
  statusExpired: 'Expired',
  stepJoined: 'Signed up',
  stepVerified: 'Verified email',
  stepFirstQr: 'First QR experience',
  stepDone: 'done',
  stepTodo: 'waiting',
  expiresOn: (d) => `Ends: ${d}`,
  earnedPoints: (pts) => `+${pts} points`,
  nudge: 'Remind',
  nudgeSent: 'Reminder sent.',
  nudgeNext: (d) => `Next reminder: ${d}`,
  nudgeNeedsVerify: 'Your friend must verify their email first; they will see the steps after signing in.',
  check: 'Check reward',
  checkQualified: (pts) => `Invite completed: +${pts} points.`,
  checkNotYet: 'The invite does not meet the completion rules yet.',
  actionError: 'The action could not be completed.',
  loadMore: 'Show more',
  loadingMore: 'Loading…',
  emptyTitle: "You haven't invited anyone yet",
  emptyDesc: 'Send your first invite; you will see each step here once your friend joins.',

  referredTitle: 'Your welcome bonus',
  referredBy: (name) => `${name} invited you.`,
  referredByAnon: 'A friend invited you.',
  referredPending: (pts) => `Complete your first QR experience to get +${pts} points.`,
  referredCompleted: (pts) => `Your welcome bonus was added: +${pts} points.`,
  referredExpired: 'Your invite expired; no welcome bonus was given.',
  scanCta: 'Scan QR',

  applyTitle: 'Have an invite code?',
  applyDesc: (d) => `You can enter a friend's code until ${d}.`,
  applyLabel: "Your friend's invite code",
  applyPlaceholder: 'e.g. 7KQ2M9XA',
  apply: 'Apply code',
  applying: 'Applying…',
  applyPending: 'Code saved. Your bonus arrives once you verify your email and complete your first QR experience.',
  applyCompleted: (pts) => `Congrats! Your welcome bonus was added: +${pts} points.`,

  rulesTitle: 'Rules and limits',
  ruleQualify: (days) =>
    `Rewards are given when your friend verifies their email and completes their first QR experience (feedback or card use) within ${days} days.`,
  ruleMonthly: (used, max, reset) => `${used}/${max} sign-ups with your code this month. Resets on ${reset}.`,
  ruleLifetime: (used, max) => `Total invite allowance: ${used}/${max} used.`,
  ruleCodeUsage: (used, max) => `Usage limit of this code: ${used}/${max}.`,
  ruleApplyWindow: (days) => `An invite code can be entered manually only within ${days} days after sign-up.`,
  ruleFair: 'Using your own code and mutual invites are not rewarded. Invites are open to customer accounts only.',
  ruleNudge: (hours) => `You can send a pending friend at most one reminder every ${hours} hours.`,
  usageMeter: (label) => `${label} usage`,

  errors: {
    WINDOW_EXPIRED: (days: number) => `An invite code can only be used within ${days} days after sign-up.`,
    MODULE_DISABLED: 'The invite program is currently closed.',
    INVALID_CODE: 'Enter a valid invite code.',
    VALIDATION: 'Enter a valid invite code.',
    CODE_NOT_FOUND: 'This invite code was not found. Check the letters.',
    CODE_INACTIVE: 'This invite code can no longer be used.',
    NOT_ELIGIBLE: 'The invite program is open to customer accounts only.',
    SELF_REFERRAL: "You can't use your own invite code.",
    ALREADY_REFERRED: 'You have already used an invite code.',
    RECIPROCAL: "You can't use the code of someone you invited.",
    LIFETIME_LIMIT: 'This invite code reached its invite limit.',
    MONTHLY_LIMIT: "This invite code reached this month's limit.",
    MAX_USAGE: 'This invite code reached its usage limit.',
    RATE_LIMITED: 'Too many attempts. Please try again shortly.',
    NOTHING_TO_CLAIM: 'There is no milestone reward to claim.',
    NOT_PENDING: 'This invite is no longer pending.',
    NOT_VERIFIED: 'Your friend must verify their email first.',
    RECENTLY_NUDGED: 'You reminded this friend recently.',
    NOT_QUALIFIED: 'The invite does not meet the completion rules yet.',
    NOT_FOUND: 'Invite not found.',
    SERVICE_UNAVAILABLE: 'The service is unavailable right now. Try again shortly.',
    OFFLINE: 'You seem to be offline.',
  },
};

export const INVITE_COPY: Record<InviteLocale, InviteCopy> = { tr: TR, en: EN };

export function useInviteCopy(): { copy: InviteCopy; locale: InviteLocale } {
  const locale = useDsLocale();
  return { copy: INVITE_COPY[locale], locale };
}

export function intlLocale(locale: InviteLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

export function formatPoints(n: number, locale: InviteLocale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(Math.max(0, Math.round(n)));
}

/** Tarih — İstanbul saat dilimiyle (sunucu/tarayıcı saatinden bağımsız). */
export function formatDay(iso: string, locale: InviteLocale): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}

export function formatDayTime(iso: string, locale: InviteLocale): string {
  return new Date(iso).toLocaleString(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

/** Sunucu hata kodunu kullanıcının dilinde metne çevirir. */
export function errorText(
  copy: InviteCopy,
  code: string | undefined,
  fallback: string,
  params: { applyWindowDays: number } = { applyWindowDays: 7 }
): string {
  const entry = code ? copy.errors[code] : undefined;
  if (typeof entry === 'function') return entry(params.applyWindowDays);
  if (typeof entry === 'string') return entry;
  return fallback;
}
