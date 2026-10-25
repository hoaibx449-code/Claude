import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanConfig, defaultConfig } from '../web/src/settings.ts';

test('saving plans keeps every plan: typed codes are made valid and duplicates are numbered, never dropped', () => {
  const base = defaultConfig({} as any), c: any = structuredClone(base);
  const extra = (id: string, price: number) => ({ ...structuredClone(c.plans[1]), id, name: id, price: String(price) });
  c.plans.push(extra('Gói VIP', 299000), extra('goi-vip', 399000), extra('x', 499000));
  const out = cleanConfig(c, base).plans;
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((p) => p.id), ['free', 'pro', 'goi-vip', 'goi-vip-2', 'goi5']);
  assert.equal(out[2].price, 299000);
});
