import { z } from 'zod';
const report = z.record(z.string(), z.unknown()).nullable().optional();
const lesson = z.object({ attempts: z.number().int().min(0).max(1000000), passed: z.boolean(), bestD: z.number().min(0).nullable(), last: z.number().optional(), latestReport: report }).strict();
export const profile = z.object({ name: z.string().trim().min(1).max(40), lessons: z.record(z.string().max(100), lesson), mocks: z.array(z.record(z.string(), z.unknown())).max(50), history: z.array(z.record(z.string(), z.unknown())).max(50), practiceSeconds: z.number().min(0).max(1e10) }).strict();
export const progressInput = z.object({ revision: z.number().int().min(0), profile }).strict();
export const sessionInput = z.object({ id: z.uuid(), startedAt: z.iso.datetime(), duration: z.number().min(0).max(86400), kind: z.enum(['lesson', 'mock']), data: z.record(z.string(), z.unknown()), faults: z.array(z.record(z.string(), z.unknown())).max(500), feedback: report }).strict();
export const pageInput = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) });
