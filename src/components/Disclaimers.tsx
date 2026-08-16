/** §3.6 — shown on the investments step and every investments panel thereafter. */
export function InvestmentsDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`callout ${className}`} role="note">
      <b className="text-ink">Educational scenarios, not financial advice.</b> Holdings are grouped
      into sleeves and any reallocation is described by{' '}
      <b className="text-ink">vehicle class only</b> (e.g., "local credit union deposits", "a
      values-screened index fund you select"). Compass never recommends a specific fund or security.
      Consult a licensed professional before making investment decisions.
    </div>
  );
}

/** EF7 — illustrative local-multiplier note, clearly labeled. */
export function MultiplierNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11.5px] text-faint ${className}`}>
      <span className="text-brass">≈</span> Illustrative: studies commonly estimate roughly 2–3×
      more local recirculation per dollar spent at independents than at national chains.
      Directional, not precise.
    </p>
  );
}
