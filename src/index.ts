import { HttpClient, Page, type ClientOptions, type ResponseInfo } from './client.js';
import type {
  Artist,
  BatchResult,
  Card,
  CardInclude,
  CardListParams,
  CardPrices,
  CardSet,
  CatalogStatus,
  ChangesParams,
  ChangesResponse,
  Collection,
  Health,
  HistoryParams,
  HistoryResponse,
  IdentifyOptions,
  ListParams,
  Locale,
  MoversParams,
  MoversResponse,
  PriceFilterParams,
  PriceSourceInfo,
  PricesResponse,
  SealedListParams,
  SealedPrices,
  SealedProduct,
  Series,
  SetListParams,
  StatsResponse,
  VisionResponse,
} from './types.js';

export * from './errors.js';
export * from './types.js';
export { Page } from './client.js';
export type { ClientOptions, ResponseInfo } from './client.js';

/**
 * Client di pokemontcgapi.com.
 *
 * Le risorse rispecchiano i path (`client.cards.get`, `client.sets.cards`) cosi'
 * che passare dalla documentazione al codice non richieda una tabella di
 * conversione. Ogni metodo di lista torna una `Page`, che e' anche un
 * `AsyncIterable`: si itera e la paginazione sparisce.
 *
 * ```ts
 * const client = new PokemonTcgApi({ apiKey: process.env.PTCG_API_KEY });
 *
 * const card = await client.cards.get('base1-4', { include: ['prices'] });
 * console.log(card.name, card.index_eur);
 *
 * for await (const set of client.sets.list({ region: 'JP' })) {
 *   console.log(set.code, set.name, set.release_date);
 * }
 * ```
 */
export class PokemonTcgApi {
  private readonly http: HttpClient;

  readonly cards: CardsResource;
  readonly sets: SetsResource;
  readonly artists: ArtistsResource;
  readonly series: SeriesResource;
  readonly sealed: SealedResource;
  readonly prices: PricesResource;
  readonly reference: ReferenceResource;
  readonly vision: VisionResource;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.cards = new CardsResource(this.http);
    this.sets = new SetsResource(this.http);
    this.artists = new ArtistsResource(this.http);
    this.series = new SeriesResource(this.http);
    this.sealed = new SealedResource(this.http);
    this.prices = new PricesResource(this.http);
    this.reference = new ReferenceResource(this.http);
    this.vision = new VisionResource(this.http);
  }

  /**
   * Gli header dell'ultima risposta: crediti scalati, quota rimasta e cio' che
   * il piano ha trattenuto (`planWithheld`). Con richieste concorrenti e'
   * l'ultima arrivata: per contarle tutte si usa `onResponse` nelle opzioni.
   */
  get lastResponse(): ResponseInfo | null {
    return this.http.lastResponse;
  }

  /**
   * Il feed incrementale: cosa e' cambiato dopo `since`. Si salva
   * `meta.next_since` e lo si rimanda alla chiamata dopo.
   */
  changes(params: ChangesParams = {}): Promise<ChangesResponse> {
    return this.http.get<ChangesResponse>('/v1/changes', { ...params });
  }

  /** Conteggi di catalogo e freschezza per fonte. */
  status(): Promise<CatalogStatus> {
    return this.http.get<CatalogStatus>('/v1/status');
  }

  /** Liveness. Separato da `status()`: un ingest fermo non e' un servizio giu'. */
  health(): Promise<Health> {
    return this.http.get<Health>('/v1/health');
  }
}

class CardsResource {
  constructor(private readonly http: HttpClient) {}

  /** Ricerca sul catalogo. Torna la prima pagina, iterabile fino in fondo. */
  async search(params: CardListParams = {}): Promise<Page<Card>> {
    const body = await this.http.get<Collection<Card>>('/v1/cards', { ...params });
    return new Page(this.http, body);
  }

  /** Una carta per id. Accetta sia l'id nostro sia l'id alternativo. */
  get(
    id: string,
    params: { select?: readonly string[]; include?: readonly CardInclude[]; lang?: Locale } = {},
  ): Promise<Card> {
    return this.http.get<Card>(`/v1/cards/${encodeURIComponent(id)}`, { ...params });
  }

  /**
   * Fino a 100 id in una richiesta.
   *
   * La risposta porta `requested` e `found`, e quando qualcosa non si risolve
   * anche `missing`: un elemento per id, con `suggested_id` dove l'id e' un
   * alias storico di una carta che oggi sta in un altro set.
   */
  batch(
    ids: readonly string[],
    params: { select?: readonly string[]; include?: readonly CardInclude[]; lang?: Locale } = {},
  ): Promise<BatchResult<Card>> {
    if (ids.length === 0) return Promise.resolve({ data: [], requested: 0, found: 0 });
    if (ids.length > 100) {
      throw new RangeError(`batch() accepts at most 100 ids, received ${ids.length}. Chunk the list.`);
    }
    return this.http.get<BatchResult<Card>>('/v1/cards/batch', { ids, ...params });
  }
}

class SetsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Elenco dei set. `region` e' il filtro che vale la pena conoscere: `JP`
   * restituisce le uscite giapponesi, che sono la parte piu' grande del
   * catalogo e non sono traduzioni di quelle occidentali.
   */
  async list(params: SetListParams = {}): Promise<Page<CardSet>> {
    const body = await this.http.get<Collection<CardSet>>('/v1/sets', { ...params });
    return new Page(this.http, body);
  }

  /** Un set per codice, slug o id alternativo. */
  get(code: string, params: { lang?: Locale } = {}): Promise<CardSet> {
    return this.http.get<CardSet>(`/v1/sets/${encodeURIComponent(code)}`, { ...params });
  }

  /** Le carte di un set, in ordine di collezione. */
  async cards(code: string, params: Omit<CardListParams, 'set'> = {}): Promise<Page<Card>> {
    const body = await this.http.get<Collection<Card>>(`/v1/sets/${encodeURIComponent(code)}/cards`, { ...params });
    return new Page(this.http, body);
  }
}

class ArtistsResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: Omit<ListParams, 'select'> = {}): Promise<Page<Artist>> {
    const body = await this.http.get<Collection<Artist>>('/v1/artists', { ...params });
    return new Page(this.http, body);
  }

  get(slug: string): Promise<Artist> {
    return this.http.get<Artist>(`/v1/artists/${encodeURIComponent(slug)}`);
  }
}

class SeriesResource {
  constructor(private readonly http: HttpClient) {}

  /** Le serie (Scarlet & Violet, Sword & Shield, ...) con il numero di set. */
  async list(params: { orderBy?: string; limit?: number; cursor?: string } = {}): Promise<Page<Series>> {
    const body = await this.http.get<Collection<Series>>('/v1/series', { ...params });
    return new Page(this.http, body);
  }
}

/** Prodotti sigillati: booster box, ETB, tin, blister, collezioni. */
class SealedResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: SealedListParams = {}): Promise<Page<SealedProduct>> {
    const body = await this.http.get<Collection<SealedProduct>>('/v1/sealed', { ...params });
    return new Page(this.http, body);
  }

  get(id: string, params: { lang?: Locale } = {}): Promise<SealedProduct> {
    return this.http.get<SealedProduct>(`/v1/sealed/${encodeURIComponent(id)}`, { ...params });
  }

  /** Prezzi correnti di un prodotto. 2 crediti. L'indice composito non copre i sigillati: `index` e' `null`. */
  prices(id: string, params: PriceFilterParams = {}): Promise<PricesResponse<SealedPrices>> {
    return this.http.get<PricesResponse<SealedPrices>>(`/v1/sealed/${encodeURIComponent(id)}/prices`, { ...params });
  }
}

/**
 * Le rotte prezzi dedicate.
 *
 * Ogni riga dice da dove viene (`source`), su cosa poggia (`basis`: venduto,
 * richiesto, guida, derivato) e di che giorno e' (`as_of`). Le righe che il
 * piano non copre mancano dal corpo: `client.lastResponse.planWithheld` dice
 * quali.
 */
class PricesResource {
  constructor(private readonly http: HttpClient) {}

  /** Indice e quotazioni correnti di una carta. 2 crediti. */
  card(id: string, params: PriceFilterParams = {}): Promise<PricesResponse<CardPrices>> {
    return this.http.get<PricesResponse<CardPrices>>(`/v1/cards/${encodeURIComponent(id)}/prices`, { ...params });
  }

  /** Fino a 50 carte in una chiamata, 4 crediti ogni 25. */
  current(ids: readonly string[], params: PriceFilterParams = {}): Promise<BatchResult<CardPrices>> {
    if (ids.length === 0) return Promise.resolve({ data: [], requested: 0, found: 0 });
    if (ids.length > 50) {
      throw new RangeError(`prices.current() accepts at most 50 ids, received ${ids.length}. Chunk the list.`);
    }
    return this.http.get<BatchResult<CardPrices>>('/v1/prices/current', { ids, ...params });
  }

  /**
   * Storia giornaliera. 5 crediti. La finestra dipende dal piano (7 giorni in
   * prova, 30 su Developer, intera da Growth): chiederne una piu' larga da'
   * `UpgradeRequiredError` con `permittedWindow`.
   */
  history(id: string, params: HistoryParams = {}): Promise<HistoryResponse> {
    return this.http.get<HistoryResponse>(`/v1/cards/${encodeURIComponent(id)}/prices/history`, { ...params });
  }

  /** Minimo, massimo, mediana e variazione dell'indice su una finestra. 2 crediti. */
  stats(id: string, params: { window?: string; locale?: Locale | string } = {}): Promise<StatsResponse> {
    return this.http.get<StatsResponse>(`/v1/cards/${encodeURIComponent(id)}/prices/stats`, { ...params });
  }

  /** Le carte che si sono mosse di piu'. 3 crediti, dal piano Growth (`PlanRequiredError` sotto). */
  movers(params: MoversParams = {}): Promise<MoversResponse> {
    return this.http.get<MoversResponse>('/v1/prices/movers', { ...params });
  }

  /** Le fonti, con il ritardo dichiarato di ciascuna. Gratuita. */
  async sources(): Promise<readonly PriceSourceInfo[]> {
    const body = await this.http.get<{ data: readonly PriceSourceInfo[] }>('/v1/prices/sources');
    return body.data;
  }
}

/**
 * I vocabolari, per popolare i filtri di una UI senza indovinare le stringhe.
 *
 * Fino al 2026-09-03 questi quattro metodi chiamavano `/v1/types`,
 * `/v1/subtypes`, `/v1/supertypes` e `/v1/rarities`, che il servizio non ha
 * mai montato: rispondevano 404, e l'SDK prometteva quattro chiamate che non
 * potevano riuscire. Ora leggono `/v1/reference`, che le porta tutte insieme.
 *
 * Una sola richiesta di rete anche chiamandoli tutti e quattro: la risposta e'
 * la stessa e viene memorizzata per la durata dell'istanza del client. Le firme
 * non sono cambiate, quindi chi aveva scritto il codice contro la promessa non
 * deve toccarlo — comincia solo a funzionare.
 */
class ReferenceResource {
  constructor(private readonly http: HttpClient) {}

  private pending: Promise<Record<string, readonly string[]>> | null = null;

  /**
   * Tutti i vocabolari in una volta: oltre ai quattro qui sotto, `locales`,
   * `print_regions`, `conditions`, `printings`, `grading_companies`,
   * `price_variants`, `price_bases`, `change_kinds` e gli altri che
   * `/v1/reference` elenca.
   */
  all(): Promise<Record<string, readonly string[]>> {
    // La promise, non il valore: due chiamate ravvicinate condividono una
    // richiesta sola invece di farne due e tenere l'ultima.
    this.pending ??= this.http
      .get<{ data: Record<string, readonly string[]> }>('/v1/reference')
      .then((body) => body.data);
    return this.pending;
  }

  private async list(key: string): Promise<readonly string[]> {
    const data = await this.all();
    return data[key] ?? [];
  }

  types(): Promise<readonly string[]> {
    return this.list('types');
  }

  subtypes(): Promise<readonly string[]> {
    return this.list('subtypes');
  }

  supertypes(): Promise<readonly string[]> {
    return this.list('supertypes');
  }

  rarities(): Promise<readonly string[]> {
    return this.list('rarities');
  }
}

/**
 * Riconoscimento di una carta da una fotografia.
 *
 * Costa 25 crediti a chiamata contro l'uno di una lettura: e' l'unica rotta che
 * non restituisce una riga ma l'esito del confronto con l'intero indice delle
 * immagini. Vale la pena saperlo prima di metterla in un ciclo.
 */
class VisionResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Manda una foto, ricevi i candidati in ordine.
   *
   * `image` accetta qualunque cosa `FormData` sappia allegare: un `Blob`, un
   * `File` da un `<input capture="environment">`, o un `Uint8Array` che viene
   * avvolto qui.
   *
   * **Leggi `decision` prima di `id`.** `id` e' valorizzato solo su `match`; su
   * `ambiguous` e' `null` di proposito, perche' due stampe della stessa
   * illustrazione dall'immagine sola non sono distinguibili e sceglierne una
   * significa sbagliare meta' delle volte, proprio sulle carte che valgono di
   * piu'. Se il tuo flusso sa da che set viene — chi inventaria una busta
   * appena aperta lo sa — passalo in `set`: e' cio' che scioglie il pareggio.
   *
   * ```ts
   * const { data } = await client.vision.identify(file, { set: 'sv3' });
   * if (data.decision === 'match') add(data.id!);
   * else showPicker(data.candidates);
   * ```
   */
  async identify(
    image: Blob | Uint8Array | ArrayBuffer,
    options: IdentifyOptions = {},
  ): Promise<VisionResponse> {
    const form = new FormData();
    form.set('image', toBlob(image), 'card');
    if (options.topK !== undefined) form.set('top_k', String(options.topK));
    if (options.set !== undefined) form.set('set', options.set);
    if (options.region !== undefined) form.set('region', options.region);

    // Nessun content-type esplicito: il boundary del multipart lo scrive fetch,
    // e impostarlo a mano produce un corpo che il server non riesce a separare.
    return this.http.post<VisionResponse>('/v1/vision/identify', form);
  }
}

/** Porta i byte grezzi in un Blob, lasciando passare cio' che gia' lo e'. */
function toBlob(image: Blob | Uint8Array | ArrayBuffer): Blob {
  if (image instanceof Blob) return image;
  // Il tipo generico e non `image/jpeg`: il formato lo riconosce il server dai
  // magic byte, e dichiarare quello sbagliato sarebbe peggio che tacere.
  return new Blob([image as BlobPart], { type: 'application/octet-stream' });
}

export default PokemonTcgApi;
