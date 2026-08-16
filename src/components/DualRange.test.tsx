import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DualRange } from './DualRange';

function Harness({ initial = [20, 40] as [number, number] }) {
  const [v, setV] = useState<[number, number]>(initial);
  return (
    <>
      <DualRange value={v} onChange={setV} label="Local" color="green" />
      <output data-testid="out">{v.join('-')}</output>
    </>
  );
}

describe('DualRange (pointer + keyboard)', () => {
  it('exposes two ARIA sliders with correct bounds', () => {
    render(<Harness />);
    const [lo, hi] = screen.getAllByRole('slider');
    expect(lo).toHaveAttribute('aria-label', 'Local minimum share');
    expect(hi).toHaveAttribute('aria-label', 'Local maximum share');
    expect(lo).toHaveAttribute('aria-valuenow', '20');
    expect(hi).toHaveAttribute('aria-valuenow', '40');
    expect(lo).toHaveAttribute('aria-valuemax', '38');
    expect(hi).toHaveAttribute('aria-valuemin', '22');
  });

  it('keyboard: arrows, page keys, home/end, and the min-gap constraint', () => {
    render(<Harness />);
    const [lo, hi] = screen.getAllByRole('slider') as HTMLElement[];
    fireEvent.keyDown(lo!, { key: 'ArrowRight' });
    expect(screen.getByTestId('out')).toHaveTextContent('21-40');
    fireEvent.keyDown(lo!, { key: 'PageUp' });
    expect(screen.getByTestId('out')).toHaveTextContent('31-40');
    fireEvent.keyDown(lo!, { key: 'End' }); // capped at hi - 2
    expect(screen.getByTestId('out')).toHaveTextContent('38-40');
    fireEvent.keyDown(hi!, { key: 'Home' }); // capped at lo + 2
    expect(screen.getByTestId('out')).toHaveTextContent('38-40');
    fireEvent.keyDown(hi!, { key: 'End' });
    expect(screen.getByTestId('out')).toHaveTextContent('38-100');
    fireEvent.keyDown(hi!, { key: 'PageDown' });
    fireEvent.keyDown(hi!, { key: 'ArrowLeft' });
    expect(screen.getByTestId('out')).toHaveTextContent('38-89');
    fireEvent.keyDown(lo!, { key: 'Home' });
    expect(screen.getByTestId('out')).toHaveTextContent('0-89');
    fireEvent.keyDown(lo!, { key: 'Tab' }); // ignored
    expect(screen.getByTestId('out')).toHaveTextContent('0-89');
  });

  it('pointer: nearest thumb picks up on pointerdown, follows pointermove, stops on pointerup', () => {
    render(<Harness />);
    const host = screen.getByTestId('dual-range');
    host.getBoundingClientRect = () => ({
      left: 0,
      width: 200,
      top: 0,
      height: 34,
      right: 200,
      bottom: 34,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    (host as HTMLElement & { setPointerCapture: () => void }).setPointerCapture = () => {};
    // jsdom's PointerEvent lacks clientX — dispatch plain events carrying the coordinate.
    const ptr = (type: string, clientX: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clientX', { value: clientX });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      return ev;
    };
    fireEvent(host, ptr('pointerdown', 150)); // 75% → nearer hi(40)
    expect(screen.getByTestId('out')).toHaveTextContent('20-75');
    fireEvent(host, ptr('pointermove', 180));
    expect(screen.getByTestId('out')).toHaveTextContent('20-90');
    fireEvent(host, ptr('pointerup', 180));
    fireEvent(host, ptr('pointermove', 100));
    expect(screen.getByTestId('out')).toHaveTextContent('20-90');
    fireEvent(host, ptr('pointerdown', 10)); // 5% → lo
    expect(screen.getByTestId('out')).toHaveTextContent('5-90');
  });
});
