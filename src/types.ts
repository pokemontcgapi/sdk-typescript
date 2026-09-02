/**
 * Le forme che l'API restituisce.
 *
 * Sono scritte a mano e non generate, e i campi portano il commento di cio' che
 * contengono DAVVERO: al 2026-08-27 una parte dell'oggetto carta e' modellata
 * ma vuota su tutto il catalogo, e un tipo che promette `attacks: Attack[]`
 * fa scrivere codice che poi non gira mai. `| null` non basta a dirlo: il
 * commento sopra il campo si', ed e' quello che si legge nell'editor.
 *
 * Regola: quando l'API smette di essere vuota su un campo, si toglie la nota.
 * Non prima.
 */

export type Locale = 'en' | 'ja' | 'fr' | 'de' | 'es' | 'it';

/**
 * Regione di stampa. `KR` esiste nello schema del server ma al 2026-08-27 non
 * corrisponde ad alcun set: filtrarci sopra restituisce una pagina vuota, non
 * un errore.
 */
export type PrintRegion = 'WEST' | 'JP' | 'CN' | 'KR';

export type PriceSource =
  | 'TCGPLAYER'
  | 'CARDMARKET'
  | 'CARDTRADER'
  /** Vendite concluse su eBay, aggregate da PriceCharting (che resta nominato in `provenance`). */
  | 'EBAY_SOLD'
  | 'PTCG_INDEX'
  | 'COMMUNITY';

/** `DERIVED` e' calcolato da noi; `GUIDE` e' un valore pubblicato a monte. */
export type PriceBasis = 'GUIDE' | 'DERIVED' | 'SOLD' | 'ASKING';

export interface Grading {
  readonly company: string;
  readonly score: string;
}

export interface Price {
  readonly source: PriceSource | string;
  readonly variant: string;
  readonly basis: PriceBasis | string;
  readonly price: number;
  readonly currency: string;
  readonly locale: string | null;
  readonly condition: string | null;
  readonly printing: string | null;
  readonly grading: Grading | null;
  /** Giorno a cui l'osservazione si riferisce. Mai oggi: ogni fonte esce in ritardo. */
  readonly as_of: string;
  /** Quante osservazioni ci sono dietro, dove la fonte lo dice. */
  readonly sample_n: number | null;
  /** Stringa di attribuzione da mostrare accanto al numero. */
  readonly provenance: string;
}

export interface CardImage {
  readonly face: string;
  readonly size: string;
  readonly locale: string | null;
  readonly url: string;
  readonly image_source: string | null;
  /** Modellate ma non popolate: usa il rapporto 5:7 per riservare lo spazio. */
  readonly width: number | null;
  readonly height: number | null;
}

export interface Translation {
  readonly locale: Locale | string;
  readonly name: string;
}

export interface Card {
  readonly id: string;
  /** Identificatore alternativo nella stessa forma. Risolve sulla stessa rotta. */
  readonly legacy_id: string | null;
  readonly name: string;
  readonly number: string;
  readonly number_sort: number | null;
  readonly supertype: string | null;
  readonly hp: number | null;
  readonly rarity: string | null;
  readonly regulation_mark: string | null;

  readonly set_code: string;
  readonly set_name: string;
  readonly set_total: number | null;
  readonly ptcgo_code: string | null;
  readonly series: string | null;
  readonly release_date: string | null;
  readonly print_region: PrintRegion | string;

  readonly artist_name: string | null;
  readonly artist_slug: string | null;

  /** Indice composito in euro, gia' sulla riga: niente seconda chiamata per una lista. */
  readonly index_eur: number | null;
  readonly last_price_at: string | null;

  readonly tcgplayer_id: number | null;
  readonly cardmarket_id: number | null;

  readonly row_version: number;
  readonly created_at: string;
  readonly updated_at: string;

  // ── relazioni, solo con ?include= ─────────────────────────────────────────
  readonly prices?: readonly Price[];
  readonly images?: readonly CardImage[];
  readonly translations?: readonly Translation[];
  readonly set?: CardSet;

  // ── campi modellati e OGGI VUOTI su tutto il catalogo ─────────────────────
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly attacks: unknown[] | null;
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly abilities: unknown[] | null;
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly weaknesses: unknown[] | null;
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly resistances: unknown[] | null;
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly subtypes: readonly string[];
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly retreat_cost: readonly string[];
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly rules: readonly string[];
  /** Vuoto su tutto il catalogo al 2026-08-27. */
  readonly flavor_text: string | null;
  /** Popolato solo su parte dell'era Scarlet & Violet. */
  readonly types: readonly string[];
  /** Popolato solo su parte dell'era Scarlet & Violet. */
  readonly national_pokedex_numbers: readonly number[];
}

export interface CardSet {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly legacy_id: string | null;
  readonly name: string;
  readonly series: string | null;
  readonly region: PrintRegion | string;
  readonly release_date: string | null;
  readonly total: number | null;
  readonly printed_total: number | null;
  readonly ptcgo_code: string | null;
  readonly symbol_url: string | null;
  readonly logo_url: string | null;
  readonly updated_at?: string;
}

export interface Artist {
  readonly slug: string;
  readonly name: string;
  readonly card_count: number;
}

export interface CatalogStatus {
  readonly status: string;
  readonly catalog: { readonly sets: number; readonly cards: number; readonly sealed: number };
  readonly sources: readonly {
    readonly source: string;
    readonly last_success_at: string | null;
    readonly age_hours: number | null;
    readonly status: string;
  }[];
}

export interface Health {
  readonly status: string;
  readonly db: boolean;
  readonly uptime_s: number;
  readonly version: string;
}

// ── envelope ────────────────────────────────────────────────────────────────

export interface CollectionMeta {
  readonly limit: number;
  readonly count: number;
  readonly total_count?: number;
  readonly has_more: boolean;
}

export interface Collection<T> {
  readonly data: readonly T[];
  readonly meta: CollectionMeta;
  readonly links?: { readonly next?: string };
}

export interface BatchResult<T> {
  readonly data: readonly T[];
  readonly requested: number;
  readonly found: number;
}

// ── parametri ───────────────────────────────────────────────────────────────

export type CardInclude = 'prices' | 'legalities' | 'translations' | 'images' | 'set' | 'artist';

export interface ListParams {
  /**
   * Grammatica di ricerca. **I nomi dei campi sono camelCase e puntati**
   * (`set.code`, `nationalPokedexNumbers`) mentre le chiavi della risposta sono
   * snake_case (`set_code`). Non e' un refuso: sono due vocabolari diversi, e
   * scriverne uno al posto dell'altro produce un 400 con la lista dei validi.
   */
  readonly q?: string;
  readonly select?: readonly string[] | string;
  readonly orderBy?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CardListParams extends ListParams {
  readonly include?: readonly CardInclude[] | string;
  /** Sostituisce `name` con il nome nella lingua chiesta; ripiega su `en`. */
  readonly lang?: Locale;
  /** Codice del set, come scorciatoia al posto di `q=set.code:...`. */
  readonly set?: string;
}

export interface SetListParams extends ListParams {
  readonly region?: PrintRegion;
  readonly series?: string;
}

// ── riconoscimento da foto ──────────────────────────────────────────────────

/**
 * Quanto ci si puo' fidare della classifica.
 *
 * `ambiguous` non e' un fallimento: e' il caso normale sulle ristampe, dove due
 * stampe condividono l'illustrazione e dall'immagine sola non sono
 * distinguibili. Un client che tratta `ambiguous` come `no_match` butta via la
 * risposta giusta; uno che lo tratta come `match` consegna la stampa sbagliata.
 */
export type VisionDecision = 'match' | 'ambiguous' | 'no_match';

export interface VisionCandidate {
  readonly id: string;
  readonly name: string;
  readonly number: string;
  readonly set: { readonly code: string; readonly name: string; readonly print_region: PrintRegion };
  readonly rarity: string | null;
  readonly image_url: string | null;
  /**
   * Distanza di Hamming, 0..512. E' il numero su cui tarare una soglia propria:
   * le corrispondenze reali stanno sotto 150 anche su una foto rumorosa, e
   * niente sopra 170 viene restituito.
   */
  readonly distance: number;
  /** La stessa informazione riscalata in 0..1. Comoda, non piu' informativa. */
  readonly confidence: number;
}

export interface VisionResult {
  readonly decision: VisionDecision;
  /** Valorizzato SOLO quando `decision` e' `match`. Altrimenti `null`. */
  readonly id: string | null;
  readonly candidates: readonly VisionCandidate[];
}

export interface VisionMeta {
  readonly count: number;
  readonly cards_indexed: number;
  readonly index_built_at: string;
  readonly signature_version: number;
  /**
   * Quanti quadrilateri simili a una carta sono stati isolati nella foto. Zero
   * con un `no_match` significa "la carta non e' stata trovata nell'immagine",
   * non "non e' in catalogo": e' un problema di inquadratura, e sono due
   * consigli diversi da dare all'utente.
   */
  readonly regions_detected: number;
  readonly hypotheses_tried: number;
  readonly elapsed_ms: number;
}

export interface VisionResponse {
  readonly data: VisionResult;
  readonly meta: VisionMeta;
}

export interface IdentifyOptions {
  /** Quanti candidati, 1..10. */
  readonly topK?: number;
  /** Restringe a un set. E' l'indizio che risolve una ristampa. */
  readonly set?: string;
  /** Restringe a una regione di stampa. Stesso scopo. */
  readonly region?: PrintRegion;
}
