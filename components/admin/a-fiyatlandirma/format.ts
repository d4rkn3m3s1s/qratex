const ABS = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const NUM = new Intl.NumberFormat('tr-TR');

export const fmtAbs = (iso: string) => ABS.format(new Date(iso));
export const fmtNum = (n: number) => NUM.format(n);
