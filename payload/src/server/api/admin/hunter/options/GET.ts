import type { Request, Response } from 'express';
import { requireAdmin } from '../../../../lib/hunter/admin-guard.js';
import { CATEGORY_TREE, CITY_OPTIONS } from '../../../../lib/hunter/hunter-core.js';
import { providerStatus } from '../../../../lib/hunter/hunter-providers.js';
import { hunterAiConfigured } from '../../../../lib/hunter/hunter-ai.js';

export default async function handler(req: Request, res: Response) {
  try {
    if (!(await requireAdmin(req, res))) return;
    res.json({
      cities: CITY_OPTIONS, aiConfigured: hunterAiConfigured(), providers: providerStatus(),
      categories: Object.fromEntries(Object.entries(CATEGORY_TREE).map(([k, v]) => [k, v.map((x) => x.name)])),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the options', message: String(err) });
  }
}
