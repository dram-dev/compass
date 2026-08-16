import type { CompassState } from '@/store/schema';
import { SAMPLE_COMPANIES } from '@/data/sampleCompanies';
import { buildContext, type ScoringContext } from './context';
import { resolveCompanies } from './companies';

/** Build a scoring context from a persisted state — used by tests and the store selectors. */
export function contextFromState(state: CompassState): ScoringContext {
  return buildContext({
    principles: state.principles,
    bucketDefaults: state.bucketDefaults,
    companies: resolveCompanies(
      SAMPLE_COMPANIES,
      state.importedCompanies,
      state.userCompanies,
      state.companyOverrides,
    ),
    political: state.political,
  });
}
