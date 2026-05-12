/**
 * Win-back teklif kimlikleri ve müşteri bildirimine giren (TR) metin parçaları.
 * Yeni seçenek: bu diziye id ekleyin, WIN_BACK_OFFER_MESSAGE_TR'ye aynı id ile metin yazın,
 * messages/en.json & tr.json içinde dealerRadar.winBackOfferOptions.<id> ekleyin.
 */
export const WIN_BACK_OFFER_IDS = [
    'free_coffee',
    '5x_points',
    'dessert_on_us',
    'happy_hour_invite',
    'percent_10_next_visit',
] as const;

export type WinBackOfferId = (typeof WIN_BACK_OFFER_IDS)[number];

const OFFER_ID_SET = new Set<string>(WIN_BACK_OFFER_IDS);

/** Müşteri bildirimi gövdesine eklenen teklif cümlesi (şu an API tarafında TR). */
export const WIN_BACK_OFFER_MESSAGE_TR: Record<WinBackOfferId, string> = {
    free_coffee: 'Bir içecek bizden hediye!',
    '5x_points': 'Bugün tüm harcamalarda 5X Puan!',
    dessert_on_us: 'Tatlı ikramımız sizin için!',
    happy_hour_invite: 'Happy hour saatlerinde sizi özel fiyatlarla ağırlamak istiyoruz.',
    percent_10_next_visit: 'Bir sonraki ziyaretinizde %10 indirim sizi bekliyor!',
};

export const DEFAULT_WIN_BACK_OFFER_ID: WinBackOfferId = 'free_coffee';

export function isWinBackOfferId(value: string): value is WinBackOfferId {
    return OFFER_ID_SET.has(value);
}

export function getWinBackOfferMessageTr(id: WinBackOfferId): string {
    return WIN_BACK_OFFER_MESSAGE_TR[id];
}
