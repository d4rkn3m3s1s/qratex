type Triplet = { positive: number; neutral: number; negative: number };

export function normalizeSentimentTriplet(
  input: Triplet,
  options?: { autoScaleRatio?: boolean }
): Triplet {
  const autoScaleRatio = options?.autoScaleRatio ?? false;
  const values = [input.positive, input.neutral, input.negative].map((value) => Number(value) || 0);
  let total = values[0] + values[1] + values[2];

  if (autoScaleRatio && total > 0 && total <= 1.5) {
    values[0] *= 100;
    values[1] *= 100;
    values[2] *= 100;
    total = values[0] + values[1] + values[2];
  }

  if (total <= 0) return { positive: 0, neutral: 0, negative: 0 };

  const raw = [
    (values[0] / total) * 100,
    (values[1] / total) * 100,
    (values[2] / total) * 100,
  ];
  const rounded = raw.map((v) => Math.round(v));
  let diff = 100 - (rounded[0] + rounded[1] + rounded[2]);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));

  for (const item of order) {
    if (diff === 0) break;
    rounded[item.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  return { positive: rounded[0], neutral: rounded[1], negative: rounded[2] };
}
