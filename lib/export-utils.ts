/**
 * QRATEX Export Utilities
 * CSV and PDF export helpers for analytics and feedback data
 * Satır limiti: 10.000; watermark: userId + timestamp
 */

import { BRAND_INK_HEX, BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import { CHART_HEX } from '@/lib/chart-palette';

/** Basılı PDF şablonu — Tailwind gri paleti (tekrarlar tek sabitte) */
const PDF_GRAY = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e5e7eb',
  400: '#9ca3af',
  700: '#374151',
} as const;

const PDF_PRINT = {
  body: BRAND_INK_HEX,
  h2: PDF_GRAY[700],
  muted: CHART_HEX.neutral,
  dateMuted: PDF_GRAY[400],
  thBg: PDF_GRAY[100],
  border: PDF_GRAY[200],
  cellBorder: PDF_GRAY[100],
  rowAlt: PDF_GRAY[50],
  statCardBg: PDF_GRAY[100],
  footer: PDF_GRAY[400],
} as const;

export const EXPORT_ROW_LIMIT = 10_000;

export type ExportOptions = {
  maxRows?: number;
  watermark?: { userId: string; timestamp: string };
};

/**
 * Export data as CSV file (satır limiti, watermark)
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns?: { key: string; label: string }[],
  options?: ExportOptions
) {
  if (!data || data.length === 0) return;
  const maxRows = options?.maxRows ?? EXPORT_ROW_LIMIT;
  const limited = data.slice(0, maxRows);

  // Determine columns
  const cols = columns || Object.keys(limited[0]).map(key => ({ key, label: key }));

  // Build CSV content
  const header = cols.map(c => `"${c.label}"`).join(',');
  const rows = limited.map(row =>
    cols.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${val}"`;
    }).join(',')
  );

  let csv = [header, ...rows].join('\n');
  if (options?.watermark) {
    csv += `\n"#QRATEX Export","${options.watermark.userId}","${options.watermark.timestamp}"`;
  }
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

/** Escape for safe use inside HTML (prevents XSS if title/content come from user data). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const safeTitle = escapeHtml(title);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${safeTitle}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: ${PDF_PRINT.body}; }
        h1 { font-size: 24px; margin-bottom: 8px; color: ${BRAND_PRIMARY_HEX}; }
        h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; color: ${PDF_PRINT.h2}; }
        .subtitle { color: ${PDF_PRINT.muted}; font-size: 14px; margin-bottom: 24px; }
        .date { color: ${PDF_PRINT.dateMuted}; font-size: 12px; margin-bottom: 32px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: ${PDF_PRINT.thBg}; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid ${PDF_PRINT.border}; }
        td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid ${PDF_PRINT.cellBorder}; }
        tr:nth-child(even) { background: ${PDF_PRINT.rowAlt}; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
        .stat-card { background: ${PDF_PRINT.statCardBg}; border-radius: 8px; padding: 16px; text-align: center; }
        .stat-value { font-size: 28px; font-weight: 700; color: ${BRAND_PRIMARY_HEX}; }
        .stat-label { font-size: 12px; color: ${PDF_PRINT.muted}; margin-top: 4px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid ${PDF_PRINT.border}; font-size: 11px; color: ${PDF_PRINT.footer}; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>📊 ${safeTitle}</h1>
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

  // Stats grid (escape dynamic values for XSS safety)
  html += `<div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${escapeHtml(String(data.totalFeedbacks))}</div><div class="stat-label">Toplam Geri Bildirim</div></div>
    <div class="stat-card"><div class="stat-value">${escapeHtml(String(data.avgRating))}</div><div class="stat-label">Ortalama Puan</div></div>
    ${data.sentimentBreakdown ? `
      <div class="stat-card"><div class="stat-value" style="color:${CHART_HEX.emerald}">${escapeHtml(String(data.sentimentBreakdown.positive))}</div><div class="stat-label">Olumlu</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${CHART_HEX.red}">${escapeHtml(String(data.sentimentBreakdown.negative))}</div><div class="stat-label">Olumsuz</div></div>
    ` : ''}
  </div>`;

  // Top topics
  if (data.topTopics && data.topTopics.length > 0) {
    html += `<h2>En Çok Bahsedilen Konular</h2><table><tr><th>Konu</th><th>Sayı</th></tr>`;
    data.topTopics.forEach(t => {
      html += `<tr><td>${escapeHtml(String(t.name))}</td><td>${escapeHtml(String(t.count))}</td></tr>`;
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

export type FeedbackExportRow = {
  createdAt: string;
  userName: string;
  rating: number;
  text: string;
  sentiment: string;
  qrName: string;
  dealerReply: string;
};

/**
 * Build HTML table content for feedback list PDF export
 */
export function buildFeedbackListPDFContent(rows: FeedbackExportRow[]): string {
  if (rows.length === 0) return '<p>Geri bildirim bulunamadı.</p>';
  let html = '<h2>Geri Bildirim Listesi</h2><table><tr><th>Tarih</th><th>Kullanıcı</th><th>Puan</th><th>Yorum</th><th>Duygu</th><th>QR/Ürün</th><th>İşletme Yanıtı</th></tr>';
  rows.slice(0, EXPORT_ROW_LIMIT).forEach((r) => {
    html += `<tr>
      <td>${escapeHtml(r.createdAt)}</td>
      <td>${escapeHtml(r.userName)}</td>
      <td>${escapeHtml(String(r.rating))}</td>
      <td>${escapeHtml((r.text || '').slice(0, 200))}</td>
      <td>${escapeHtml(r.sentiment)}</td>
      <td>${escapeHtml(r.qrName)}</td>
      <td>${escapeHtml((r.dealerReply || '').slice(0, 150))}</td>
    </tr>`;
  });
  html += '</table>';
  if (rows.length > EXPORT_ROW_LIMIT) {
    html += `<p class="subtitle">İlk ${EXPORT_ROW_LIMIT} kayıt gösteriliyor.</p>`;
  }
  return html;
}
