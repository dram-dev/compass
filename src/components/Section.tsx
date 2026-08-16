import type { ReactNode } from 'react';

export function Section({
  no,
  title,
  sub,
  children,
  controls,
  id,
}: {
  no: string;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-11 break-inside-avoid" aria-labelledby={`sec-${no}`}>
      <div className="flex items-baseline gap-3.5 border-t border-rule pt-3.5">
        <span className="sec-no">{no}</span>
        <h2 id={`sec-${no}`} className="text-[21px]">
          {title}
        </h2>
      </div>
      {(sub || controls) && (
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          {sub ? <p className="sub !mt-0">{sub}</p> : <span />}
          {controls}
        </div>
      )}
      {children}
    </section>
  );
}
