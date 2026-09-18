import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlanRequiredError, PermissionDeniedError, PokemonTcgApi, TrialExpiredError } from '../dist/index.js';

test('le rotte prezzi chiamano i path giusti e gli header restano leggibili', async () => {
  const seen = [];
  const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async (input) => {
    const url = new URL(String(input));
    seen.push(url.pathname + url.search);
    return new Response(JSON.stringify({ data: [], meta: {}, requested: 0, found: 0 }), {
      headers: { 'x-credits-cost': '4', 'x-quota-remaining': '796', 'x-plan-withheld': 'graded, non_english_locales' },
    });
  }});

  await client.prices.card('base1-4', { source: 'CARDMARKET' });
  await client.prices.current(['base1-4', 'bs-4']);
  await client.prices.history('base1-4', { bucket: 'week' });
  await client.prices.movers({ window: '7d', direction: 'losers' });
  await client.sealed.list({ set: ['evs', 'fst'], include: ['index'] });
  await client.changes({ since: 42 });

  assert.deepEqual(seen, [
    '/v1/cards/base1-4/prices?source=CARDMARKET',
    '/v1/prices/current?ids=base1-4%2Cbs-4',
    '/v1/cards/base1-4/prices/history?bucket=week',
    '/v1/prices/movers?window=7d&direction=losers',
    '/v1/sealed?set=evs%2Cfst&include=index',
    '/v1/changes?since=42',
  ]);
  assert.equal(client.lastResponse?.creditsCost, 4);
  assert.equal(client.lastResponse?.quotaRemaining, 796);
  assert.deepEqual(client.lastResponse?.planWithheld, ['graded', 'non_english_locales']);
});

test('PLAN_REQUIRED e TRIAL_EXPIRED hanno una classe, e restano PermissionDenied', async () => {
  const cases = /** @type {const} */ ([{ code: 'PLAN_REQUIRED', cls: PlanRequiredError }, { code: 'TRIAL_EXPIRED', cls: TrialExpiredError }]);
  for (const { code, cls } of cases) {
    const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async () =>
      new Response(JSON.stringify({ error: { code, message: 'no' } }), { status: 403 }) });
    await assert.rejects(client.prices.movers(), (error) => {
      assert.ok(error instanceof cls);
      assert.ok(error instanceof PermissionDeniedError);
      return true;
    });
  }
});

test('prices.current rifiuta piu di 50 id prima di toccare la rete', () => {
  const client = new PokemonTcgApi({ apiKey: 'test', fetch: async () => assert.fail('nessuna chiamata attesa') });
  assert.throws(() => client.prices.current(Array.from({ length: 51 }, (_, i) => `x-${i}`)), RangeError);
});
