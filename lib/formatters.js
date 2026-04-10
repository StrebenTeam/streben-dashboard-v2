export const fmt = (n, dec = 0) =>
  n != null
    ? Number(n).toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : 'N/A';

export const fmtCurrency = (n) => (n != null ? '$' + fmt(n, 2) : 'N/A');

export const fmtPct = (n) => (n != null ? (n * 100).toFixed(1) + '%' : 'N/A');

export const calcDelta = (curr, prev) => {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};
