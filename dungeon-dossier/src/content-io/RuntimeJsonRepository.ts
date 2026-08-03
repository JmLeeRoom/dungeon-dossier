import type { ZodType } from 'zod';
import {
  applyValidationPolicy,
  loadFailureReport,
  SchemaValidator,
  type ValidationMode,
  type ValidationReport,
  type ValidationReporter,
} from './SchemaValidator';

export type JsonParser<T> = (input: unknown) => T;

export interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ValidatedRepositoryOptions {
  readonly fetcher?: FetchLike;
  readonly mode?: ValidationMode;
  readonly reporter?: ValidationReporter;
  readonly validator?: SchemaValidator;
}

export async function fetchJson(
  url: string,
  fetcher: FetchLike = fetch,
): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Content request failed (${response.status}): ${url}`);
  }
  return response.json();
}

export async function fetchAndParseJson<T>(
  url: string,
  parse: JsonParser<T>,
  fetcher: FetchLike = fetch,
): Promise<T> {
  return parse(await fetchJson(url, fetcher));
}

export class RuntimeJsonRepository<T> {
  readonly #parse: JsonParser<T>;
  readonly #fetcher: FetchLike;

  constructor(parse: JsonParser<T>, fetcher: FetchLike = fetch) {
    this.#parse = parse;
    this.#fetcher = fetcher;
  }

  load(url: string): Promise<T> {
    return fetchAndParseJson(url, this.#parse, this.#fetcher);
  }
}

export class ValidatedRuntimeJsonRepository<T> {
  readonly #schema: ZodType<T>;
  readonly #fetcher: FetchLike;
  readonly #mode: ValidationMode;
  readonly #reporter: ValidationReporter | undefined;
  readonly #validator: SchemaValidator;

  constructor(schema: ZodType<T>, options: ValidatedRepositoryOptions = {}) {
    this.#schema = schema;
    this.#fetcher = options.fetcher ?? fetch;
    this.#mode = options.mode ?? 'development';
    this.#reporter = options.reporter;
    this.#validator = options.validator ?? new SchemaValidator();
  }

  async load(
    url: string,
    refine?: (data: T, source: string) => ValidationReport<T>,
  ): Promise<T | undefined> {
    let input: unknown;
    try {
      input = await fetchJson(url, this.#fetcher);
    } catch (error) {
      return this.#apply(loadFailureReport(url, error));
    }

    const schemaReport = this.#validator.validate(this.#schema, input, url);
    if (!schemaReport.valid || !refine) return this.#apply(schemaReport);

    try {
      return this.#apply(refine(schemaReport.data, url));
    } catch (error) {
      return this.#apply(loadFailureReport(url, error));
    }
  }

  validateInMemory(input: unknown, source = '<memory>'): T | undefined {
    return this.#apply(this.#validator.validate(this.#schema, input, source));
  }

  #apply(report: ValidationReport<T>): T | undefined {
    return this.#reporter
      ? applyValidationPolicy(report, this.#mode, this.#reporter)
      : applyValidationPolicy(report, this.#mode);
  }
}
