
# ═══ 1. Dealer Analytics - Add export buttons ═══
c = open('app/dealer/analytics/page.tsx', 'r', encoding='utf-8').read()

# Add import
c = c.replace(
    "import { toast } from 'sonner';",
    """import { toast } from 'sonner';
import { exportToCSV, exportToPDF, buildAnalyticsPDFContent } from '@/lib/export-utils';"""
)

# Add Download icon import
if 'Download' not in c:
    c = c.replace(
        "  Loader2,",
        "  Loader2,\n  Download,\n  FileDown,"
    )

# Find the period selector area and add export buttons next to it
c = c.replace(
    """<Button asChild variant="outline" size="sm">
                  <Link href="/dealer/ai-insights">
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI İçgörüler
                  </Link>
                </Button>""",
    """<Button asChild variant="outline" size="sm">
                  <Link href="/dealer/ai-insights">
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI İçgörüler
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  if (!data) return;
                  exportToCSV(
                    data.dailyData.map(d => ({ tarih: d.label, geri_bildirim: d.feedbacks, ort_puan: d.avgRating, olumlu: d.positive, olumsuz: d.negative })),
                    'analitik_rapor'
                  );
                  toast.success('CSV indirildi!');
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  if (!data) return;
                  exportToPDF('Analitik Raporu', buildAnalyticsPDFContent({
                    totalFeedbacks: data.totalFeedbacks,
                    avgRating: data.avgRating,
                    sentimentBreakdown: data.sentimentBreakdown,
                    topTopics: data.topTopics.map(t => ({ name: t.name, count: t.count })),
                  }));
                }}>
                  <FileDown className="w-4 h-4 mr-2" />
                  PDF
                </Button>"""
)

open('app/dealer/analytics/page.tsx', 'w', encoding='utf-8').write(c)
print("1. Dealer analytics: export buttons added")

# ═══ 2. Dealer Feedbacks - Add CSV export ═══
c2 = open('app/dealer/feedbacks/page.tsx', 'r', encoding='utf-8').read()

# Add import
if 'export-utils' not in c2:
    c2 = c2.replace(
        "import { toast } from 'sonner';",
        """import { toast } from 'sonner';
import { exportToCSV, feedbackCSVColumns } from '@/lib/export-utils';"""
    )

# Add export button in the hero area
c2 = c2.replace(
    """<div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white">
                <span className="text-2xl font-bold">{totalFeedbacks}</span>
                <span className="text-white/70 text-sm ml-2">Toplam</span>
              </div>""",
    """<div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white">
                <span className="text-2xl font-bold">{totalFeedbacks}</span>
                <span className="text-white/70 text-sm ml-2">Toplam</span>
              </div>
              <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20" onClick={() => {
                const allData = [
                  ...qrFeedbacks.map(f => ({
                    createdAt: new Date(f.createdAt).toLocaleDateString('tr-TR'),
                    userName: f.user?.name || 'Anonim',
                    rating: f.rating,
                    text: f.text || '',
                    sentiment: f.sentiment || '',
                    qrName: f.qrCode.name,
                    dealerReply: (f as any).dealerReply || '',
                  })),
                ];
                exportToCSV(allData, 'geri_bildirimler', feedbackCSVColumns);
                toast.success('CSV indirildi!');
              }}>
                <Download className="w-4 h-4 mr-2" />
                CSV İndir
              </Button>"""
)

open('app/dealer/feedbacks/page.tsx', 'w', encoding='utf-8').write(c2)
print("2. Dealer feedbacks: CSV export added")

print("Done!")
