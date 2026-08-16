import { NavLink, Outlet } from 'react-router-dom';
import { Footer } from './Footer';

const NAV = [
  { to: '/wizard', label: 'Wizard' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/plan', label: 'Plan' },
  { to: '/data', label: 'Data sources' },
];

export function Layout() {
  return (
    <div className="wrap">
      <header className="border-b border-ink pb-5 pt-[34px] print:hidden">
        <div className="font-serif text-[30px] font-semibold tracking-brand max-[560px]:text-2xl max-[560px]:tracking-[.26em]">
          C<span className="text-brass">O</span>MPASS
        </div>
        <div className="mt-1.5 text-[12.5px] text-faint">
          Align your spending and investments with your own principles.{' '}
          <span className="font-mono text-[11.5px]">local-first · private · educational</span>
        </div>
        <nav
          aria-label="Primary"
          className="mt-3.5 flex gap-[22px] text-xs uppercase tracking-wide2"
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                isActive ? 'border-b-2 border-brass pb-0.5 text-ink' : 'text-faint hover:text-ink'
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
