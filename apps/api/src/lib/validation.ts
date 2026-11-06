import type { z } from 'zod';
import { badRequest } from './errors';

/** Valide `data` avec un schéma zod ; lève une AppError 400 VALIDATION_ERROR sinon. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data as z.output<S>;
  const details: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }
  const first = r.error.issues[0];
  const message = first
    ? `Données invalides${first.path.length ? ` (${first.path.join('.')})` : ''} : ${first.message}`
    : 'Données invalides';
  throw badRequest(message, details);
}

export interface Page {
  page: number;
  pageSize: number;
}

export function pageArgs(p: Page): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function paginated<T>(items: T[], total: number, p: Page) {
  return { items, total, page: p.page, pageSize: p.pageSize };
}
