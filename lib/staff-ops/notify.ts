/**
 * Ekip operasyonu bildirimleri (uygulama içi; kullanıcının bildirim tercihine saygılı).
 * Hata akışı bozmaz — bildirim düşerse iş kaydı yine yazılmıştır.
 */
import { notifyRespectingPrefs } from '@/lib/notify-prefs-server';

function clip(s: string, n = 140): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function notifyStaffTaskAssigned(staffUserId: string, title: string): Promise<void> {
  return notifyRespectingPrefs({
    userId: staffUserId,
    title: 'Yeni görev',
    message: clip(title),
    type: 'info',
    data: { kind: 'staff_task_assigned', ctaPath: '/staff' },
  });
}

export function notifyStaffLeaveDecision(staffUserId: string, approved: boolean, range: string): Promise<void> {
  return notifyRespectingPrefs({
    userId: staffUserId,
    title: approved ? 'İzin talebiniz onaylandı' : 'İzin talebiniz reddedildi',
    message: range,
    type: approved ? 'success' : 'warning',
    data: { kind: 'staff_leave_decision', ctaPath: '/staff#izin' },
  });
}

export function notifyStaffShiftPlanned(staffUserId: string, text: string): Promise<void> {
  return notifyRespectingPrefs({
    userId: staffUserId,
    title: 'Vardiya planınız güncellendi',
    message: clip(text),
    type: 'info',
    data: { kind: 'staff_shift_planned', ctaPath: '/staff#takvim' },
  });
}

export function notifyStaffFieldReportUpdate(staffUserId: string, resolved: boolean): Promise<void> {
  return notifyRespectingPrefs({
    userId: staffUserId,
    title: resolved ? 'Saha bildiriminiz çözüldü' : 'Saha bildiriminiz görüldü',
    message: resolved ? 'Yöneticiniz bildirdiğiniz durumu çözüldü olarak işaretledi.' : 'Yöneticiniz bildiriminizi gördü.',
    type: 'info',
    data: { kind: 'staff_field_report', ctaPath: '/staff#bildirimlerim' },
  });
}

export function notifyDealerTaskCompleted(dealerId: string, staffName: string | null, title: string): Promise<void> {
  return notifyRespectingPrefs({
    userId: dealerId,
    title: 'Görev tamamlandı',
    message: clip(`${staffName ?? 'Personel'}: ${title}`),
    type: 'success',
    data: { kind: 'staff_task_completed', ctaPath: '/dealer/team?tab=gorevler' },
  });
}

export function notifyDealerLeaveRequested(dealerId: string, staffName: string | null, range: string): Promise<void> {
  return notifyRespectingPrefs({
    userId: dealerId,
    title: 'Yeni izin talebi',
    message: clip(`${staffName ?? 'Personel'} · ${range}`),
    type: 'info',
    data: { kind: 'staff_leave_requested', ctaPath: '/dealer/team?tab=onaylar' },
  });
}

export function notifyDealerFieldReport(dealerId: string, staffName: string | null, label: string, urgent: boolean): Promise<void> {
  return notifyRespectingPrefs({
    userId: dealerId,
    title: urgent ? 'Acil saha bildirimi' : 'Yeni saha bildirimi',
    message: clip(`${staffName ?? 'Personel'} · ${label}`),
    type: urgent ? 'warning' : 'info',
    data: { kind: 'staff_field_report', ctaPath: '/dealer/team?tab=saha' },
  });
}
