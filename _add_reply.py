c = open('app/dealer/feedbacks/page.tsx', 'r', encoding='utf-8').read()

# 1. Add imports for reply dialog
c = c.replace(
    "  X,\n  QrCode,",
    "  X,\n  QrCode,\n  Reply,\n  Send,\n  Bot,\n  Loader2,\n  CheckCircle2,\n  Download,"
)
c = c.replace(
    "import { toast } from 'sonner';",
    """import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';"""
)

# 2. Add dealerReply to QRFeedback interface
c = c.replace(
    """  qrCode: {
    id: string;
    name: string;
    businessName: string;
  };
}""",
    """  qrCode: {
    id: string;
    name: string;
    businessName: string;
  };
  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
}"""
)

# 3. Add reply state after existing state declarations
c = c.replace(
    """  const [reviewStats, setReviewStats] = useState({
    totalReviews: 0,
    avgRating: '0',
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });""",
    """  const [reviewStats, setReviewStats] = useState({
    totalReviews: 0,
    avgRating: '0',
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });

  // Reply state
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyFeedbackId, setReplyFeedbackId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiSugLoading, setAiSugLoading] = useState(false);

  const openReplyDialog = (feedbackId: string) => {
    setReplyFeedbackId(feedbackId);
    setReplyText('');
    setAiSuggestions([]);
    setReplyDialogOpen(true);
  };

  const sendReply = async () => {
    if (!replyFeedbackId || !replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/dealer/feedbacks/${replyFeedbackId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Yanıt gönderildi!');
        setReplyDialogOpen(false);
        fetchAllFeedbacks();
      } else {
        toast.error(data.error || 'Yanıt gönderilemedi');
      }
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setReplySending(false);
    }
  };

  const getAISuggestions = async () => {
    if (!replyFeedbackId) return;
    setAiSugLoading(true);
    try {
      const res = await fetch(`/api/dealer/feedbacks/${replyFeedbackId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest' }),
      });
      const data = await res.json();
      if (data.success && data.suggestions) {
        setAiSuggestions(data.suggestions);
      }
    } catch {
      toast.error('AI önerileri alınamadı');
    } finally {
      setAiSugLoading(false);
    }
  };"""
)

# 4. Add reply button + dealer reply display after QR feedback topics section
old_qr_footer = """                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {feedback.topics.slice(0, 3).map((topic) => (
                                <Badge key={topic} variant="secondary" className="text-xs gap-1">
                                  <Tag className="h-3 w-3" />
                                  {topic}
                                </Badge>
                              ))}
                              {feedback.topics.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{feedback.topics.length - 3}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(feedback.createdAt)}
                            </span>
                          </div>"""

new_qr_footer = """                          {/* Dealer Reply */}
                          {feedback.dealerReply && (
                            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                              <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> İşletme Yanıtı
                              </p>
                              <p className="text-sm">{feedback.dealerReply}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {feedback.topics.slice(0, 3).map((topic) => (
                                <Badge key={topic} variant="secondary" className="text-xs gap-1">
                                  <Tag className="h-3 w-3" />
                                  {topic}
                                </Badge>
                              ))}
                              {feedback.topics.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{feedback.topics.length - 3}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(feedback.createdAt)}
                              </span>
                              {feedback.dealerReply ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Yanıtlandı
                                </Badge>
                              ) : (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openReplyDialog(feedback.id); }}>
                                  <Reply className="h-3 w-3 mr-1" /> Yanıt Ver
                                </Button>
                              )}
                            </div>
                          </div>"""

c = c.replace(old_qr_footer, new_qr_footer)

# 5. Add reply dialog before closing </div> of the page
c = c.replace(
    """    </div>
  );
}""",
    """      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5 text-primary" />
              Geri Bildirime Yanıt Ver
            </DialogTitle>
            <DialogDescription>
              Müşterinize profesyonel bir yanıt yazın
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Yanıtınızı buraya yazın..."
              rows={4}
            />
            
            {/* AI Suggestions */}
            <div>
              <Button variant="outline" size="sm" onClick={getAISuggestions} disabled={aiSugLoading} className="mb-2">
                {aiSugLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                AI Yanıt Önerisi
              </Button>
              {aiSuggestions.length > 0 && (
                <div className="space-y-2">
                  {aiSuggestions.map((sug, i) => (
                    <button key={i} onClick={() => setReplyText(sug)}
                      className="w-full text-left p-2.5 rounded-lg border bg-muted/50 hover:bg-muted text-sm transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>İptal</Button>
            <Button onClick={sendReply} disabled={replySending || !replyText.trim()}>
              {replySending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Yanıt Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}"""
)

open('app/dealer/feedbacks/page.tsx', 'w', encoding='utf-8').write(c)
print("Dealer feedbacks reply system added!")
