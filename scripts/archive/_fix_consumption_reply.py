c = open('app/dealer/feedbacks/page.tsx', 'r', encoding='utf-8').read()

# 1. Add dealerReply to ConsumptionReview interface
c = c.replace(
    """  consumption: {
    id: string;
    amount: number | null;
    createdAt: string;
    product: {""",
    """  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
  consumption: {
    id: string;
    amount: number | null;
    createdAt: string;
    product: {"""
)

# 2. Add replyType state
c = c.replace(
    "  const [replyFeedbackId, setReplyFeedbackId] = useState<string | null>(null);",
    "  const [replyFeedbackId, setReplyFeedbackId] = useState<string | null>(null);\n  const [replyType, setReplyType] = useState<'feedback' | 'review'>('feedback');"
)

# 3. Update openReplyDialog to accept type
c = c.replace(
    """  const openReplyDialog = (feedbackId: string) => {
    setReplyFeedbackId(feedbackId);
    setReplyText('');
    setAiSuggestions([]);
    setReplyDialogOpen(true);
  };""",
    """  const openReplyDialog = (feedbackId: string, type: 'feedback' | 'review' = 'feedback') => {
    setReplyFeedbackId(feedbackId);
    setReplyType(type);
    setReplyText('');
    setAiSuggestions([]);
    setReplyDialogOpen(true);
  };"""
)

# 4. Update sendReply to include type
c = c.replace(
    "        body: JSON.stringify({ reply: replyText.trim() }),",
    "        body: JSON.stringify({ reply: replyText.trim(), type: replyType }),"
)

# 5. Update getAISuggestions to include type
c = c.replace(
    "        body: JSON.stringify({ action: 'suggest' }),",
    "        body: JSON.stringify({ action: 'suggest', type: replyType }),"
)

# 6. Add reply button + dealer reply display to consumption reviews
# Find the consumption footer area and add reply functionality
old_consumption_footer = """                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs gap-1">
                                <CreditCard className="h-3 w-3" />
                                •••{review.consumption.card.token.slice(-4)}
                              </Badge>
                              {review.consumption.amount && (
                                <Badge variant="secondary" className="text-xs">
                                  {formatCurrency(review.consumption.amount)}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(review.createdAt)}
                            </span>
                          </div>"""

new_consumption_footer = """                          {/* Dealer Reply */}
                          {review.dealerReply && (
                            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                              <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> İşletme Yanıtı
                              </p>
                              <p className="text-sm">{review.dealerReply}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs gap-1">
                                <CreditCard className="h-3 w-3" />
                                •••{review.consumption.card.token.slice(-4)}
                              </Badge>
                              {review.consumption.amount && (
                                <Badge variant="secondary" className="text-xs">
                                  {formatCurrency(review.consumption.amount)}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(review.createdAt)}
                              </span>
                              {review.dealerReply ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Yanıtlandı
                                </Badge>
                              ) : (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openReplyDialog(review.id, 'review'); }}>
                                  <Reply className="h-3 w-3 mr-1" /> Yanıt Ver
                                </Button>
                              )}
                            </div>
                          </div>"""

if old_consumption_footer in c:
    c = c.replace(old_consumption_footer, new_consumption_footer)
    print("Consumption review reply button added!")
else:
    print("ERROR: Consumption footer pattern not found")

open('app/dealer/feedbacks/page.tsx', 'w', encoding='utf-8').write(c)
print("Done!")
