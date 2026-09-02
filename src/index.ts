import { HttpClient, Page, type ClientOptions } from './client.js';
import type {
  Artist,
  BatchResult,
  Card,
  CardInclude,
  CardListParams,
  CardSet,
  CatalogStatus,
  Collection,
  Health,
  IdentifyOptions,
  ListParams,
  Locale,
  SetListParams,
  VisionResponse,
} from './types.js';

export * from './errors.js';
export * from './types.js';
export { Page } from './client.js';
export type { ClientOptions } from './client.js';

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
  readonly reference: ReferenceResource;
  readonly vision: VisionResource;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.cards = new CardsResource(this.http);
    this.sets = new SetsResource(this.http);
    this.artists = new ArtistsResource(this.http);
    this.reference = new ReferenceResource(this.http);
    this.vision = new VisionResource(this.http);
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
   * La risposta porta `requested` e `found`: gli id che non esistono vengono
   * semplicemente omessi da `data`, non segnalati uno per uno. Confrontare i due
   * numeri e' l'unico modo di accorgersene, quindi il tipo li espone entrambi.
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
  get(code: string): Promise<CardSet> {
    return this.http.get<CardSet>(`/v1/sets/${encodeURIComponent(code)}`);
  }

  /** Le carte di un set, in ordine di collezione. */
  async cards(code: string, params: CardListParams = {}): Promise<Page<Card>> {
    const body = await this.http.get<Collection<Card>>(`/v1/sets/${encodeURIComponent(code)}/cards`, { ...params });
    return new Page(this.http, body);
  }
}

class ArtistsResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: ListParams = {}): Promise<Page<Artist>> {
    const body = await this.http.get<Collection<Artist>>('/v1/artists', { ...params });
    return new Page(this.http, body);
  }

  get(slug: string): Promise<Artist> {
    return this.http.get<Artist>(`/v1/artists/${encodeURIComponent(slug)}`);
  }
}

/**
 * I vocabolari chiusi, per popolare i filtri di una UI senza indovinare le
 * stringhe.
 *
 * `subtypes()` oggi torna una lista VUOTA: la colonna esiste ma non e'
 * popolata su nessuna carta. Il metodo resta perche' il giorno in cui lo sara'
 * non serve una nuova versione dell'SDK — ma non costruirci sopra una UI che
 * assume almeno un elemento.
 */
class ReferenceResource {
  constructor(private readonly http: HttpClient) {}

  private async list(path: string): Promise<readonly string[]> {
    const body = await this.http.get<{ data: readonly string[] }>(path);
    return body.data;
  }

  types(): Promise<readonly string[]> {
    return this.list('/v1/types');
  }

  /** Vuoto al 2026-08-27. Vedi la nota sulla classe. */
  subtypes(): Promise<readonly string[]> {
    return this.list('/v1/subtypes');
  }

  supertypes(): Promise<readonly string[]> {
    return this.list('/v1/supertypes');
  }

  rarities(): Promise<readonly string[]> {
    return this.list('/v1/rarities');
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
