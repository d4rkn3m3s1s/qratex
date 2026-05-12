/**
 * Next best action (P0 item 3).
 * Her dashboard kartı için uygulanabilir 1 adım üretir.
 */

export interface NextBestAction {
  cardKey: string;
  label: string;
  href: string;
  priority: number;
}

export function buildNextBestActions(context: {
  totalQRCodes: number;
  totalFeedbacks: number;
  negativeCount: number;
  pendingActionCount: number;
  highChurnCount: number;
  lowestRatedQrId?: string;
}): NextBestAction[] {
  const actions: NextBestAction[] = [];

  if (context.totalQRCodes === 0) {
    actions.push({
      cardKey: 'qr',
      label: 'İlk QR kodunu oluştur',
      href: '/dealer/qr-codes',
      priority: 10,
    });
  } else if (context.negativeCount > 0) {
    if (context.lowestRatedQrId) {
      actions.push({
        cardKey: 'negative',
        label: 'En düşük puanlı QR için telafi gönder',
        href: '/dealer/feedbacks?tab=qr',
        priority: 9,
      });
    } else {
      actions.push({
        cardKey: 'negative',
        label: 'Negatif geri bildirimlere telafi gönder',
        href: '/dealer/feedbacks?tab=qr',
        priority: 9,
      });
    }
  }

  if (context.highChurnCount > 0) {
    actions.push({
      cardKey: 'churn',
      label: 'Yüksek riskli müşterilere kampanya başlat',
      href: '/dealer/campaigns',
      priority: 8,
    });
  }

  if (context.pendingActionCount > 0) {
    actions.push({
      cardKey: 'action',
      label: `Bekleyen ${context.pendingActionCount} aksiyondan birini tamamla`,
      href: '/dealer/action-items',
      priority: 7,
    });
  }

  if (context.totalQRCodes > 0 && context.totalFeedbacks === 0) {
    actions.push({
      cardKey: 'engagement',
      label: 'QR kodlarınızı müşterilere tanıtın',
      href: '/dealer/qr-codes',
      priority: 6,
    });
  }

  return actions.sort((a, b) => b.priority - a.priority);
}
