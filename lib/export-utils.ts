/**
 * QRATEX Export Utilities
 * CSV and PDF export helpers for analytics and feedback data
 */

/**
 * Export data as CSV file
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns?: { key: string; label: string }[]
) {
  if (!data || data.length === 0) return;

  // Determine columns
  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: key }));

  // Build CSV content
  const header = cols.map(c => `"${c.label}"`).join(',');
  const rows = data.map(row =>
    cols.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${val}"`;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const BOM = '\uFEFF'; // UTF-8 BOM for Turkish characters
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });

  // Download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data as PDF (using browser print)
 */
export function exportToPDF(
  title: string,
  content: string,
  filename?: string
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { font-size: 24px; margin-bottom: 8px; color: #6d28d9; }
        h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; color: #374151; }
        .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
        .date { color: #9ca3af; font-size: 12px; margin-bottom: 32px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
        td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
        tr:nth-child(even) { background: #f9fafb; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
        .stat-card { background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; }
        .stat-value { font-size: 28px; font-weight: 700; color: #6d28d9; }
        .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>📊 ${title}</h1>
      <p class="subtitle">QRATEX Platform Raporu</p>
      <p class="date">Oluşturma Tarihi: ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      ${content}
      <div class="footer">Bu rapor QRATEX platformu tarafından otomatik oluşturulmuştur.</div>
    </body>
    </html>
  `);

  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

/**
 * Generate PDF content for analytics data
 */
export function buildAnalyticsPDFContent(data: {
  totalFeedbacks: number;
  avgRating: string;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  topTopics?: { name: string; count: number }[];
  dailyData?: { date: string; feedbacks: number }[];
}): string {
  let html = '';

  // Stats grid
  html += `<div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${data.totalFeedbacks}</div><div class="stat-label">Toplam Geri Bildirim</div></div>
    <div class="stat-card"><div class="stat-value">${data.avgRating}</div><div class="stat-label">Ortalama Puan</div></div>
    ${data.sentimentBreakdown ? `
      <div class="stat-card"><div class="stat-value" style="color:#10b981">${data.sentimentBreakdown.positive}</div><div class="stat-label">Olumlu</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444">${data.sentimentBreakdown.negative}</div><div class="stat-label">Olumsuz</div></div>
    ` : ''}
  </div>`;

  // Top topics
  if (data.topTopics && data.topTopics.length > 0) {
    html += `<h2>En Çok Bahsedilen Konular</h2><table><tr><th>Konu</th><th>Sayı</th></tr>`;
    data.topTopics.forEach(t => {
      html += `<tr><td>${t.name}</td><td>${t.count}</td></tr>`;
    });
    html += '</table>';
  }

  return html;
}

/**
 * Generate feedback CSV columns
 */
export const feedbackCSVColumns = [
  { key: 'createdAt', label: 'Tarih' },
  { key: 'userName', label: 'Kullanıcı' },
  { key: 'rating', label: 'Puan' },
  { key: 'text', label: 'Yorum' },
  { key: 'sentiment', label: 'Duygu' },
  { key: 'qrName', label: 'QR Kod' },
  { key: 'dealerReply', label: 'İşletme Yanıtı' },
];
