const formatters = new Map<string, Intl.NumberFormat>();

/** Formats minor units (paise) for display, e.g. 12050 → ₹120.50, 12000 → ₹120. */
export function formatMoney(minor: number, currency = 'INR') {
  const key = currency;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  }
  return formatters.get(key)!.format(minor / 100);
}

/** Parses user input like "120", "120.5" or "1,200" into minor units. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const minorToInput = (minor: number | null | undefined) => (minor == null ? '' : (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2));
