import { prisma } from '@/lib/prisma';

interface AutoReplyRuleCondition {
    field: 'rating' | 'sentiment' | 'text';
    op: 'lte' | 'gte' | 'eq' | 'contains';
    value: string | number;
}

export async function processAutoReplies(feedbackId: string) {
    try {
        const feedback = await prisma.feedback.findUnique({
            where: { id: feedbackId },
            include: { qrCode: true }
        });

        if (!feedback || !feedback.qrCode) return;

        const dealerId = feedback.qrCode.dealerId;

        const rules = await prisma.autoReplyRule.findMany({
            where: { dealerId, isActive: true },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
        });

        if (rules.length === 0) return;

        let ruleApplied = false;

        for (const rule of (rules as any[])) {
            if (ruleApplied) break;

            const condition = rule.condition as unknown as AutoReplyRuleCondition;
            let isMatch = false;

            if (condition.field === 'rating' && feedback.rating !== null) {
                const val = Number(condition.value);
                if (condition.op === 'lte') isMatch = feedback.rating <= val;
                else if (condition.op === 'gte') isMatch = feedback.rating >= val;
                else if (condition.op === 'eq') isMatch = feedback.rating === val;
            } else if (condition.field === 'sentiment' && feedback.sentiment) {
                if (condition.op === 'eq') isMatch = feedback.sentiment.toLowerCase() === String(condition.value).toLowerCase();
            } else if (condition.field === 'text' && feedback.text) {
                if (condition.op === 'contains') isMatch = feedback.text.toLowerCase().includes(String(condition.value).toLowerCase());
            }

            if (isMatch) {
                if (rule.action === 'reply') {
                    let finalReply = rule.template;

                    // Eğer tone varsa AI ile yanıt üret
                    if (rule.tone) {
                        const { generateAutoReply } = await import('@/lib/ai-engine');
                        const aiReply = await generateAutoReply(
                            feedback.text || "",
                            feedback.rating || 5,
                            rule.tone,
                            dealerId
                        );
                        if (aiReply) {
                            finalReply = aiReply;
                        }
                    }

                    // Update feedback with auto-reply
                    await prisma.feedback.update({
                        where: { id: feedback.id },
                        data: {
                            dealerReply: finalReply,
                            dealerRepliedAt: new Date()
                        }
                    });

                    // If customer was logged in, notify them
                    if (feedback.userId) {
                        await prisma.notification.create({
                            data: {
                                userId: feedback.userId,
                                title: "Geri bildiriminize yanıt var",
                                message: "İşletme geri bildiriminize yanıt verdi.",
                                type: "info"
                            }
                        });
                    }

                } else if (rule.action === 'incident') {
                    await prisma.incident.create({
                        data: {
                            dealerId: dealerId,
                            title: `Otomatik Kural İhlali: ${rule.name}`,
                            description: `[Sistem] Kural tetiklendi: ${rule.template}\n\nMüşteri Puanı: ${feedback.rating}\nYorum: ${feedback.text || '-'}`,
                            severity: feedback.rating && feedback.rating <= 2 ? 'high' : 'medium',
                            status: 'open',
                            type: 'FEEDBACK',
                            metadata: { feedbackId: feedback.id, ruleId: rule.id }
                        }
                    });
                }

                ruleApplied = true; // Sadece en yüksek öncelikli / ilk eşleşen kural çalışır
            }
        }
    } catch (error) {
        console.error('Error processing auto-replies:', error);
    }
}
