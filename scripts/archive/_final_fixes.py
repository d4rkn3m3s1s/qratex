
# ═══ 1. Reply Modal - better UI + better AI ═══
c = open('app/dealer/feedbacks/page.tsx', 'r', encoding='utf-8').read()

old_dialog = """      {/* Reply Dialog */}
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
      </Dialog>"""

new_dialog = """      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-primary/10">
                <Reply className="h-5 w-5 text-primary" />
              </div>
              {replyType === 'review' ? 'Tüketim Yorumuna Yanıt' : 'Geri Bildirime Yanıt'}
            </DialogTitle>
            <DialogDescription>
              Müşterinize profesyonel ve samimi bir yanıt yazın. AI ile otomatik öneri alabilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* AI Quick Suggestions */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 via-purple-500/5 to-fuchsia-500/5 border border-violet-500/20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500" />
                  AI Yanıt Önerisi
                </p>
                <Button variant="outline" size="sm" onClick={getAISuggestions} disabled={aiSugLoading} className="h-7 text-xs">
                  {aiSugLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {aiSuggestions.length > 0 ? 'Yenile' : 'Öneri Al'}
                </Button>
              </div>
              {aiSugLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  AI düşünüyor...
                </div>
              )}
              {aiSuggestions.length > 0 && (
                <div className="space-y-2">
                  {aiSuggestions.map((sug, i) => (
                    <button key={i} onClick={() => setReplyText(sug)}
                      className="w-full text-left p-3 rounded-lg border border-violet-500/20 bg-card hover:bg-violet-500/5 hover:border-violet-500/40 text-sm transition-all group"
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-violet-500/10 flex items-center justify-center text-[10px] font-bold text-violet-500 shrink-0 mt-0.5">{i + 1}</span>
                        <span className="flex-1">{sug}</span>
                      </div>
                      <span className="text-[10px] text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1 block">Tıkla kullan</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reply Text */}
            <div>
              <label className="text-sm font-medium mb-2 block">Yanıtınız</label>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Değerli müşterimiz, geri bildiriminiz için teşekkür ederiz..."
                rows={5}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">{replyText.length}/2000</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>İptal</Button>
            <Button onClick={sendReply} disabled={replySending || !replyText.trim()} className="bg-gradient-to-r from-violet-500 to-purple-600 text-white">
              {replySending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Yanıt Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>"""

if old_dialog in c:
    c = c.replace(old_dialog, new_dialog)
    print("1. Reply modal upgraded!")
else:
    print("ERROR: Reply dialog not found")

# Add Sparkles import if not there
if "  Sparkles," not in c:
    c = c.replace("  Send,", "  Send,\n  Sparkles,")

open('app/dealer/feedbacks/page.tsx', 'w', encoding='utf-8').write(c)

# ═══ 2. QR Code - Add frame templates ═══
c2 = open('app/dealer/qr-codes/page.tsx', 'r', encoding='utf-8').read()

# Add frame template state after qrBgColor
c2 = c2.replace(
    "  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');",
    """  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [qrFrame, setQrFrame] = useState<'none' | 'rounded' | 'circle' | 'branded'>('none');

  const frameStyles: Record<string, string> = {
    none: '',
    rounded: 'rounded-2xl border-4 border-primary p-4',
    circle: 'rounded-full border-4 border-violet-500 p-6',
    branded: 'rounded-2xl border-4 border-amber-500 p-4 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950 dark:to-slate-900',
  };"""
)

# Add quick color presets after the color pickers
c2 = c2.replace(
    """                  </div>
                </div>

                {/* Info & Actions */}""",
    """                  </div>
                  {/* Quick Color Presets */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">Hazır:</span>
                    {[
                      { fg: '#000000', bg: '#FFFFFF', label: 'Klasik' },
                      { fg: '#6d28d9', bg: '#f5f3ff', label: 'Mor' },
                      { fg: '#0369a1', bg: '#f0f9ff', label: 'Mavi' },
                      { fg: '#b91c1c', bg: '#fef2f2', label: 'Kırmızı' },
                      { fg: '#FFFFFF', bg: '#000000', label: 'Ters' },
                    ].map((preset) => (
                      <button key={preset.label} onClick={async () => {
                        setQrFgColor(preset.fg);
                        setQrBgColor(preset.bg);
                        if (selectedQR) {
                          const url = `${window.location.origin}/feedback/${selectedQR.code}`;
                          const preview = await QRCodeLib.toDataURL(url, { width: 400, margin: 2, color: { dark: preset.fg, light: preset.bg } });
                          setQrPreview(preview);
                        }
                      }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium hover:bg-muted transition-colors"
                        title={preset.label}
                      >
                        <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: preset.fg }} />
                        <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: preset.bg }} />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info & Actions */}"""
)

open('app/dealer/qr-codes/page.tsx', 'w', encoding='utf-8').write(c2)
print("2. QR code presets added!")

# ═══ 3. Dark/Light - Fix remaining bg-black/20 ═══
for filepath in ['app/dealer/qr-codes/page.tsx', 'app/dealer/page.tsx', 'app/dealer/ai-insights/page.tsx']:
    try:
        c3 = open(filepath, 'r', encoding='utf-8').read()
        if 'bg-black/20 rounded-full blur-3xl' in c3:
            c3 = c3.replace(
                'bg-black/20 rounded-full blur-3xl',
                'bg-primary/10 dark:bg-black/20 rounded-full blur-3xl'
            )
            open(filepath, 'w', encoding='utf-8').write(c3)
            print(f"3. Fixed: {filepath}")
    except Exception as e:
        print(f"3. Error: {filepath} - {e}")

print("All fixes done!")
