/**
 * A small parser for data that arrives from outside: a schema both checks a value and gives its TypeScript type,
 * so the type and the check cannot drift apart. Unknown keys are ignored, so the API may add fields without
 * breaking the page; a missing key or a value of the wrong kind throws a `ParseError` that names the path.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export interface Schema<T> {
  readonly parse: (value: unknown, path: string) => T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type OptionalSchema<T> = Schema<T | undefined> & { readonly optional: true };
type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends { readonly optional: true } ? K : never;
}[keyof S];
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type ObjectOf<S extends Shape> = Simplify<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]> } & {
    [K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined>;
  }
>;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `${typeof value} ${JSON.stringify(value)}`;
}

function fail(path: string, expected: string, value: unknown): never {
  throw new ParseError(`${path || "response"}: expected ${expected}, got ${describe(value)}`);
}

export const str: Schema<string> = {
  parse: (value, path) => (typeof value === "string" ? value : fail(path, "a string", value)),
};

export const num: Schema<number> = {
  parse: (value, path) =>
    typeof value === "number" && Number.isFinite(value) ? value : fail(path, "a finite number", value),
};

export const int: Schema<number> = {
  parse: (value, path) => (Number.isInteger(value) ? (value as number) : fail(path, "an integer", value)),
};

export const bool: Schema<boolean> = {
  parse: (value, path) => (typeof value === "boolean" ? value : fail(path, "a boolean", value)),
};

/** A text or a number, for records whose columns differ in kind. */
export const scalar: Schema<string | number> = {
  parse: (value, path) =>
    typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
      ? value
      : fail(path, "a string or a number", value),
};

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return { parse: (value, path) => (value === null ? null : inner.parse(value, path)) };
}

/** A key that may be absent. Present values must still satisfy `inner`. */
export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    parse: (value, path) => (value === undefined ? undefined : inner.parse(value, path)),
  };
}

/**
 * A key that only adds to what the page says. When it is absent, or not the shape the page expects, it reads as
 * absent, so a change to it cannot blank a screen that does not need it.
 */
export function tolerant<T>(inner: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    parse: (value, path) => {
      if (value === undefined) return undefined;
      try {
        return inner.parse(value, path);
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        // Absent is not a change, but a block of another shape is, and a developer should see it once.
        warnOnce(error.message);
        return undefined;
      }
    },
  };
}

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`${message}. The page ignores it and carries on without it.`);
}
/** Lets the next ignored field say so again; for tests. */
export function forgetWarnings(): void {
  warned.clear();
}

export function list<T>(item: Schema<T>): Schema<T[]> {
  return {
    parse: (value, path) => {
      if (!Array.isArray(value)) return fail(path, "an array", value);
      return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
    },
  };
}

export function dict<T>(item: Schema<T>): Schema<Record<string, T>> {
  return {
    parse: (value, path) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return fail(path, "an object", value);
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, item.parse(entry, `${path}.${key}`)])
      );
    },
  };
}

export function oneOf<const V extends readonly [string, ...string[]]>(...values: V): Schema<V[number]> {
  return {
    parse: (value, path) =>
      typeof value === "string" && (values as readonly string[]).includes(value)
        ? (value as V[number])
        : fail(path, `one of ${values.map((v) => JSON.stringify(v)).join(", ")}`, value),
  };
}

/** A string the page may compare with known members but never has to reject: a new member must not break parsing. */
export function looseEnum<Known extends string>(): Schema<Known | (string & {})> {
  return { parse: (value, path) => str.parse(value, path) };
}

export function obj<S extends Shape>(shape: S): Schema<ObjectOf<S>> {
  return {
    parse: (value, path) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return fail(path, "an object", value);
      }
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const child = path ? `${path}.${key}` : key;
        const parsed = schema.parse(record[key], child);
        if (parsed !== undefined) out[key] = parsed;
      }
      return out as ObjectOf<S>;
    },
  };
}

export type Brand<Name extends string> = { readonly __brand: Name };

/** A string that means something specific, so two kinds of id cannot be swapped by accident. */
export function branded<Name extends string>(): Schema<string & Brand<Name>> {
  return { parse: (value, path) => str.parse(value, path) as string & Brand<Name> };
}

/** Runs `check` after `inner` and lets it narrow or reject. For facts a plain shape cannot state. */
export function refine<T, U extends T>(inner: Schema<T>, check: (value: T, path: string) => U): Schema<U> {
  return { parse: (value, path) => check(inner.parse(value, path), path) };
}

export function parseWith<T>(schema: Schema<T>, value: unknown, label: string): T {
  try {
    return schema.parse(value, "");
  } catch (error) {
    if (error instanceof ParseError) throw new ParseError(`${label}: ${error.message}`);
    throw error;
  }
}

export { fail as failParse };
