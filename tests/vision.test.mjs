import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PokemonTcgApi } from '../dist/index.js';

test('vision invia include nel multipart e conserva prezzi e withheld', async () => {
  const body = {
    data: { decision: 'match', id: 'bs-4', candidates: [{ id: 'bs-4', index_eur: 350, prices: [] }] },
    meta: { count: 1 }, withheld: ['graded', 'non_english_locales'],
  };
  const client = new PokemonTcgApi({ apiKey: 'test', maxRetries: 0, fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/v1/vision/identify');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body?.get('include'), 'index,prices');
    assert.equal(init?.body?.get('top_k'), '3');
    return Response.json(body);
  }});
  const result = await client.vision.identify(new Uint8Array([1, 2]), { topK: 3, include: ['index', 'prices'] });
  assert.deepEqual(result.withheld, body.withheld);
  assert.equal(result.data.candidates[0]?.index_eur, 350);
});
