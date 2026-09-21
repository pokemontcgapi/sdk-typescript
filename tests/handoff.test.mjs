import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toApiError, PokemonTcgApiError, QuotaExceededError } from '../dist/index.js';

test('il rifiuto mantiene classe, status e dettagli ed espone il passaggio umano', () => {
  const next_step = {
    action: 'subscribe', actor: 'account_owner', plans_url: 'https://example.test/pricing',
    checkout_url: 'https://example.test/subscribe?plan=custom&interval=monthly',
    handoff: 'The account owner needs to open https://example.test/subscribe?plan=custom&interval=monthly.',
  };
  const error = toApiError(429, { code: 'QUOTA_EXCEEDED', message: 'Exhausted', details: { quota_limit: 800, next_step } });
  assert.ok(error instanceof PokemonTcgApiError);
  assert.ok(error instanceof QuotaExceededError);
  assert.equal(error.status, 429);
  assert.equal(error.details?.['quota_limit'], 800);
  assert.equal(error.nextStep, next_step);
  assert.equal(error.handoff, next_step.handoff);
  assert.equal(error.checkoutUrl, next_step.checkout_url);
});

test('senza blocco, o con blocco malformato, gli accessor non inventano dati', () => {
  for (const next_step of [undefined, null, 'wrong', {}, { action: 'pay', actor: 'agent' }]) {
    const error = toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: { next_step } });
    assert.equal(error.nextStep, undefined);
    assert.equal(error.checkoutUrl, undefined);
    assert.equal(error.actionUrl, undefined);
    assert.equal(error.handoff, undefined);
  }
});

test('verifica e contatto non espongono un checkout', () => {
  for (const action of ['verify_email', 'contact_support', 'contact_sales']) {
    const error = toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: {
      next_step: { action, actor: 'account_owner', plans_url: 'https://example.test/pricing', handoff: 'Contact the owner.' },
    } });
    assert.equal(error.nextStep?.action, action);
    assert.equal(error.checkoutUrl, undefined);
    assert.equal(error.actionUrl, undefined);
  }
});

for (const [action, field, url] of [
  ['subscribe', 'checkout_url', 'https://example.test/subscribe?plan=developer&interval=monthly'],
  ['upgrade', 'manage_url', 'https://example.test/account'],
  ['verify_email', 'verify_url', 'https://example.test/account'],
  ['contact_sales', 'contact_url', 'mailto:sales@example.test'],
  ['contact_support', 'contact_url', 'mailto:support@example.test'],
]) {
  test(`actionUrl restituisce l'URL per ${action}`, () => {
    const next_step = { action, actor: 'account_owner', plans_url: 'https://example.test/pricing', handoff: 'Contact the owner.', [field]: url };
    const error = toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: { next_step } });
    assert.equal(error.actionUrl, url);
    assert.equal(error.checkoutUrl, action === 'subscribe' ? url : undefined);
    const malformed = toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: {
      next_step: { ...next_step, [field]: 123 },
    } });
    assert.equal(malformed.actionUrl, undefined);
  });
}
