import type { Company } from '@/engine/types';
import raw from './companies.sample.json';

export const SAMPLE_COMPANIES: Company[] = raw as Company[];

export const SAMPLE_COMPANY_BY_ID: Record<string, Company> = Object.fromEntries(
  SAMPLE_COMPANIES.map((c) => [c.id, c]),
);
