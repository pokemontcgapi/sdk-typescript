# @pokemontcgapi/sdk

TypeScript client for the Pokémon TCG API at [pokemontcgapi.com](https://pokemontcgapi.com) —
**615 sets and 52,337 cards** across three print regions (379 Japanese, 176 international, 60
Simplified Chinese), card names in six languages, 399 illustrators, images, and prices that state
their source, basis, grade and sample size.

**Zero runtime dependencies.** Uses the global `fetch`, so it runs unchanged on Node ≥ 20, Bun, Deno,
Cloudflare Workers and in the browser.

Unofficial. Not produced, endorsed, supported by or affiliated with Nintendo, Creatures Inc.,
GAME FREAK inc. or The Pokémon Company International. Pokémon and all related marks are trademarks of
their respective owners.

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
// bs-4 Charizard 561.84
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
Locales: `en`, `ja`, `fr`, `de`, `es`, `it`.

### Conditional requests are free

```ts
const client = new PokemonTcgApi({ cache: 'etag' });
```

Every collection carries a strong ETag. With the cache on, the client stores it and replays a `304`
without a body — no quota consumed. A mirror that re-syncs often pays only for what changed.

### A photo instead of an id

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
- **No card game text.** `attacks`, `abilities`, `weaknesses`, `resistances`, `subtypes`,
  `retreat_cost`, `rules`, `flavor_text` and `legalities` are empty for every card; `types` and
  `national_pokedex_numbers` are populated only on part of the Scarlet & Violet era. The types in
  this package say so on each field. If you are building a deck checker or a rules engine, this is
  not the data source you need.

What it does have: the printing itself — set, number, rarity, region, release date, illustrator,
image, marketplace ids, six-language names — and prices.

## Prices

```ts
const card = await client.cards.get('base1-4', { include: ['prices'] });
for (const price of card.prices ?? []) {
  console.log(price.source, price.basis, price.price, price.currency, price.as_of, price.sample_n);
}
```

There is no printing filter: first edition, holofoil and graded rows come back together, so read
`printing`, `condition` and `grading` per row. `basis` separates `GUIDE` (published upstream) from
`DERIVED` (computed by us). `PTCG_INDEX` is a composite index in EUR carrying `sample_n`, and it is
also on every card row as `index_eur`, so a list already has a comparable number without a second
request per card.

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
