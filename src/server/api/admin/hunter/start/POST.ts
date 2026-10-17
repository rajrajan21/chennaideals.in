import type { Request, Response } from 'express';
import { requireAdmin } from '../../../../lib/hunter/admin-guard.js';
import { CATEGORY_TREE, CITY_OPTIONS, clampCount, type HuntMode } from '../../../../lib/hunter/hunter-core.js';
import { PROVIDERS, providerReady, type Provider } from '../../../../lib/hunter/hunter-providers.js';
import { createJob, runningJobFor } from '../../../../lib/hunter/hunter-jobs.js';
import { runHunt } from '../../../../lib/hunter/hunter-engine.js';

export default async function handler(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const mode: HuntMode | null = req.body?.mode === 'ecommerce' ? 'ecommerce' : req.body?.mode === 'local' ? 'local' : req.body?.mode === 'social' ? 'social' : null;
    if (!mode) return res.status(400).json({ error: 'Choose option 1, 2 or 3.' });
    const busy = runningJobFor(admin.id);
    if (busy) return res.json({ jobId: busy.id, alreadyRunning: true });
    const wanted = String(req.body?.city ?? '').trim();
    const SOCIAL_SCOPES = ['Chennai + online shops', 'Online shops only'];
    const city = mode === 'ecommerce' ? 'India' : mode === 'social' && SOCIAL_SCOPES.includes(wanted) ? wanted : CITY_OPTIONS.includes(wanted) ? wanted : mode === 'social' ? 'Chennai + online shops' : 'Chennai (all areas)';
    const categories: string[] = Array.isArray(req.body?.categories) ? req.body.categories.map(String).filter((c: string) => c in CATEGORY_TREE) : [];
    const subWanted = String(req.body?.subCategory ?? '');
    const subCategory = categories.length === 1 && CATEGORY_TREE[categories[0]].some((x) => x.name === subWanted) ? subWanted : '';
    const strict = req.body?.strict !== false;
    const asked: Provider[] = Array.isArray(req.body?.providers) ? req.body.providers.map(String).filter((p: string) => PROVIDERS.some((x) => x.id === p)) : [];
    let providers = asked.filter((p) => providerReady(p));
    if (providers.length === 0) providers = PROVIDERS.map((p) => p.id).filter((p) => providerReady(p));
    const social = mode === 'social' ? true : req.body?.social !== false;
    const days = Number(req.body?.days) === 3 ? 3 : 7;
    if (mode === 'social' && providers.length === 0) return res.status(400).json({ error: 'Option 3 needs at least one AI engine key. Run tools\\Set-AI-Key.bat first.' });
    const job = createJob(admin.id, mode, city, clampCount(req.body?.count), categories, subCategory, strict, providers, social, days);
    void runHunt(job); // runs in the background; the page polls for progress
    res.json({ jobId: job.id });
  } catch (err) {
    res.status(500).json({ error: 'Could not start the search', message: String(err) });
  }
}
