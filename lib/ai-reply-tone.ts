/**
 * Mock / ön-yanıt üretiminde ton seçimi: puan + yorum metni + (QR'da) sentiment.
 * Yüksek puan + olumsuz metin ("berbat" vb.) → asla coşkulu teşekkür şablonu kullanılmaz.
 */

export type ReplyToneInput = {
    rating: number;
    /** Tüketim yorumu veya QR geri bildirimi metni */
    reviewText: string | null | undefined;
    /** Yalnızca Feedback modelinde; negative ise telafi tonu */
    feedbackSentiment?: string | null;
    /** Feedback.intent — şikâyet ise telafi */
    feedbackIntent?: string | null;
};

/** Metinde geçen güçlü olumsuz işaretler (TR + EN) — kısa liste, genişletilebilir */
const NEGATIVE_PHRASES: readonly string[] = [
    'berbat',
    'berbat bir',
    'berbatı',
    'kötü',
    'çok kötü',
    'rezalet',
    'iğrenç',
    'vasat',
    'şikayet',
    'şikâyet',
    'memnun değil',
    'memnun değilim',
    'beğenmedim',
    'beğenmedik',
    'hiç beğenmedim',
    'hayal kırıklığı',
    'hayal kırıklığına',
    'asla gelmem',
    'bir daha asla',
    'tavsiye etmem',
    'kesinlikle gelmem',
    'param boşa',
    'param boşa gitti',
    'para wasted',
    'pişmanım',
    'çok pişman',
    'müşteri memnuniyeti yok',
    'ilgisiz',
    'kaba',
    'saygısız',
    'hijyen',
    'kötü kok',
    'soğuk servis',
    'terrible',
    'awful',
    'horrible',
    'disgusting',
    'worst',
    'never again',
    'waste of money',
    'disappointed',
    'disappointing',
    'complaint',
    'unacceptable',
];

function normalizeForScan(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

/**
 * Telafi / özür tonu gerekli mi? (Coşkulu teşekkür yerine)
 */
export function shouldUseRecoveryTone(input: ReplyToneInput): boolean {
    const { rating, reviewText, feedbackSentiment, feedbackIntent } = input;

    if (feedbackSentiment === 'negative') return true;
    if (feedbackIntent === 'complaint') return true;

    if (rating <= 3) return true;

    const raw = (reviewText || '').trim();
    if (!raw) {
        return false;
    }

    const n = normalizeForScan(raw);
    for (const phrase of NEGATIVE_PHRASES) {
        if (n.includes(normalizeForScan(phrase))) {
            return true;
        }
    }

    return false;
}

export type MockReplyBucket = 'recovery' | 'mild_positive' | 'strong_positive';

export function getMockReplyBucket(rating: number, input: Omit<ReplyToneInput, 'rating'>): MockReplyBucket {
    if (shouldUseRecoveryTone({ rating, ...input })) {
        return 'recovery';
    }
    if (rating <= 4) {
        return 'mild_positive';
    }
    return 'strong_positive';
}
