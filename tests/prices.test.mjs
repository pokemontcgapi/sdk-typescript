import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PlanRequiredError, PermissionDeniedError, PokemonTcgApi, TrialExpiredError } from '../dist/index.js';

/** Le fixture condivise: in packages/fixtures nel monorepo, in tests/fixtures nel repo pubblico. */
function fixture(name) {
  const local = new URL(`./fixtures/${name}.json`, import.meta.url);
  const shared = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(existsSync(local) ? local : shared, 'utf8'));
}

test('le rotte prezzi chiamano i path giusti e gli header restano leggibili', async () => {
  const seen = [];
  const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async (input) => {
    const url = new URL(String(input));
    seen.push(url.pathname + url.search);
    return new Response(JSON.stringify({ data: [], meta: {}, requested: 0, found: 0 }), {
      headers: { 'x-credits-cost': '4', 'x-quota-remaining': '796', 'x-plan-withheld': 'graded, non_english_locales', 'x-cards-limit': '1000', 'x-cards-used': '37', 'x-cards-warning': 'approaching_limit' },
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
  assert.equal(client.lastResponse?.errorCode, null);
  assert.deepEqual(client.lastResponse?.planWithheld, ['graded', 'non_english_locales']);
  assert.equal(client.lastResponse?.cardsLimit, 1000);
  assert.equal(client.lastResponse?.cardsUsed, 37);
  assert.equal(client.lastResponse?.cardsWarning, 'approaching_limit');
});

test("i prezzi di un sigillato portano l'indice del prodotto, il locale della scatola e l'avviso sul tetto", async () => {
  const sample = fixture('prices-sealed-with-index');
  const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async (input) => {
    assert.equal(new URL(String(input)).pathname, '/v1/sealed/cn-example-booster-box/prices');
    return Response.json(sample.body, { headers: sample.headers });
  }});
  const { data, meta } = await client.sealed.prices('cn-example-booster-box');
  assert.equal(data.sealed_id, 'cn-example-booster-box');
  assert.equal(data.index?.eur, 128.5);
  assert.equal(data.index?.sample_n, null);
  assert.deepEqual(data.index?.by_locale, []);
  assert.equal(data.quotes.length, meta.quotes);
  assert.deepEqual(data.quotes.map((q) => q.locale), ['zh', 'zh']);
  assert.equal(client.lastResponse?.cardsWarning, 'approaching_limit');
  assert.equal(client.lastResponse?.cardsUsed, 812);

  const quiet = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async () => Response.json({ status: 'ok' }, { headers: { 'x-cards-warning': '' } }) });
  await quiet.health();
  assert.equal(quiet.lastResponse?.cardsWarning, null);
});

test('PLAN_REQUIRED e TRIAL_EXPIRED hanno una classe, e restano PermissionDenied', async () => {
  const cases = /** @type {const} */ ([{ code: 'PLAN_REQUIRED', cls: PlanRequiredError }, { code: 'TRIAL_EXPIRED', cls: TrialExpiredError }]);
  for (const { code, cls } of cases) {
    const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async () =>
      new Response(JSON.stringify({ error: { code, message: 'no' } }), { status: 403, headers: { 'X-Error-Code': code } }) });
    await assert.rejects(client.prices.movers(), (error) => {
      assert.ok(error instanceof cls);
      assert.ok(error instanceof PermissionDeniedError);
      return true;
    });
    assert.equal(client.lastResponse?.errorCode, code);
  }
});

test('prices.current rifiuta piu di 50 id prima di toccare la rete', () => {
  const client = new PokemonTcgApi({ apiKey: 'test', fetch: async () => assert.fail('nessuna chiamata attesa') });
  assert.throws(() => client.prices.current(Array.from({ length: 51 }, (_, i) => `x-${i}`)), RangeError);
});
