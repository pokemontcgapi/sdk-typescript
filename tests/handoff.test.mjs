import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { toApiError, PermissionDeniedError, PokemonTcgApiError, QuotaExceededError } from '../dist/index.js';

function fixture(name) {
  const local = new URL(`./fixtures/${name}.json`, import.meta.url);
  const shared = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(existsSync(local) ? local : shared, 'utf8'));
}

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

test('il consiglio di piano arriva intero, accanto alla consegna, e non cambia la classe', () => {
  const sample = fixture('403-card-allowance-upgrade');
  const error = toApiError(sample.status, sample.body.error);
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, 'CARD_ALLOWANCE_EXCEEDED');
  assert.deepEqual(error.upgrade, sample.body.error.details.upgrade);
  assert.equal(error.upgrade?.plan_code, 'GROWTH');
  assert.equal(error.upgrade?.monthly_cents, 7900);
  assert.equal(error.upgrade?.reason, 'card_allowance');
  assert.equal(error.upgradeUrl, 'https://example.test/subscribe?plan=growth&interval=monthly');
  // Il consiglio non sostituisce la consegna: next_step resta quello di prima.
  assert.equal(error.handoff, sample.body.error.details.next_step.handoff);
});

test('un consiglio assente o malformato non viene ricostruito a pezzi', () => {
  const good = { plan_code: 'GROWTH', plan_name: 'Growth', monthly_cents: 7900, currency: 'EUR', reason: 'credits' };
  for (const upgrade of [undefined, null, 'wrong', {}, { ...good, monthly_cents: '79' }, { ...good, plan_code: 7 }, { ...good, checkout_url: 42 }]) {
    const error = toApiError(429, { code: 'QUOTA_EXCEEDED', message: 'Exhausted', details: { upgrade } });
    assert.equal(error.upgrade, undefined, JSON.stringify(upgrade));
    assert.equal(error.upgradeUrl, undefined);
  }
  const manage = toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: { upgrade: { ...good, manage_url: 'https://example.test/account', role: 'alternative' } } });
  assert.equal(manage.upgradeUrl, 'https://example.test/account');
  assert.equal(manage.upgrade?.role, 'alternative');
  assert.equal(toApiError(403, { code: 'PLAN_REQUIRED', message: 'Denied', details: { upgrade: good } }).upgradeUrl, undefined);
});
