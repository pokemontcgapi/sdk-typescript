import {
  ApiConnectionError,
  ApiTimeoutError,
  PokemonTcgApiError,
  QuotaExceededError,
  RateLimitedError,
  ServerError,
  toApiError,
  type ApiErrorBody,
} from './errors.js';
import type { Collection } from './types.js';

/**
 * Il trasporto.
 *
 * Nessuna dipendenza a runtime: `fetch` globale, che c'e' su Node 20+, Bun,
 * Deno, i Workers e i browser. Un client HTTP portato dentro il pacchetto
 * costerebbe piu' della funzione che sostituisce, e ogni sua CVE diventerebbe
 * nostra.
 */

export interface ClientOptions {
  /** Se assente si legge `PTCG_API_KEY` dall'ambiente, dove esiste. */
  readonly apiKey?: string;
  readonly baseUrl?: string;
  /** Millisecondi per singolo tentativo, non per l'operazione intera. */
  readonly timeout?: number;
  /** Tentativi RIPETUTI, oltre al primo. 0 disattiva. */
  readonly maxRetries?: number;
  /** Iniettabile per i test e per gli ambienti che avvolgono fetch. */
  readonly fetch?: typeof globalThis.fetch;
  /**
   * Ricorda gli ETag e rispedisce `If-None-Match`.
   *
   * Vale la pena accenderlo: un 304 non ha corpo e non consuma quota, quindi
   * un mirror che risincronizza spesso paga solo le pagine cambiate. La cache
   * e' in memoria e per-istanza: non sopravvive al processo, di proposito —
   * una cache su disco dentro un SDK e' una sorgente di bug che il chiamante
   * non puo' ispezionare.
   */
  readonly cache?: 'none' | 'etag';
  readonly userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://api.pokemontcgapi.com';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/** Errore di rete o 5xx/429: e' l'unico insieme su cui riprovare ha senso. */
function isRetryable(error: unknown): boolean {
  if (error instanceof QuotaExceededError) return false;
  if (error instanceof RateLimitedError) return true;
  if (error instanceof ServerError) return true;
  if (error instanceof ApiConnectionError) return true;
  if (error instanceof PokemonTcgApiError) return error.status === 408;
  return false;
}

/**
 * Backoff esponenziale con jitter pieno.
 *
 * Il jitter non e' un dettaglio: senza, mille client che prendono lo stesso 429
 * riprovano tutti nello stesso millisecondo e ricostruiscono la coda che
 * stavano cercando di far smaltire.
 */
function backoffMs(attempt: number, retryAfter: number | undefined): number {
  if (retryAfter !== undefined) return Math.min(retryAfter * 1000, 60_000);
  const ceiling = Math.min(500 * 2 ** attempt, 8_000);
  return Math.random() * ceiling;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnv(name: string): string | undefined {
  // `process` non esiste nei browser ne' nei Workers: si guarda senza assumerlo.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

export function serializeParams(params: Record<string, unknown> | undefined): URLSearchParams {
  const search = new URLSearchParams();
  if (!params) return search;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    // Gli array (select, include, ids) viaggiano come lista separata da virgole,
    // che e' la forma che l'API accetta — non come chiavi ripetute.
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  return search;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly userAgent: string;
  private readonly etags: Map<string, { etag: string; body: unknown }> | null;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = options.apiKey ?? readEnv('PTCG_API_KEY');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = options.userAgent ?? '@pokemontcgapi/sdk';
    this.etags = options.cache === 'etag' ? new Map() : null;
  }

  /** URL assoluto da un path applicativo piu' i parametri. */
  url(path: string, params?: Record<string, unknown>): string {
    const search = serializeParams(params).toString();
    return `${this.baseUrl}${path}${search === '' ? '' : `?${search}`}`;
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>(this.url(path, params));
  }

  /**
   * POST con un corpo.
   *
   * Non passa dalla cache ETag e non viene mai ritentato su un errore di rete:
   * il ritentativo automatico e' sicuro solo su richieste idempotenti, e una
   * POST che potrebbe essere arrivata a destinazione non lo e'. Un 429 con
   * `Retry-After` resta ritentabile perche' li' sappiamo che non e' stata
   * eseguita.
   */
  async post<T>(path: string, body: BodyInit, contentType?: string, params?: Record<string, unknown>): Promise<T> {
    return this.attempt<T>(this.url(path, params), { method: 'POST', body, contentType });
  }

  /**
   * Segue un URL gia' costruito dall'API (`links.next`).
   *
   * Esiste come metodo pubblico perche' il cursore porta la firma
   * dell'ordinamento: ricostruire l'URL a mano e rimetterci dentro il cursore
   * e' esattamente cio' che l'API rifiuta con `INVALID_CURSOR`.
   */
  async follow<T>(absoluteUrl: string): Promise<T> {
    return this.request<T>(absoluteUrl);
  }

  private async request<T>(url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.attempt<T>(url);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !isRetryable(error)) throw error;
        const retryAfter = error instanceof RateLimitedError ? error.retryAfter : undefined;
        await sleep(backoffMs(attempt, retryAfter));
      }
    }

    throw lastError;
  }

  private async attempt<T>(
    url: string,
    write?: { method: 'POST'; body: BodyInit; contentType?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
    };
    if (this.apiKey !== undefined) headers['x-api-key'] = this.apiKey;

    // `contentType` si imposta solo se lo si conosce: su un FormData va lasciato
    // scrivere a fetch, che ci mette dentro il `boundary`. Scriverlo a mano
    // produce un multipart che il server non riesce a separare, e l'errore che
    // ne esce parla di un campo mancante invece che di un'intestazione sbagliata.
    if (write?.contentType !== undefined) headers['content-type'] = write.contentType;

    // Nessuna cache condizionale sulle scritture: l'ETag e' l'impronta di un
    // corpo, e su una risposta che dipende da cio' che hai appena caricato non
    // significherebbe niente.
    const cached = write === undefined ? this.etags?.get(url) : undefined;
    if (cached !== undefined) headers['if-none-match'] = cached.etag;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await this.doFetch(url, {
        method: write?.method ?? 'GET',
        headers,
        ...(write === undefined ? {} : { body: write.body }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ApiTimeoutError(this.timeout, error);
      throw new ApiConnectionError(`Request to ${url} failed`, error);
    } finally {
      clearTimeout(timer);
    }

    // 304: il corpo e' vuoto per definizione, la risposta e' quella in cache.
    if (response.status === 304 && cached !== undefined) return cached.body as T;

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader === null ? undefined : Number.parseInt(retryAfterHeader, 10);
      const body = await this.readErrorBody(response);
      throw toApiError(response.status, body, Number.isFinite(retryAfter) ? retryAfter : undefined);
    }

    const body = (await response.json()) as T;

    const etag = response.headers.get('etag');
    if (write === undefined && this.etags !== null && etag !== null) this.etags.set(url, { etag, body });

    return body;
  }

  /**
   * Un 5xx puo' arrivare da un proxy davanti all'API, quindi in HTML: se il
   * corpo non e' il nostro envelope si costruisce un errore comunque, invece di
   * far esplodere il parser e nascondere lo status vero.
   */
  private async readErrorBody(response: Response): Promise<ApiErrorBody> {
    try {
      const parsed = (await response.json()) as { error?: ApiErrorBody };
      if (parsed.error !== undefined && typeof parsed.error.code === 'string') return parsed.error;
    } catch {
      /* cade sotto */
    }
    return {
      code: `HTTP_${response.status}`,
      message: response.statusText === '' ? `HTTP ${response.status}` : response.statusText,
    };
  }
}

/**
 * Una pagina che e' anche un iteratore.
 *
 * `for await (const card of client.cards.search(...))` cammina l'intera
 * collezione seguendo `links.next`, senza che il chiamante veda mai un cursore.
 * E' il motivo per cui vale la pena usare l'SDK invece di `fetch`: la paginazione
 * a cursore e' corretta ma noiosa, ed e' il punto in cui le integrazioni scritte
 * a mano perdono righe.
 */
export class Page<T> implements AsyncIterable<T> {
  readonly data: readonly T[];
  readonly meta: Collection<T>['meta'];
  private readonly nextUrl: string | undefined;
  private readonly http: HttpClient;

  constructor(http: HttpClient, body: Collection<T>) {
    this.http = http;
    this.data = body.data;
    this.meta = body.meta;
    this.nextUrl = body.links?.next;
  }

  get hasMore(): boolean {
    return this.nextUrl !== undefined;
  }

  async nextPage(): Promise<Page<T> | null> {
    if (this.nextUrl === undefined) return null;
    const body = await this.http.follow<Collection<T>>(this.nextUrl);
    return new Page(this.http, body);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = this;
    while (page !== null) {
      for (const item of page.data) yield item;
      page = await page.nextPage();
    }
  }

  /**
   * Materializza in un array. `max` e' OBBLIGATORIO: il catalogo ha oltre
   * 52.000 carte, e un `.toArray()` senza tetto e' il modo piu' rapido di
   * riempire la memoria di un processo per sbaglio.
   */
  async toArray({ max }: { max: number }): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this) {
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  }
}
