import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PokemonTcgApi } from '../dist/index.js';

test('il batch conserva missing, suggerimenti e withheld dalla risposta HTTP', async () => {
  const body = {
    data: [{ id: 'sv8-100' }], requested: 3, found: 1,
    missing: [{ id: 'sv8-116', suggested_id: 'ssp-116' }, { id: 'inventato-xyz' }],
    withheld: ['index'],
  };
  let calls = 0;
  const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v1/cards/batch');
    assert.equal(url.searchParams.get('ids'), 'sv8-116,sv8-100,inventato-xyz');
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }});
  const result = await client.cards.batch(['sv8-116', 'sv8-100', 'inventato-xyz']);
  assert.deepEqual(result, body);
  // Questi accessi sono verificati anche da TypeScript contro i tipi esportati.
  assert.equal(result.missing?.[0]?.suggested_id, 'ssp-116');
  assert.equal(result.missing?.[1]?.suggested_id, undefined);
  assert.deepEqual(result.withheld, ['index']);
  assert.equal(calls, 1);
});

test('API senza missing: il client conserva omissione e conteggio dei duplicati', async () => {
  const client = new PokemonTcgApi({ apiKey: 'test', fetch: async (input) => {
    assert.equal(new URL(String(input)).searchParams.get('ids'), 'base1-4,bs-4,bs-4');
    return Response.json({ data: [{ id: 'bs-4' }], requested: 3, found: 1 });
  }});
  const result = await client.cards.batch(['base1-4', 'bs-4', 'bs-4']);
  assert.equal(result.requested, 3);
  assert.equal(result.found, 1);
  assert.equal('missing' in result, false);
  assert.equal('withheld' in result, false);
});
