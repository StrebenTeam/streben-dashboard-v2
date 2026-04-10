export const categorizeSource = (source) => {
  if (!source) return 'other';
  if (source.includes('Google Ads')) return 'google';
  if (source.includes('Paid Search') && !source.includes('Google Ads')) return 'paid-search';
  if (source.includes('Organic')) return 'organic';
  if (source.includes('Direct')) return 'direct';
  if (source.includes('Referral')) return 'referral';
  return 'other';
};

export const aggregateSourcesByCategory = (sources) => {
  const agg = { google: 0, 'paid-search': 0, organic: 0, direct: 0, referral: 0, other: 0 };
  Object.entries(sources || {}).forEach(([src, count]) => {
    const cat = categorizeSource(src);
    agg[cat] += count;
  });
  return agg;
};
