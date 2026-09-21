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

export interface NextStep {
  readonly action: 'subscribe' | 'upgrade' | 'contact_sales' | 'contact_support' | 'verify_email';
  readonly actor: 'account_owner';
  readonly plan?: {
    readonly code: string;
    readonly name: string;
    readonly monthly_eur?: string;
    readonly yearly_eur?: string;
    readonly credits_per_month?: number;
  };
  readonly checkout_url?: string;
  readonly checkout_url_yearly?: string;
  readonly manage_url?: string;
  readonly contact_url?: string;
  readonly verify_url?: string;
  readonly plans_url: string;
  readonly handoff: string;
}

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

  get nextStep(): NextStep | undefined {
    const value = this.details?.['next_step'];
    if (typeof value !== 'object' || value === null) return undefined;
    const step = value as Record<string, unknown>;
    if (step['actor'] !== 'account_owner' || typeof step['handoff'] !== 'string' ||
        typeof step['plans_url'] !== 'string' ||
        !['subscribe', 'upgrade', 'contact_sales', 'contact_support', 'verify_email'].includes(String(step['action']))) {
      return undefined;
    }
    return value as NextStep;
  }

  get checkoutUrl(): string | undefined {
    const value = this.nextStep?.checkout_url;
    return typeof value === 'string' ? value : undefined;
  }

  get actionUrl(): string | undefined {
    const step = this.nextStep;
    if (!step) return undefined;
    const value = step.action === 'subscribe' ? step.checkout_url
      : step.action === 'upgrade' ? step.manage_url
      : step.action === 'verify_email' ? step.verify_url
      : step.contact_url;
    return typeof value === 'string' ? value : undefined;
  }

  get handoff(): string | undefined {
    return this.nextStep?.handoff;
  }

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

/**
 * 403 PLAN_REQUIRED — la rotta non e' nel piano (movers e foto partono da
 * Growth). Estende `PermissionDeniedError`: chi gia' la catturava continua a
 * farlo, chi vuole distinguere "compra" da "scope sbagliato" ora puo'.
 */
export class PlanRequiredError extends PermissionDeniedError {}

/**
 * 403 TRIAL_EXPIRED — la prova e' finita (30 giorni) e la rotta costa crediti.
 * Non passa aspettando ne' riprovando: serve un piano.
 */
export class TrialExpiredError extends PermissionDeniedError {}

/** 403 UPGRADE_REQUIRED — la finestra chiesta e' piu' larga di quella del piano. */
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

  if (code === 'QUOTA_EXCEEDED') return new QuotaExceededError(status, body);
  if (code === 'UPGRADE_REQUIRED') return new UpgradeRequiredError(status, body);
  if (code === 'PLAN_REQUIRED') return new PlanRequiredError(status, body);
  if (code === 'TRIAL_EXPIRED') return new TrialExpiredError(status, body);
  if (status === 429) return new RateLimitedError(status, body, retryAfter);
  if (status === 401) return new AuthenticationError(status, body);
  if (status === 403) return new PermissionDeniedError(status, body);
  if (status === 404 || code.endsWith('_NOT_FOUND')) return new NotFoundError(status, body);
  if (status >= 500) return new ServerError(status, body);
  if (status >= 400) return new InvalidRequestError(status, body);

  return new PokemonTcgApiError(status, body);
}
