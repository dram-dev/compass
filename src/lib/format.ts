export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const fmtMoney = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
export const fmtMoneyK = (n: number): string =>
  n >= 9500
    ? `$${(n / 1000).toFixed(0)}k`
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}k`
      : `$${Math.round(n)}`;
export const fmtPct = (n: number, d = 0): string => `${n.toFixed(d)}%`;
export const signed1 = (n: number): string => `${n >= 0 ? '+' : '−'}${fmt1(Math.abs(n))}`;
export const effortDots = (e: number): string => '●'.repeat(e) + '○'.repeat(Math.max(0, 5 - e));
export const COST_LABEL: Record<'saves' | 'neutral' | 'small' | 'moderate', string> = {
  saves: 'saves $',
  neutral: 'cost-neutral',
  small: 'small cost',
  moderate: 'moderate cost',
};
