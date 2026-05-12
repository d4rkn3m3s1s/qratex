import { getMockReplyBucket, shouldUseRecoveryTone } from '@/lib/ai-reply-tone';

describe('ai-reply-tone', () => {
    it('low rating always recovery', () => {
        expect(shouldUseRecoveryTone({ rating: 3, reviewText: null })).toBe(true);
        expect(getMockReplyBucket(2, { reviewText: 'Harika' })).toBe('recovery');
    });

    it('high rating + negative wording uses recovery (no false praise)', () => {
        expect(
            shouldUseRecoveryTone({
                rating: 5,
                reviewText: 'Çok berbat bir kolaydı, bir daha gelmem',
            })
        ).toBe(true);
        expect(getMockReplyBucket(5, { reviewText: 'berbat' })).toBe('recovery');
    });

    it('feedback sentiment negative forces recovery', () => {
        expect(shouldUseRecoveryTone({ rating: 5, reviewText: null, feedbackSentiment: 'negative' })).toBe(true);
    });

    it('feedback intent complaint forces recovery', () => {
        expect(shouldUseRecoveryTone({ rating: 5, reviewText: null, feedbackIntent: 'complaint' })).toBe(true);
    });

    it('high rating + praise uses strong positive', () => {
        expect(
            shouldUseRecoveryTone({
                rating: 5,
                reviewText: 'Harika bir deneyimdi, teşekkürler',
            })
        ).toBe(false);
        expect(getMockReplyBucket(5, { reviewText: 'Harika bir deneyimdi' })).toBe('strong_positive');
    });

    it('rating 4 without negative uses mild positive', () => {
        expect(getMockReplyBucket(4, { reviewText: null })).toBe('mild_positive');
    });
});
