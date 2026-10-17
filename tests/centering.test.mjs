import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PokemonTcgApi, ServerError } from '../dist/index.js';
/** @param {string} name */
function fixture(name) {
  const publicPath = new URL(`./fixtures/centering-${name}.json`, import.meta.url);
  const path = existsSync(publicPath) ? publicPath : new URL(`../../fixtures/centering-${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, 'utf8'));
}
test('centering-multipart: image, explicit face, size and serialized corners; needs-review is data', async () => {
  const sample = fixture('measure');
  const corners = fixture('confirm-input').geometry.corners;
  let calls = 0;
  const client = new PokemonTcgApi({ apiKey: 'test', fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/v1/centering/measure');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).has('content-type'), false);
    const form = /** @type {FormData} */ (init?.body);
    assert.equal(form.get('face'), 'front');
    if (calls++ === 0) {
      assert.equal(form.get('corners'), JSON.stringify(corners));
      assert.equal(form.get('card_size'), 'standard');
    } else {
      assert.equal(form.has('corners'), false);
      assert.equal(form.has('card_size'), false);
    }
    const file = /** @type {File} */ (form.get('image'));
    assert.equal(file.name, 'card');
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1,2,3]));
    return Response.json(sample.body, {headers: sample.headers});
  }});
  const result = await client.centering.measure(new Uint8Array([1,2,3]), {face:'front',card_size:'standard',corners});
  assert.deepEqual(result, sample.body);
  assert.equal(result.data.status, 'needs-review');
  assert.equal(result.data.ceilings, null);
  assert.equal(result.data.geometry?.geometry_version, 1);
  assert.equal(client.lastResponse?.creditsCost, 25);
  await client.centering.measure(new Uint8Array([1,2,3]), {face:'front'});
});
test('centering-confirm: reviewed geometry travels unchanged in JSON', async () => {
  const inputBody = fixture('confirm-input');
  const sample = fixture('confirm');
  const client = new PokemonTcgApi({ fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/v1/centering/confirm');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), inputBody);
    return Response.json(sample.body);
  }});
  const result = await client.centering.confirm(inputBody);
  assert.deepEqual(result, sample.body);
  assert.equal(result.data.basis, 'client-confirmed-lines');
  assert.ok(result.data.ceilings.PSA.maximum_grade);
  assert.match(result.data.disclaimer, /ceiling from centering alone, not a prediction of the final grade/);
});
test('centering-grade: known ratios in JSON, incomplete and null faces preserved', async () => {
  const sample = fixture('grade');
  const client = new PokemonTcgApi({fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/v1/centering/grade');
    assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), {front_lr:55,front_tb:52,house:'PSA'});
    return Response.json(sample.body);
  }});
  const result = await client.centering.grade({front_lr:55,front_tb:52,house:'PSA'});
  assert.deepEqual(result, sample.body);
  assert.equal(result.data.incomplete, true);
  assert.equal(result.data.back, null);
});
test('centering-standards: filters in query and typed bands', async () => {
  const sample = fixture('standards');
  const client = new PokemonTcgApi({fetch: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v1/centering/standards');
    assert.equal(init?.method, 'GET');
    assert.equal(url.searchParams.get('house'), 'PSA');
    assert.equal(url.searchParams.get('face'), 'front');
    return Response.json(sample.body);
  }});
  const result = await client.centering.standards({house:'PSA',face:'front'});
  assert.deepEqual(result, sample.body);
  assert.equal(result.data.standards[0]?.bands[0]?.value, 10);
});
test('centering-post-no-retry: service unavailable on measure, confirm and grade is surfaced once', async () => {
  let calls = 0;
  const client = new PokemonTcgApi({maxRetries:3,fetch:async () => {
    calls++;
    return Response.json({error:{code:'PROVIDER_UNAVAILABLE',message:'Retry shortly.'}}, {status:503});
  }});
  await assert.rejects(client.centering.measure(new Uint8Array([1]), {face:'front'}), ServerError);
  await assert.rejects(client.centering.confirm(fixture('confirm-input')), ServerError);
  await assert.rejects(client.centering.grade({front_lr:55}), ServerError);
  assert.equal(calls, 3);
});
