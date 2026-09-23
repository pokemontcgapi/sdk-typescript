# @pokemontcgapi/sdk

[![npm](https://img.shields.io/npm/v/%40pokemontcgapi%2Fsdk)](https://www.npmjs.com/package/@pokemontcgapi/sdk) [![license](https://img.shields.io/npm/l/%40pokemontcgapi%2Fsdk)](./LICENSE) [![CI](https://github.com/pokemontcgapi/sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/pokemontcgapi/sdk-typescript/actions/workflows/ci.yml)

TypeScript client for the Pokémon TCG API at [pokemontcgapi.com](https://pokemontcgapi.com): cards,
sets, illustrators, the reference vocabularies and photo recognition, across three print lines,
international, Japanese and Simplified Chinese, with card names in eight locales, images, and prices
that state their source, basis, grade and sample size. The current counts are live at
[/v1/status](https://api.pokemontcgapi.com/v1/status).

**Every data route has a method**: cards, sets, series, artists, sealed products, the dedicated
price routes (current, batch, history, stats, movers, sources), the `/v1/changes` feed, the reference
vocabularies and photo recognition. Account and billing routes (`/v1/me`, keys, checkout) are not
wrapped: they belong to the dashboard.

**Zero runtime dependencies.** Uses the global `fetch`, so it runs unchanged on Node ≥ 20, Bun, Deno,
Cloudflare Workers and in the browser.

Unofficial. Not produced, endorsed, supported by or affiliated with Nintendo, Creatures Inc.,
GAME FREAK inc. or The Pokémon Company International. Pokémon and all related marks are trademarks of
their respective owners.

## Get a key

Generate the Idempotency-Key once per signup and keep it with the request body:

```bash
IDEM=$(uuidgen)
```

```bash
curl -s -X POST "https://api.pokemontcgapi.com/v1/accounts/free" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" \
  -d '{"email":"you@example.com"}'
```

Lost the response? Repeat the exact same request (same Idempotency-Key, same body byte for byte, same network: same public IPv4 or the same IPv6 /64) within 24 hours and the response comes back, if stored, secret included; it is the original response, so a key rotated or revoked since then is not revived. A new Idempotency-Key for the same email returns 409 ACCOUNT_EXISTS; the same key with a different body returns 409 IDEMPOTENCY_CONFLICT.

We store only a hash of the key; the signup response is kept for 24 hours so the same request can be replayed. Save `data.key.secret` now.

If replay is unavailable, [sign in](https://pokemontcgapi.com/account) and rotate the key, or use /v1/accounts/recover with an already verified email to get a new secret.

The key comes back in `data.key.secret`. Confirming the address we email raises the trial from
80 to 800 credits, and the trial ends 30 days after signup. Paid plans start at 29 EUR a month:
[pricing](https://pokemontcgapi.com/pricing).

## Install

```bash
npm install @pokemontcgapi/sdk
```

## Use

```ts
import { PokemonTcgApi } from '@pokemontcgapi/sdk';

const client = new PokemonTcgApi({ apiKey: process.env.PTCG_API_KEY });

const card = await client.cards.get('base1-4', { include: ['prices'] });
console.log(card.id, card.name, card.index_eur);
// bs-4 Charizard 523.76   ← the index on 16 September 2026; it moves, yours will differ
```

`base1-4` and `bs-4` both resolve: the id is the printed coordinate — set code, dash, collector
number — and the alternate legacy id resolves on the same route, so a catalogue you already have does
not start with a matching problem.

### Pagination that you never have to think about

Every list method returns a `Page`, which is also an `AsyncIterable`. Iterating it follows
`links.next` for you. For an initial import of all cards, use the flat card list so pages fill
across set boundaries:

```ts
for await (const card of await client.cards.search({ limit: 250, orderBy: 'id' })) {
  console.log(card.id, card.name, card.set_code);
}
```

For Japanese cards, add `q: 'set.region:JP'`; for Simplified Chinese cards, use
`q: 'set.region:CN'`. Add `include: ['translations']` when you need localized names;
this keeps the plain catalogue cost. `include: ['index']` and `include: ['prices']`
have different credit costs. `lang` selects a name translation, not a print region.

Use `client.sets.list({ region: 'JP', limit: 250 })` to browse set metadata and
`client.sets.cards('obf', { limit: 250 })` when you need one particular set. For all cards,
the flat list uses fewer requests than a card loop for every set. The
[quickstart](https://pokemontcgapi.com/docs/quickstart#page-the-whole-catalogue) includes dated
measurements, and the [migration guide](https://pokemontcgapi.com/docs/migrate-from-pokemontcg-io)
explains capturing the change feed watermark before an import and keeping the replica current.

The cursor carries a signature of the sort order, so it must never be reconstructed by hand — the SDK
follows the URL the API returned, which is the failure mode this avoids. `.toArray({ max })` requires
an explicit ceiling, because the catalogue is large enough that an unbounded materialisation is a
mistake rather than a choice.

### One call for a hundred cards

```ts
const { data, requested, found, missing } = await client.cards.batch(['sv8-116', 'sv8-100', 'inventato-xyz'], {
  include: ['index'], // index_eur on list and batch rows is opt-in: 1 credit per 50 cards
  select: ['id', 'name', 'index_eur'],
});
```

`missing` is optional: it is absent when every id resolves. Otherwise each unresolved id appears once
as `{ id, suggested_id? }`. A suggestion is included only for an existing historical candidate in a
different canonical set. In this example only `sv8-100` is returned; `sv8-116` suggests `ssp-116`,
and `inventato-xyz` has no suggestion. A canonical set prefix binds the lookup to that set;
`base1-4` still resolves to `bs-4` because `base1` is only a historical alias.

`data` contains distinct cards. Repeated ids count towards `requested` and credits, but do not
repeat rows in `data` or `missing`. Two valid aliases for one card can make `found` smaller than
`requested` with no missing ids. Missing entries ignore case and retain the first spelling and
request order after whitespace trimming. `withheld` remains an optional top-level field.

### Japanese, and the other seven locales

```ts
const page = await client.sets.cards('sv8', { lang: 'ja', limit: 1 });
console.log(page.data[0]?.name); // タマタマ
```

`lang` replaces the `name` field itself and falls back to English where a translation is missing.
Locales, with the rows each one actually has on 16 September 2026: `en` 57,421, `fr` 42,858,
`de` 42,604, `ja` 27,230, `it` 21,644, `es` 21,003, `pt` 13,822, `zh` 3,492. A thin locale answers
mostly in English, because the fallback is per card and not per request.

### Conditional requests are free

```ts
const client = new PokemonTcgApi({ cache: 'etag' });
```

Every collection carries an ETag. We compute it strong, from the body; the edge rewrites it weak with
an encoding suffix when it compresses, so what you receive looks like `W/"…-gzip"` and you send back
exactly that. With the cache on, the client stores it and replays a `304` without a body, and a `304`
consumes no quota. A mirror that re-syncs often pays only for what changed.

### A photo instead of an id

**Included from the Growth plan up.** On a trial or a Developer key the call answers `403
PLAN_REQUIRED` with `details.min_plan`, before reading the image and without spending credits.

```ts
const { data } = await client.vision.identify(file, { set: 'sv3' });

// Read `decision` before `id`. Always.
switch (data.decision) {
  case 'match':
    // One candidate, close, and clear of the next.
    add(data.id!);
    break;
  case 'ambiguous':
    // Two printings share this illustration. `data.id` is null on purpose.
    showPicker(data.candidates);
    break;
  case 'no_match':
    askForABetterPhoto();
}
```

Reprints and regional twins share their artwork, so artwork alone cannot name a printing — not here
and not anywhere. The endpoint returns candidates with a `distance` (0–512, lower is closer; real
matches land well under 150) and refuses to pick when two are within a few bits of each other.
Passing `set` or `region` when your workflow knows them is what resolves the tie.

It costs 25 credits a call against 1 for a lookup: it is the whole image index answering, not a row
being read. Do not put it in a loop.

### Errors you can branch on

```ts
import { NotFoundError, RateLimitedError, QuotaExceededError } from '@pokemontcgapi/sdk';

try {
  await client.cards.get('nope-1');
} catch (error) {
  if (error instanceof NotFoundError) { /* ... */ }
  if (error instanceof RateLimitedError) { /* error.retryAfter */ }
  if (error instanceof QuotaExceededError) { /* retrying will never help */ }
}
```

Every error carries `code`, `status`, `details` and `requestId` — quote the request id in a support
message, it is the only thing that can be looked up. Retries use exponential backoff with full
jitter on 429, 5xx and network failures, honour `Retry-After`, and never retry a quota exhaustion.

Commercial refusals include `details.next_step`, exposed as the typed `err.nextStep`. If `err.nextStep` exists, show `err.nextStep.handoff` and its URL to the account owner verbatim and do not retry. `err.actionUrl` returns the URL for any action: `checkout_url` for subscribe, `manage_url` for upgrade, `verify_url` for email verification, or `contact_url` for sales and support. Show it alongside `err.handoff`. Upgrades point to the account page, where the owner opens the billing portal to change plan. `err.checkoutUrl` remains a shortcut for subscribe only.

```ts
if (err instanceof PokemonTcgApiError && err.nextStep) {
  showToUser(err.nextStep.handoff);
}
```

## What this API does not have

Stated up front so you find out here rather than three days into an integration:

- **No Korean cards.** Zero `KR` sets, zero `ko` translations. Both are modelled in the schema and
  carry no data.
- **Card game text is English, and uneven.** `attacks`, `abilities`, `weaknesses`, `resistances`,
  `subtypes`, `retreat_cost`, `rules` and `flavor_text` carry rows since 3 September 2026, on the
  20,725 Western printings. Measured on 16 September 2026 against 57,450 cards: `attacks` on 29.9% of
  the whole catalogue and 82.9% of the Western part, `subtypes` 35.0%, `abilities` 7.0%.
  Japanese and Chinese printings carry none. The types in this package keep them nullable, so the
  compiler makes you handle the part that is absent.
- **No format legalities.** The card object has no `legalities` field and `include` rejects the
  value with a 400. If you are building a deck checker, this is not the data source you need.

What it does have: the printing itself — set, number, rarity, region, release date, illustrator,
image, marketplace ids, names in eight locales — and prices.

## Prices

```ts
const card = await client.cards.get('base1-4', { include: ['prices'] });
for (const price of card.prices ?? []) {
  console.log(price.source, price.basis, price.amount, price.currency, price.as_of, price.sample_n);
}
```

The dedicated price routes have their own methods, and they are the ones to use when prices are the
point of the call:

```ts
const { data, meta } = await client.prices.card('base1-4');        // index + quotes, 2 credits
const many = await client.prices.current(['base1-4', 'sv3-125']);   // up to 50 ids, 4 credits per 25
const history = await client.prices.history('base1-4', { bucket: 'week' }); // 5 credits
const stats = await client.prices.stats('base1-4', { window: '30d' });      // 2 credits
const movers = await client.prices.movers({ window: '7d', direction: 'gainers' }); // Growth and up
const box = await client.sealed.prices('evolving-skies-booster-box');
```

`history` is bounded by your plan (7 days on the trial, 30 on Developer, everything from Growth): a
wider window throws `UpgradeRequiredError`, whose `permittedWindow` says what you may ask for.
`movers` below Growth throws `PlanRequiredError`, and a trial past its 30 days throws
`TrialExpiredError` on every route that costs credits. Both extend `PermissionDeniedError`.

There is no printing filter on `include: ['prices']`: first edition, holofoil and graded rows come back together, so read
`printing`, `condition` and `grading` per row. `basis` separates `GUIDE` (published upstream) from
`DERIVED` (computed by us). `PTCG_INDEX` is a composite index in EUR carrying `sample_n`, and the same
number sits on the card row as `index_eur` wherever we have enough observations to compute one: 51,636
cards of 57,450 on 16 September 2026, so treat it as nullable. On a list or batch it comes with `include: ['index']`
(1 credit per 50 rows), so a list still has a comparable number without a second request per card.

What your plan withholds is named rather than hidden, but it is named in three different places, so
read the one that matches the call you made:

| call | where the exclusions are |
|---|---|
| `client.prices.card(id)` | `meta.withheld` |
| `client.cards.get(id, { include: ['prices'] })` | the `X-Plan-Withheld` header: `client.lastResponse?.planWithheld` |
| `client.cards.batch(ids, …)` | a top-level `withheld` field |

The values are `graded` and `non_english_locales`: a trial key gets both, Developer keeps `graded`,
and from Growth up nothing is withheld, in which case the field is absent rather than an empty array.
Read it before concluding that a card has no graded observations: it may be your plan, not the
catalogue. Prices also carry their own `locale`, and a card read with `include: ['prices']` returns
every locale your plan allows, so the currency does not tell you the language.

## Credits and quota

Every response says what it cost. The SDK keeps the headers of the last one, and hands each one to
`onResponse` if you want a running total:

```ts
let spent = 0;
const client = new PokemonTcgApi({ onResponse: (r) => { spent += r.creditsCost ?? 0; } });

await client.cards.search({ q: 'name:charizard', include: ['index'] });
console.log(client.lastResponse?.creditsCost, client.lastResponse?.quotaRemaining);
```

The trial is 800 credits, once, for 30 days, with at most 400 spent in a day; `trialExpiresAt` on
the same object says when it ends.

## The change feed

```ts
let since = Number(await store.get('ptcg_since') ?? 0);
for (;;) {
  const page = await client.changes({ since, limit: 500 });
  for (const change of page.data) await apply(change); // kind, entity_id, op, version
  since = page.meta.next_since;
  await store.set('ptcg_since', since);
  if (!page.meta.has_more) break;
}
```

## Also available

- **MCP server** for agents: [`@pokemontcgapi/mcp`](https://www.npmjs.com/package/@pokemontcgapi/mcp) — [source](https://github.com/pokemontcgapi/mcp-server)
- **Docs**: <https://pokemontcgapi.com/docs>
- **Coverage, measured live**: <https://pokemontcgapi.com/coverage>

## Build from source

```bash
npm ci
npm run typecheck
npm run build
```

Node >= 20. `npm test` runs the type-level and unit tests in `tests/`. CI enforces that the
package typechecks and builds on both Node 20 and Node 22, and that `npm pack` produces
the file list the registry is meant to receive.

This package is developed inside the private monorepo that runs
[pokemontcgapi.com](https://pokemontcgapi.com) and mirrored here on each release,
so a merged pull request travels back by hand rather than by merge button. That
is not a reason to send patches elsewhere — open the issue or the PR here, it is
the address that gets read.

## Licence

MIT. Data served by the API carries per-source redistribution terms — see
<https://pokemontcgapi.com/legal/attribution>.
