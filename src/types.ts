/**
 * Le forme che l'API restituisce.
 *
 * Sono scritte a mano e non generate, e i campi portano il commento di cio' che
 * contengono DAVVERO: il testo di gioco e' presente solo su una parte del
 * catalogo, e un tipo che promette `attacks: Attack[]` fa scrivere codice che
 * poi non gira mai. `| null` non basta a dirlo: il commento sopra il campo si',
 * ed e' quello che si legge nell'editor.
 */

// Gli otto locali con righe in tabella, misurati il 2026-09-16: en 57.421,
// fr 42.858, de 42.604, ja 27.230, it 21.644, es 21.003, pt 13.822, zh 3.492.
// L'API ne accetta nove, ma `ko` ha zero righe e un tipo non promette cio' che
// non esiste.
export type Locale = 'en' | 'fr' | 'de' | 'ja' | 'it' | 'es' | 'pt' | 'zh';

/**
 * Regione di stampa. `KR` esiste nello schema del server ma al 2026-08-27 non
 * corrisponde ad alcun set: filtrarci sopra restituisce una pagina vuota, non
 * un errore.
 */
export type PrintRegion = 'WEST' | 'JP' | 'CN' | 'KR';

export type PriceSource =
  | 'TCGPLAYER'
  | 'PRICECHARTING'
  | 'CARDMARKET'
  | 'CARDTRADER'
  /** Vendite concluse su eBay. `EBAY_SOLD` non e' mai esistito: il valore ammesso e' `EBAY`. */
  | 'EBAY'
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
  /**
   * Il numero, con la sua valuta nel campo fratello.
   *
   * Si chiamava `price` qui dentro mentre l'API risponde `amount` da quando le
   * righe prezzo sono state riscritte: chi leggeva `quote.price` otteneva
   * `undefined` con il compilatore che gli prometteva un `number`. Nessuno se
   * ne era accorto perche' sulla prova l'array `quotes` torna vuoto.
   */
  readonly amount: number;
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
  readonly level: string | null;
  readonly evolves_from: string | null;
  readonly evolves_to: readonly string[] | null;
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

  /**
   * Indice composito in euro. Sulla carta singola c'e' sempre; sulle righe di
   * una lista o di un batch SOLO con `include: ['index']` (1 credito ogni 50
   * carte). Senza, il campo non arriva e `meta.withheld` contiene `"index"`.
   */
  readonly index_eur?: number | null;
  readonly last_price_at?: string | null;

  readonly tcgplayer_id: number | null;
  readonly cardmarket_id: number | null;
  /** La stampa giapponese della stessa carta, dove l'abbinamento e' noto. */
  readonly jp_twin_id: string | null;

  readonly row_version: number;
  readonly created_at: string;
  readonly updated_at: string;

  // ── relazioni, solo con ?include= ─────────────────────────────────────────
  readonly prices?: readonly Price[];
  readonly images?: readonly CardImage[];
  readonly translations?: readonly Translation[];
  readonly set?: CardSet;
  readonly artist?: Artist;

  // ── testo di gioco ───────────────────────────────────────────────────────
  // Presente in inglese sulle stampe occidentali e in modo disomogeneo: gli
  // attacchi su circa un terzo del catalogo, niente sulle stampe giapponesi e
  // cinesi. `null` significa "dato non tenuto", mai "la carta non ha attacchi".
  readonly attacks: unknown[] | null;
  readonly abilities: unknown[] | null;
  readonly weaknesses: unknown[] | null;
  readonly resistances: unknown[] | null;
  readonly subtypes: readonly string[];
  readonly retreat_cost: readonly string[];
  readonly converted_retreat_cost: number | null;
  readonly rules: readonly string[];
  readonly flavor_text: string | null;
  readonly types: readonly string[];
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
  /** Solo su `artists.get()`: la ricerca gia' scritta delle sue carte. */
  readonly links?: { readonly cards?: string };
}

export interface CatalogStatus {
  readonly status: string;
  readonly catalog: {
    readonly sets: number;
    readonly cards: number;
    readonly sealed: number;
    readonly artists: number;
  };
  readonly sources: readonly {
    readonly source: string;
    readonly last_success_at: string | null;
    readonly age_hours: number | null;
    /** `fresh`, `stale`, `critical` o `never_run`. */
    readonly state: string;
  }[];
  readonly upstream: { readonly contract_ok: boolean; readonly error: string | null };
  readonly version: string;
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
  /**
   * Cio' che la risposta ha tenuto fuori: `"index"` quando `select` nomina
   * `index_eur` senza `include: ['index']`, o le righe prezzo che il piano non
   * copre con `include: ['prices']`.
   */
  readonly withheld?: readonly string[];
}

export interface Collection<T> {
  readonly data: readonly T[];
  readonly meta: CollectionMeta;
  readonly links?: { readonly next?: string };
}

export interface MissingCard {
  readonly id: string;
  /** Present only for an existing historical alias in a different canonical set. */
  readonly suggested_id?: string;
}

export interface BatchResult<T> {
  readonly data: readonly T[];
  readonly requested: number;
  readonly found: number;
  /** Absent when every requested id resolves; repeated ids appear once. */
  readonly missing?: readonly MissingCard[];
  readonly withheld?: readonly string[];
}

// ── parametri ───────────────────────────────────────────────────────────────

export type CardInclude = 'index' | 'prices' | 'translations' | 'images' | 'set' | 'artist';

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
  /** Uno o piu' set per codice, slug o id alternativo, al posto di `q=set.id:...`. */
  readonly set?: string | readonly string[];
}

export interface SetListParams extends ListParams {
  readonly region?: PrintRegion;
  readonly series?: string;
  readonly lang?: Locale;
}

// ── serie e sigillati ───────────────────────────────────────────────────────

export interface Series {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly set_count: number;
}

export interface SealedProduct {
  readonly id: string;
  readonly sku: string;
  readonly slug: string;
  readonly name: string;
  /** `BOOSTER_BOX` e simili. */
  readonly kind: string;
  readonly set_code: string | null;
  readonly set_name: string | null;
  readonly image_url: string | null;
  readonly release_date: string | null;
  readonly pack_count: number | null;
  readonly languages: readonly string[];
  /** Sulle liste solo con `include: ['index']`; sul prodotto singolo sempre. */
  readonly index_eur?: number | null;
  readonly last_price_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SealedListParams {
  readonly q?: string;
  readonly set?: string | readonly string[];
  readonly kind?: string;
  readonly lang?: Locale;
  readonly include?: readonly 'index'[] | 'index';
  readonly orderBy?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

// ── prezzi ──────────────────────────────────────────────────────────────────

export interface PriceIndex {
  readonly eur: number;
  readonly as_of: string;
  readonly sample_n: number | null;
  /** Una serie per (lingua, stampa): l'indice di testa e' quello inglese. */
  readonly by_locale: readonly {
    readonly locale: string;
    readonly printing: string | null;
    readonly eur: number;
    readonly as_of: string;
    readonly sample_n: number | null;
  }[];
}

export interface PriceFilterParams {
  readonly source?: PriceSource | string;
  readonly variant?: string;
  readonly locale?: Locale | string;
}

export interface CardPrices {
  readonly card_id: string;
  readonly index: PriceIndex | null;
  readonly quotes: readonly Price[];
}

export interface SealedPrices {
  readonly sealed_id: string;
  readonly index: PriceIndex | null;
  readonly quotes: readonly Price[];
}

export interface PricesResponse<T> {
  readonly data: T;
  readonly meta: {
    readonly quotes: number;
    readonly delayed_hours: number;
    /** Le righe che il piano non copre: `graded`, `non_english_locales`. Assente se niente e' trattenuto. */
    readonly withheld?: readonly string[];
  };
}

export interface HistoryParams extends PriceFilterParams {
  readonly printing?: string;
  /** `YYYY-MM-DD`. Una finestra piu' larga del piano da' `UpgradeRequiredError`. */
  readonly from?: string;
  readonly to?: string;
  readonly bucket?: 'day' | 'week' | 'month';
}

export interface HistoryPoint {
  readonly date: string;
  readonly source: PriceSource | string;
  readonly variant: string;
  readonly locale: string | null;
  readonly printing: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly sample_n: number | null;
}

export interface HistoryResponse {
  readonly data: readonly HistoryPoint[];
  readonly meta: {
    readonly card_id: string;
    readonly from: string;
    readonly to: string;
    readonly bucket: string;
    readonly count: number;
    readonly truncated: boolean;
    readonly capped: boolean;
    /** `null` quando il piano da' la storia intera. */
    readonly plan_window_days: number | null;
  };
}

export interface PriceStats {
  readonly window: string;
  readonly from: string;
  readonly to: string;
  readonly low: number | null;
  readonly high: number | null;
  readonly median: number | null;
  readonly first: number | null;
  readonly last: number | null;
  readonly change_pct: number | null;
  readonly sample_n: number;
  readonly currency: string;
}

export interface StatsResponse {
  readonly data: PriceStats;
  readonly meta: { readonly card_id: string; readonly source: string };
}

export interface MoversParams {
  readonly window?: string;
  readonly direction?: 'gainers' | 'losers';
  /** Valore minimo in euro, per tenere fuori le carte da pochi centesimi. */
  readonly min_value?: number;
  readonly locale?: Locale | string;
  /** 1..50. */
  readonly limit?: number;
}

export interface Mover {
  readonly card_id: string;
  readonly name: string;
  readonly set_code: string;
  readonly from: number;
  readonly to: number;
  readonly change_pct: number;
  readonly currency: string;
}

export interface MoversResponse {
  readonly data: readonly Mover[];
  readonly meta: {
    readonly window: string;
    readonly from: string;
    readonly to: string;
    readonly direction: string;
    readonly min_value: number;
    readonly count: number;
    readonly source: string;
  };
}

export interface PriceSourceInfo {
  readonly source: PriceSource | string;
  readonly label: string;
  readonly min_delay_hours: number;
  readonly is_own: boolean;
}

// ── feed incrementale ───────────────────────────────────────────────────────

export interface Change {
  readonly id: number;
  /** `SET`, `CARD`, ...: l'elenco vero e' `change_kinds` in `/v1/reference`. */
  readonly kind: string;
  readonly entity_id: string;
  readonly op: string;
  readonly version: number;
  readonly changed_at: string;
}

export interface ChangesParams {
  /** L'ultimo `next_since` ricevuto. Assente = dall'inizio disponibile. */
  readonly since?: number;
  readonly kind?: string;
  readonly limit?: number;
}

export interface ChangesResponse {
  readonly data: readonly Change[];
  readonly meta: {
    readonly count: number;
    readonly has_more: boolean;
    /** Da salvare e rimandare come `since`: il feed non ha altro stato. */
    readonly next_since: number;
    readonly watermark: number;
    readonly oldest_available: number;
    readonly behind: number;
  };
  readonly links?: { readonly next?: string };
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
