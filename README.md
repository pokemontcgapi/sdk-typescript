# @pokemontcgapi/sdk

TypeScript client for the Pokémon TCG API at [pokemontcgapi.com](https://pokemontcgapi.com): cards,
sets, illustrators, the reference vocabularies and photo recognition, across three print lines,
international, Japanese and Simplified Chinese, with card names in eight locales, images, and prices
that state their source, basis, grade and sample size. The current counts are live at
[/v1/status](https://api.pokemontcgapi.com/v1/status).

**Sealed products and the `/v1/changes` feed have no client here yet.** The API serves both; this
package does not wrap them, so reach them over plain REST until it does.

**Zero runtime dependencies.** Uses the global `fetch`, so it runs unchanged on Node ≥ 20, Bun, Deno,
Cloudflare Workers and in the browser.

Unofficial. Not produced, endorsed, supported by or affiliated with Nintendo, Creatures Inc.,
GAME FREAK inc. or The Pokémon Company International. Pokémon and all related marks are trademarks of
their respective owners.

## Get a key

One call, no dashboard and no card:

```bash
curl -s -X POST "https://api.pokemontcgapi.com/v1/accounts/free" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email":"you@example.com"}'
```

The key comes back once, in `data.key.secret`. Confirming the address we email raises the trial from
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
`links.next` for you:

```ts
for await (const set of await client.sets.list({ region: 'JP' })) {
  console.log(set.code, set.name, set.release_date);
}
```

The cursor carries a signature of the sort order, so it must never be reconstructed by hand — the SDK
follows the URL the API returned, which is the failure mode this avoids. `.toArray({ max })` requires
an explicit ceiling, because the catalogue is large enough that an unbounded materialisation is a
mistake rather than a choice.

### One call for a hundred cards

```ts
const { data, requested, found } = await client.cards.batch(['bs-4', 'sv3-001'], {
  include: ['index'], // index_eur on list and batch rows is opt-in: 1 credit per 50 cards
  select: ['id', 'name', 'index_eur'],
});
```

Ids that do not exist are omitted rather than reported one by one — compare `requested` with `found`.

### Japanese, and the other five locales

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

## What this API does not have

Stated up front so you find out here rather than three days into an integration:

- **No Korean cards.** Zero `KR` sets, zero `ko` translations. Both are modelled in the schema and
  carry no data.
- **Card game text is English, and uneven.** `attacks`, `abilities`, `weaknesses`, `resistances`,
  `subtypes`, `retreat_cost`, `rules` and `flavor_text` carry rows since 3 September 2026, on the
  20,725 Western printings. Measured on 16 September 2026 against 57,450 cards: `attacks` on 29.9% of
  the whole catalogue and 82.9% of the Western part, `subtypes` 35.0%, `abilities` 7.0%.
  Japanese and Chinese printings carry none. The types in this package keep them nullable and say
  the measured rate on each field, so the compiler makes you handle the half that is absent.
- **No format legalities.** `legalities` is empty for every card. If you are building a deck
  checker, this is still not the data source you need.

What it does have: the printing itself — set, number, rarity, region, release date, illustrator,
image, marketplace ids, six-language names — and prices.

## Prices

```ts
const card = await client.cards.get('base1-4', { include: ['prices'] });
for (const price of card.prices ?? []) {
  console.log(price.source, price.basis, price.amount, price.currency, price.as_of, price.sample_n);
}
```

There is no printing filter: first edition, holofoil and graded rows come back together, so read
`printing`, `condition` and `grading` per row. `basis` separates `GUIDE` (published upstream) from
`DERIVED` (computed by us). `PTCG_INDEX` is a composite index in EUR carrying `sample_n`, and the same
number sits on the card row as `index_eur` wherever we have enough observations to compute one: 51,636
cards of 57,450 on 16 September 2026, so treat it as nullable. On a list or batch it comes with `include: ['index']`
(1 credit per 50 rows), so a list still has a comparable number without a second request per card.

What your plan withholds is named rather than hidden, but it is named in three different places, so
read the one that matches the call you made:

| call | where the exclusions are |
|---|---|
| `GET /v1/cards/{id}/prices` | `meta.withheld` |
| `GET /v1/cards/{id}?include=prices` | the `X-Plan-Withheld` response header |
| `GET /v1/cards/batch` | a top-level `withheld` field |

The values are `graded` and `non_english_locales`: a trial key gets both, Developer keeps `graded`,
and from Growth up nothing is withheld, in which case the field is absent rather than an empty array.
Read it before concluding that a card has no graded observations: it may be your plan, not the
catalogue. Prices also carry their own `locale`, and a card read with `include: ['prices']` returns
every locale your plan allows, so the currency does not tell you the language.

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

Node >= 20. No test suite lives here yet: what CI enforces is that the package
typechecks and builds on both Node 20 and Node 22, and that `npm pack` produces
the file list the registry is meant to receive.

This package is developed inside the private monorepo that runs
[pokemontcgapi.com](https://pokemontcgapi.com) and mirrored here on each release,
so a merged pull request travels back by hand rather than by merge button. That
is not a reason to send patches elsewhere — open the issue or the PR here, it is
the address that gets read.

## Licence

MIT. Data served by the API carries per-source redistribution terms — see
<https://pokemontcgapi.com/legal/attribution>.
