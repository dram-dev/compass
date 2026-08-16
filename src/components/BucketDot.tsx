import type { BucketId } from '@/engine/types';
import { BUCKET_COLOR } from '@/lib/bucketColors';

export function BucketDot({ bucket, className = '' }: { bucket: BucketId; className?: string }) {
  if (bucket === 'unknown') {
    return (
      <span
        className={`mr-[7px] inline-block h-2 w-2 rounded-sm align-[1px] ${className}`}
        style={{ background: 'var(--unknown-hatch-fine)' }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`mr-[7px] inline-block h-2 w-2 rounded-full align-[1px] ${className}`}
      style={{ background: BUCKET_COLOR[bucket] }}
      aria-hidden
    />
  );
}
