/** In-memory list of hunts (kept for 3 hours). Fine for one admin on one server. */
import crypto from 'node:crypto';
import type { Candidate, HuntMode } from './hunter-core.js';
import type { Provider } from './hunter-providers.js';

export type SourceReport = { name: string; ok: boolean; found: number; note?: string };

export type Job = {
  id: string;
  userId: string;
  mode: HuntMode;
  city: string;
  count: number;
  categories: string[];
  subCategory: string;
  strict: boolean;
  providers: Provider[];
  social: boolean;
  days: number;
  status: 'running' | 'done' | 'error';
  stage: string;
  percent: number;
  log: string[];
  results: Candidate[];
  sources: SourceReport[];
  usedAI: boolean;
  aiNote: string | null;
  posted: Record<string, number>;
  error: string | null;
  createdAt: number;
};

const jobs = new Map<string, Job>();
const TTL = 3 * 3_600_000;

export function createJob(userId: string, mode: HuntMode, city: string, count: number, categories: string[], subCategory: string, strict: boolean, providers: Provider[], social: boolean, days: number): Job {
  const now = Date.now();
  for (const [k, j] of jobs) if (now - j.createdAt > TTL) jobs.delete(k);
  const job: Job = {
    id: crypto.randomBytes(8).toString('hex'), userId, mode, city, count, categories, subCategory, strict, providers, social, days,
    status: 'running', stage: 'Starting', percent: 1, log: [], results: [], sources: [],
    usedAI: false, aiNote: null, posted: {}, error: null, createdAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined { return jobs.get(id); }

export function runningJobFor(userId: string): Job | undefined {
  for (const j of jobs.values()) if (j.userId === userId && j.status === 'running') return j;
  return undefined;
}

export function progress(job: Job, percent: number, stage: string): void {
  job.percent = Math.max(job.percent, Math.min(99, Math.round(percent)));
  job.stage = stage;
  job.log.push(stage);
  if (job.log.length > 120) job.log.shift();
}
