import type { Request, Response } from 'express';
import { requireAdmin } from '../../../../lib/hunter/admin-guard.js';
import { getJob } from '../../../../lib/hunter/hunter-jobs.js';

export default async function handler(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const job = getJob(String(req.params.jobId));
    if (!job || job.userId !== admin.id) return res.status(404).json({ error: 'That search was not found (it may have expired). Please start again.' });
    res.json({
      id: job.id, mode: job.mode, city: job.city, count: job.count, categories: job.categories, subCategory: job.subCategory, status: job.status, stage: job.stage, percent: job.percent,
      log: job.log.slice(-40), providers: job.providers, social: job.social, days: job.days, results: job.status === 'done' ? job.results : [], sources: job.sources,
      usedAI: job.usedAI, posted: job.posted, error: job.error,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not read the search', message: String(err) });
  }
}
