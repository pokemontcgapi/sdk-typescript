/**
 * Gerarchia degli errori.
 *
 * Sottoclassi e non un solo tipo con un campo `code`, per una ragione pratica:
 * chi integra scrive `catch (e) { if (e instanceof RateLimited) ... }`, e con un
 * tipo solo dovrebbe confrontare stringhe — cioe' riscrivere a mano la
 * tassonomia che noi gia' conosciamo, sbagliando i nomi.
 *
 * `QuotaExceeded` e' separato da `RateLimited` di proposito: sembrano lo stesso
 * errore (entrambi 429) ma si trattano in modo opposto. Un rate limit passa
 * aspettando; una quota mensile finita non passa mai, e riprovare e' solo un
 * modo di consumare tempo. Il retry automatico di questo client riprova il
 * primo e non riprova mai il secondo.
 */

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly request_id?: string;
}

export class PokemonTcgApiError extends Error {
  /** Codice stabile della tassonomia, es. `CARD_NOT_FOUND`. */
  readonly code: string;
  readonly status: number;
  /**
   * Sempre valorizzato quando la risposta e' passata dall'API: e' l'unica cosa
   * che il supporto puo' cercare nei log. Va incluso in ogni bug report.
   */
  readonly requestId: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(`${body.code}: ${body.message}`);
    this.name = new.target.name;
    this.code = body.code;
    this.status = status;
    this.requestId = body.request_id;
    this.details = body.details;
  }
}

/** 401 — chiave assente, malformata o revocata. */
export class AuthenticationError extends PokemonTcgApiError {}

/** 403 — la chiave e' valida ma non puo' fare questa cosa. */
export class PermissionDeniedError extends PokemonTcgApiError {}

/** 402 / UPGRADE_REQUIRED — serve un piano superiore. */
export class UpgradeRequiredError extends PokemonTcgApiError {
  /** Finestra concessa dal piano corrente, quando l'API la dichiara. */
  get permittedWindow(): unknown {
    return this.details?.['permitted_window'];
  }
}

/** 404 — la risorsa non esiste. Non e' un errore di rete: non si riprova. */
export class NotFoundError extends PokemonTcgApiError {}

/** 400 / 422 — la richiesta e' sbagliata. `field` dice quale parametro. */
export class InvalidRequestError extends PokemonTcgApiError {
  get field(): string | undefined {
    const value = this.details?.['field'];
    return typeof value === 'string' ? value : undefined;
  }
}

/** 429 con Retry-After: passa aspettando. */
export class RateLimitedError extends PokemonTcgApiError {
  /** Secondi da aspettare, dall'header `Retry-After`, se c'era. */
  readonly retryAfter: number | undefined;

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(status, body);
    this.retryAfter = retryAfter;
  }
}

/** 429 per quota di periodo esaurita: NON passa aspettando, e non si riprova. */
export class QuotaExceededError extends PokemonTcgApiError {}

/** 5xx. */
export class ServerError extends PokemonTcgApiError {}

/** La richiesta non e' mai arrivata: DNS, TLS, socket. */
export class ApiConnectionError extends Error {
  /** `override` perche' Error dichiara gia' `cause` da ES2022. */
  override readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ApiConnectionError';
    this.cause = cause;
  }
}

/** La richiesta e' stata abbandonata da noi dopo `timeout`. */
export class ApiTimeoutError extends ApiConnectionError {
  constructor(timeoutMs: number, cause: unknown) {
    super(`Request timed out after ${timeoutMs}ms`, cause);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * Dal corpo dell'errore alla classe giusta.
 *
 * Si guarda PRIMA il `code` e poi lo status: lo status dice la famiglia, il
 * code dice il caso, e i due casi che contano davvero (limite contro quota)
 * condividono lo stesso status.
 */
export function toApiError(status: number, body: ApiErrorBody, retryAfter?: number): PokemonTcgApiError {
  const code = body.code;

  if (code === 'QUOTA_EXCEEDED' || code === 'MONTHLY_QUOTA_EXCEEDED') return new QuotaExceededError(status, body);
  if (code === 'UPGRADE_REQUIRED' || status === 402) return new UpgradeRequiredError(status, body);
  if (status === 429) return new RateLimitedError(status, body, retryAfter);
  if (status === 401) return new AuthenticationError(status, body);
  if (status === 403) return new PermissionDeniedError(status, body);
  if (status === 404 || code.endsWith('_NOT_FOUND')) return new NotFoundError(status, body);
  if (status >= 500) return new ServerError(status, body);
  if (status >= 400) return new InvalidRequestError(status, body);

  return new PokemonTcgApiError(status, body);
}
