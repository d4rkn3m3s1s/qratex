/**
 * Sparkline geometrisi — saf (Jest ile test edilir). `null` değerler çizgide
 * boşluk bırakır; tek nokta yatay çizgi olur; sabit seri ortadan geçer.
 */

export type SparklineGeometry = {
  /** Çizgi path'i (`M … L …`, boşluklarda yeni `M`). */
  line: string;
  /** Alan dolgusu path'i (her kesintisiz parça tabana kapatılır). */
  area: string;
  /** Son geçerli noktanın konumu (viewBox birimi). */
  last: { x: number; y: number; value: number } | null;
  min: number | null;
  max: number | null;
  /** Geçerli nokta sayısı. */
  count: number;
};

export type SparklineOptions = {
  width: number;
  height: number;
  /** Üst/alt iç boşluk (viewBox birimi). */
  padY?: number;
  /** Y ekseni alt sınırı (ör. 0'dan başlatmak için 0). */
  min?: number;
  max?: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function sparklineGeometry(data: ReadonlyArray<number | null | undefined>, opts: SparklineOptions): SparklineGeometry {
  const { width, height } = opts;
  const padY = opts.padY ?? 2;
  const valid = data.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!valid.length) return { line: '', area: '', last: null, min: null, max: null, count: 0 };

  const lo = Math.min(opts.min ?? Infinity, ...valid);
  const hi = Math.max(opts.max ?? -Infinity, ...valid);
  const span = hi - lo;
  const n = data.length;
  const xAt = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width);
  const yAt = (v: number) => (span === 0 ? height / 2 : padY + (1 - (v - lo) / span) * (height - padY * 2));

  if (valid.length === 1 && n === 1) {
    const y = round(yAt(valid[0]));
    return {
      line: `M0 ${y} L${width} ${y}`,
      area: `M0 ${y} L${width} ${y} L${width} ${height} L0 ${height} Z`,
      last: { x: width, y, value: valid[0] },
      min: lo,
      max: hi,
      count: 1,
    };
  }

  let line = '';
  let area = '';
  let segStartX: number | null = null;
  let prevX = 0;
  let last: SparklineGeometry['last'] = null;

  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      if (segStartX !== null) {
        area += ` L${prevX} ${height} L${segStartX} ${height} Z`;
        segStartX = null;
      }
      continue;
    }
    const x = round(xAt(i));
    const y = round(yAt(v));
    if (segStartX === null) {
      line += `${line ? ' ' : ''}M${x} ${y}`;
      area += `${area ? ' ' : ''}M${x} ${y}`;
      segStartX = x;
    } else {
      line += ` L${x} ${y}`;
      area += ` L${x} ${y}`;
    }
    prevX = x;
    last = { x, y, value: v };
  }
  if (segStartX !== null) area += ` L${prevX} ${height} L${segStartX} ${height} Z`;

  return { line, area, last, min: lo, max: hi, count: valid.length };
}
