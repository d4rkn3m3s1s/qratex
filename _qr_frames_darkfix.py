
# ═══ 1. QR Frames - Add frame template selector ═══
c = open('app/dealer/qr-codes/page.tsx', 'r', encoding='utf-8').read()

# Add frame state
c = c.replace(
    "  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');",
    """  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [qrFrame, setQrFrame] = useState<'none' | 'rounded' | 'circle' | 'badge'>('none');"""
)

# Add frame templates UI after color presets, before Info & Actions
old_before_info = """                </div>

                {/* Info & Actions */}
                <CardContent className="p-6 space-y-4 bg-card">"""

new_with_frames = """                  {/* Frame Templates */}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Çerçeve Şablonu</p>
                    <div className="flex gap-2">
                      {[
                        { id: 'none', label: 'Yok', style: 'border-0' },
                        { id: 'rounded', label: 'Yumuşak', style: 'border-4 border-primary rounded-2xl' },
                        { id: 'circle', label: 'Daire', style: 'border-4 border-amber-500 rounded-full' },
                        { id: 'badge', label: 'Rozet', style: 'border-[6px] border-double border-emerald-500 rounded-xl' },
                      ].map((frame) => (
                        <button key={frame.id} onClick={() => setQrFrame(frame.id as any)}
                          className={`flex-1 p-2 rounded-lg border-2 text-center text-[10px] font-medium transition-all ${qrFrame === frame.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                        >
                          <div className={`w-10 h-10 mx-auto mb-1 bg-muted/50 ${frame.style}`} />
                          {frame.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Info & Actions */}
                <CardContent className="p-6 space-y-4 bg-card">"""

c = c.replace(old_before_info, new_with_frames)

# Update QR preview to use frame
c = c.replace(
    'className="rounded-xl shadow-lg max-w-[250px]"',
    'className={`shadow-lg max-w-[250px] ${qrFrame === "rounded" ? "border-4 border-primary rounded-2xl" : qrFrame === "circle" ? "border-4 border-amber-500 rounded-full" : qrFrame === "badge" ? "border-[6px] border-double border-emerald-500 rounded-xl" : "rounded-xl"}`}'
)

open('app/dealer/qr-codes/page.tsx', 'w', encoding='utf-8').write(c)
print("1. QR frame templates added!")

# ═══ 2. Dark mode fixes - 4 files ═══

# Fix c/[token]/page.tsx
try:
    c2 = open('app/c/[token]/page.tsx', 'r', encoding='utf-8').read()
    c2 = c2.replace('bg-slate-900/50 backdrop-blur-xl', 'bg-card/80 backdrop-blur-xl')
    open('app/c/[token]/page.tsx', 'w', encoding='utf-8').write(c2)
    print("2. app/c/[token]/page.tsx dark mode fixed")
except:
    print("2. SKIP: c/[token]/page.tsx")

# Fix dealer/scan/page.tsx
try:
    c3 = open('app/dealer/scan/page.tsx', 'r', encoding='utf-8').read()
    c3 = c3.replace('bg-slate-900 rounded-xl', 'bg-muted dark:bg-slate-900 rounded-xl')
    open('app/dealer/scan/page.tsx', 'w', encoding='utf-8').write(c3)
    print("3. app/dealer/scan/page.tsx dark mode fixed")
except:
    print("3. SKIP: dealer/scan/page.tsx")

print("Done!")
