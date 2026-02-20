type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, unknown>;
  required?: unknown;
  additionalProperties?: unknown;
  items?: unknown;
  minLength?: unknown;
  maxLength?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  minItems?: unknown;
  maxItems?: unknown;
  pattern?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isPlainObject(value)) {
    for (const v of Object.values(value)) {
      if (!isJsonValue(v)) return false;
    }
    return true;
  }
  return false;
};

const asNumber = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const asNonNegativeInt = (value: unknown): number | undefined => {
  const n = asNumber(value);
  if (n === undefined) return undefined;
  const i = Math.floor(n);
  if (i < 0) return undefined;
  return i;
};

const toTypeList = (schema: JsonSchema): string[] => {
  const t = schema.type;
  if (Array.isArray(t)) return t.map((v) => String(v)).filter(Boolean);
  if (typeof t === "string") return [t];
  return [];
};

const matchesType = (value: unknown, type: string): boolean => {
  const t = String(type || "").toLowerCase();
  if (t === "string") return typeof value === "string";
  if (t === "boolean") return typeof value === "boolean";
  if (t === "number") return typeof value === "number" && Number.isFinite(value);
  if (t === "integer") return typeof value === "number" && Number.isInteger(value);
  if (t === "null") return value === null;
  if (t === "array") return Array.isArray(value);
  if (t === "object") return isPlainObject(value);
  return true;
};

const deepEqualJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!isJsonValue(a) || !isJsonValue(b)) return false;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a === "string" || typeof a === "number" || typeof a === "boolean") return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualJson(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) return false;
      if (!deepEqualJson(a[aKeys[i]], b[bKeys[i]])) return false;
    }
    return true;
  }
  return false;
};

const validateValue = (
  schemaUnknown: unknown,
  value: unknown,
  path: string,
  errors: string[],
  depth: number
) => {
  if (errors.length >= 25) return;
  if (depth > 40) {
    errors.push(`${path}: schema too deep`);
    return;
  }

  if (!isPlainObject(schemaUnknown)) {
    return;
  }

  const schema = schemaUnknown as JsonSchema;

  const types = toTypeList(schema);
  if (types.length > 0 && !types.some((t) => matchesType(value, t))) {
    errors.push(`${path}: expected ${types.join("|")}`);
    return;
  }

  if (Array.isArray(schema.enum)) {
    const ok = schema.enum.some((candidate) => deepEqualJson(candidate, value));
    if (!ok) {
      errors.push(`${path}: not in enum`);
      return;
    }
  }

  if (typeof value === "string") {
    const minLength = asNonNegativeInt(schema.minLength);
    if (minLength !== undefined && value.length < minLength) {
      errors.push(`${path}: minLength ${minLength}`);
    }
    const maxLength = asNonNegativeInt(schema.maxLength);
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(`${path}: maxLength ${maxLength}`);
    }
    if (typeof schema.pattern === "string" && schema.pattern.length > 0) {
      try {
        const re = new RegExp(schema.pattern);
        if (!re.test(value)) {
          errors.push(`${path}: pattern mismatch`);
        }
      } catch {
        errors.push(`${path}: invalid pattern`);
      }
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const minimum = asNumber(schema.minimum);
    if (minimum !== undefined && value < minimum) {
      errors.push(`${path}: minimum ${minimum}`);
    }
    const maximum = asNumber(schema.maximum);
    if (maximum !== undefined && value > maximum) {
      errors.push(`${path}: maximum ${maximum}`);
    }
  }

  if (Array.isArray(value)) {
    const minItems = asNonNegativeInt(schema.minItems);
    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path}: minItems ${minItems}`);
    }
    const maxItems = asNonNegativeInt(schema.maxItems);
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(`${path}: maxItems ${maxItems}`);
    }
    if (schema.items !== undefined) {
      for (let i = 0; i < value.length; i += 1) {
        validateValue(schema.items, value[i], `${path}[${i}]`, errors, depth + 1);
        if (errors.length >= 25) return;
      }
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : null;
    const required = Array.isArray(schema.required)
      ? schema.required.map((v) => String(v)).filter(Boolean)
      : [];

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}.${key}: required`);
      }
    }

    if (properties) {
      for (const [key, subSchema] of Object.entries(properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        validateValue(subSchema, (value as any)[key], `${path}.${key}`, errors, depth + 1);
        if (errors.length >= 25) return;
      }
    }

    const additional = schema.additionalProperties;
    if (additional === false && properties) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${path}.${key}: additionalProperties not allowed`);
          if (errors.length >= 25) return;
        }
      }
    } else if (isPlainObject(additional)) {
      for (const key of Object.keys(value)) {
        if (properties && Object.prototype.hasOwnProperty.call(properties, key)) continue;
        validateValue(additional, (value as any)[key], `${path}.${key}`, errors, depth + 1);
        if (errors.length >= 25) return;
      }
    }
  }
};

export const validateJsonSchema = (schema: unknown, value: unknown): { ok: true } | { ok: false; errors: string[] } => {
  const errors: string[] = [];

  if (schema === undefined || schema === null) {
    return { ok: true };
  }

  if (!isPlainObject(schema)) {
    return { ok: false, errors: ["schema: must be an object"] };
  }

  validateValue(schema, value, "$", errors, 0);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
};

