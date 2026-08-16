import type { BucketId } from '@/engine/types';

export const BUCKET_COLOR: Record<BucketId, string> = {
  local: 'var(--aligned)',
  regional: 'var(--mixed)',
  major: 'var(--opposed)',
  unknown: 'var(--unknown)',
};
