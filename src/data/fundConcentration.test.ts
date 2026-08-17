import { describe, expect, it } from 'vitest';
import { classifyExposure } from './fundConcentration';

describe('classifyExposure', () => {
  const e = {
    '-2': 0.1,
    '-1': 0.1,
    '0': 0.2,
    '1': 0.2,
    '2': 0.2,
    unknown: 0.05,
    nonCompany: 0.05,
    coverage: 0.9,
  };
  it('maps leans to Aligned/Mixed/Opposed by direction; uncovered → unknown', () => {
    const plus = classifyExposure(e, 1);
    expect(plus.aligned).toBeCloseTo(0.4, 10);
    expect(plus.mixed).toBeCloseTo(0.2, 10);
    expect(plus.opposed).toBeCloseTo(0.2, 10);
    expect(plus.unknown).toBeCloseTo(0.05 + 0.1, 10);
    expect(plus.nonCompany).toBeCloseTo(0.05, 10);
    const minus = classifyExposure(e, -1);
    expect(minus.aligned).toBeCloseTo(0.2, 10);
    expect(minus.opposed).toBeCloseTo(0.4, 10);
  });
  it('unconfigured direction → everything company-side is Unknown', () => {
    const z = classifyExposure(e, 0);
    expect(z.aligned + z.mixed + z.opposed).toBe(0);
    expect(z.unknown).toBeCloseTo(0.8 + 0.05 + 0.1, 10);
  });
});
