import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { assertCapacityAvailable } from '@/core/demo/capacity';
import { runScenario } from '@/core/demo/demo-runner';
import { getRepository } from '@/core/repository';
import { handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({ applyFollowUps: z.boolean().default(false) })
  .default({ applyFollowUps: false });

/**
 * POST /api/demo/scenarios/:id/run — runs a scenario through the real
 * pipeline (same orchestrator, analyzer and Safety Gate as a live webhook).
 * `applyFollowUps: true` also submits the scenario's follow-up evidence so the
 * reassessment flow can be demonstrated in one click.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const raw = await request.json().catch(() => ({}));
    const { applyFollowUps } = bodySchema.parse(raw ?? {});

    const repository = getRepository();
    await assertCapacityAvailable(repository);

    const result = await runScenario(id, { repository, applyFollowUps });
    return ok(result, 201);
  } catch (error) {
    return handleRouteError(error, 'POST /api/demo/scenarios/:id/run');
  }
}
