import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { budgetState, fitVoiceToBudget, requireBudget } from '../web/src/budget.ts';

test('spending cap swaps a paid voice for the basic one and stops paid AI once reached', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  try {
    const env: any = { DB: database(join(dir, 'db.sqlite')) };
    env.config = defaultConfig(env);
    env.config.budget = { dailyVnd: 1000, monthlyVnd: 0, warnPct: 80, perVideoVnd: 50 };
    const spec = { voice: { provider: 'everai', voiceId: 'vi_female_thuytrang_mb', speed: 1 }, scenes: [{ lines: ['x'.repeat(200)] }] };
    // 200 characters of EverAI at 1000đ/1000 = 200đ > 50đ per video
    assert.match(await fitVoiceToBudget(env, spec), /giọng cơ bản/);
    assert.equal(spec.voice.provider, 'free');
    await requireBudget(env, 'thử');
    await env.DB.prepare("INSERT INTO events (ts, type, channel, ok, cost) VALUES (?, 'ai.image', 'web', 1, 1200)").bind(Date.now()).run();
    const state = await budgetState(env, true);
    assert.equal(state.over, true); assert.equal(state.day, 1200);
    await assert.rejects(requireBudget(env, 'vẽ tranh AI'), { status: 503 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
