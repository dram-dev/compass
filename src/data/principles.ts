import type { Principle } from '@/engine/types';
import raw from './principles.library.json';

export interface PrincipleDef {
  id: string;
  label: string;
  description: string;
}

export const PRINCIPLE_LIBRARY: PrincipleDef[] = raw as PrincipleDef[];

export function libraryPrinciple(id: string, weight = 0): Principle {
  const def = PRINCIPLE_LIBRARY.find((p) => p.id === id);
  return {
    id,
    label: def?.label ?? id,
    weight,
    custom: !def,
    description: def?.description,
  };
}
