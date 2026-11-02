import { Faker, base, de, en, es, fr, pt_BR, type LocaleDefinition } from '@faker-js/faker';
import type { ColumnHints, GenValue } from '@/lib/seeding/seedTypes';
import type { SupportedLocale } from '@/types/workspace';

export type LogicalType = 'integer' | 'real' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'time' | 'json' | 'uuid' | 'blob' | 'text' | 'any';

/** Fixed reference date so relative date generation is reproducible. */
export const FAKER_REF_DATE = '2025-06-01T12:00:00.000Z';

const LOCALES: Record<SupportedLocale, LocaleDefinition> = { en, de, fr, es, pt_BR };

export function createSeededFaker(seed: number, locale: SupportedLocale): Faker {
  const faker = new Faker({ locale: [LOCALES[locale], en, base] });
  faker.seed(seed);
  faker.setDefaultRefDate(FAKER_REF_DATE);
  return faker;
}

export interface LogicalTypeInfo {
  readonly type: LogicalType;
  readonly length?: number;
  readonly scale?: number;
}

export function logicalType(declared: string): LogicalTypeInfo {
  const t = declared.toUpperCase();
  const params = /\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/.exec(t);
  const p1 = params?.[1] !== undefined ? Number(params[1]) : undefined;
  const p2 = params?.[2] !== undefined ? Number(params[2]) : undefined;
  if (t.includes('BOOL')) return { type: 'boolean' };
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return { type: 'datetime' };
  if (t.includes('DATE')) return { type: 'date' };
  if (t.includes('TIME')) return { type: 'time' };
  if (t.includes('JSON')) return { type: 'json' };
  if (t.includes('UUID') || t.includes('GUID')) return { type: 'uuid' };
  if (t.includes('INT')) return { type: 'integer' };
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return { type: 'text', length: p1 };
  if (t.includes('BLOB') || t.includes('BINARY')) return { type: 'blob' };
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return { type: 'real' };
  if (t.includes('DEC') || t.includes('NUMERIC') || t.includes('MONEY')) return { type: 'decimal', scale: p2 ?? 2 };
  if (t.trim() === '') return { type: 'any' };
  return { type: 'text', length: p1 };
}

export interface GenContext {
  readonly faker: Faker;
  readonly table: string;
  /** Normalized, singular table name, e.g. "order_item". */
  readonly entity: string;
  /** Normalized column name. */
  readonly name: string;
  readonly logical: LogicalTypeInfo;
  readonly hints: ColumnHints;
  readonly siblings: readonly string[];
}

type Producer = (ctx: GenContext) => GenValue;

interface SemanticRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly accepts: readonly LogicalType[];
  readonly produce: Producer;
}

const TEXTUAL: readonly LogicalType[] = ['text', 'any'];
const NUMERIC: readonly LogicalType[] = ['integer', 'real', 'decimal', 'any', 'text'];
const TEMPORAL: readonly LogicalType[] = ['datetime', 'date', 'text', 'any', 'integer'];

const STATUS_DOMAINS: Record<string, readonly string[]> = {
  order: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
  payment: ['pending', 'completed', 'failed', 'refunded'],
  invoice: ['draft', 'sent', 'paid', 'overdue', 'void'],
  user: ['active', 'inactive', 'suspended'],
  customer: ['active', 'inactive', 'suspended'],
  employee: ['active', 'on_leave', 'terminated'],
  product: ['active', 'discontinued', 'out_of_stock'],
  inventory: ['in_stock', 'low_stock', 'out_of_stock'],
  task: ['todo', 'in_progress', 'done'],
  ticket: ['open', 'in_progress', 'resolved', 'closed'],
  shipment: ['label_created', 'in_transit', 'delivered', 'returned'],
  audit: ['success', 'failure'],
};

const PERSON_ENTITIES = /^(user|customer|employee|author|member|person|people|contact|student|teacher|patient|staff|account|client|manager|owner|admin)$/;
const PRODUCT_ENTITIES = /^(product|item|order_item|line_item|inventory|sku|article_item)$/;

export function singularEntity(normalizedTable: string): string {
  const last = normalizedTable.replace(/^(tbl|t)_/, '');
  if (last.endsWith('ies')) return `${last.slice(0, -3)}y`;
  if (last.endsWith('sses') || last.endsWith('xes')) return last.slice(0, -2);
  if (last.endsWith('s') && !last.endsWith('ss')) return last.slice(0, -1);
  return last;
}

function isoDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function timestamp(ctx: GenContext, past = true): GenValue {
  const d = past ? ctx.faker.date.past({ years: 3 }) : ctx.faker.date.soon({ days: 90 });
  if (ctx.logical.type === 'integer') return Math.floor(d.getTime() / 1000);
  if (ctx.logical.type === 'date') return d.toISOString().slice(0, 10);
  return isoDateTime(d);
}

function money(ctx: GenContext, min: number, max: number): GenValue {
  const v = ctx.faker.number.float({ min, max, fractionDigits: 2 });
  return ctx.logical.type === 'integer' ? Math.round(v) : v;
}

function statusFor(ctx: GenContext): string {
  const domain = STATUS_DOMAINS[ctx.entity] ?? STATUS_DOMAINS[ctx.entity.split('_').pop() ?? ''] ?? ['active', 'inactive', 'pending'];
  return ctx.faker.helpers.arrayElement(domain);
}

function nameFor(ctx: GenContext): string {
  const f = ctx.faker;
  if (PERSON_ENTITIES.test(ctx.entity)) return f.person.fullName();
  if (PRODUCT_ENTITIES.test(ctx.entity)) return f.commerce.productName();
  if (/^(company|organization|organisation|vendor|supplier|tenant|brand)$/.test(ctx.entity)) return f.company.name();
  if (/^(category|department|tag|team|group)$/.test(ctx.entity)) return f.commerce.department();
  if (/^(city|location|store|warehouse|branch)$/.test(ctx.entity)) return f.location.city();
  if (/^(project|campaign)$/.test(ctx.entity)) return f.company.catchPhrase();
  return f.word.words({ count: { min: 1, max: 3 } });
}

function titleFor(ctx: GenContext): string {
  const f = ctx.faker;
  if (PRODUCT_ENTITIES.test(ctx.entity)) return f.commerce.productName();
  if (/^(employee|job|position|staff)$/.test(ctx.entity)) return f.person.jobTitle();
  if (/^(ticket|issue|bug|task)$/.test(ctx.entity)) return f.hacker.phrase().slice(0, 80);
  return f.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/, '');
}

const hasAddressSiblings = (ctx: GenContext): boolean => ctx.siblings.some((s) => /^(city|address|street|zip|zip_code|postal_code|country)$/.test(s));

/** Ordered rules: the first matching, type-compatible rule wins. */
export const SEMANTIC_RULES: readonly SemanticRule[] = [
  { id: 'email', pattern: /^(e_?mail|email_address|.+_email)$/, accepts: TEXTUAL, produce: (c) => c.faker.internet.email({ provider: 'example.com' }).toLowerCase() },
  { id: 'first_name', pattern: /^(first_?name|given_name|fname|forename)$/, accepts: TEXTUAL, produce: (c) => c.faker.person.firstName() },
  { id: 'last_name', pattern: /^(last_?name|surname|family_name|lname)$/, accepts: TEXTUAL, produce: (c) => c.faker.person.lastName() },
  { id: 'full_name', pattern: /^(full_?name|display_name|contact_name|customer_name|author_name)$/, accepts: TEXTUAL, produce: (c) => c.faker.person.fullName() },
  { id: 'username', pattern: /^(user_?name|login|handle|screen_name|nickname)$/, accepts: TEXTUAL, produce: (c) => c.faker.internet.username().toLowerCase() },
  { id: 'password', pattern: /^(password(_hash|_digest)?|pw_hash|passwd|hashed_password)$/, accepts: TEXTUAL, produce: (c) => `synthetic$sha256$${c.faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' })}` },
  { id: 'token', pattern: /^(token|api_key|secret|access_token|refresh_token)$/, accepts: TEXTUAL, produce: (c) => `synthetic_${c.faker.string.alphanumeric(24)}` },
  { id: 'uuid', pattern: /^(uuid|guid|.+_uuid|.+_guid|external_id|public_id)$/, accepts: ['uuid', 'text', 'any'], produce: (c) => c.faker.string.uuid() },
  { id: 'phone', pattern: /^(phone(_number)?|mobile|telephone|tel|cell(_phone)?|fax)$/, accepts: TEXTUAL, produce: (c) => c.faker.phone.number({ style: 'international' }) },
  { id: 'null_lifecycle_at', pattern: /^(deleted|cancel+ed|completed|archived|closed|resolved|refunded|terminated)_(at|on|date|time)$/, accepts: TEMPORAL, produce: (c) => timestamp(c) },
  { id: 'future_at', pattern: /^(due|expires?|expiry|scheduled|starts?|ends?)_(at|on|date)$/, accepts: TEMPORAL, produce: (c) => timestamp(c, false) },
  { id: 'birth_date', pattern: /^(birth_?date|date_of_birth|dob|birthday)$/, accepts: TEMPORAL, produce: (c) => (c.logical.type === 'integer' ? Math.floor(c.faker.date.birthdate().getTime() / 1000) : c.faker.date.birthdate().toISOString().slice(0, 10)) },
  { id: 'timestamp', pattern: /^(created|updated|modified|inserted|published|shipped|paid|placed|ordered|hired|joined|last_login|logged|occurred|sent|delivered|started|finished|registered)(_(at|on|time|ts|date))?$|^.+_at$|^timestamp$/, accepts: TEMPORAL, produce: (c) => timestamp(c) },
  { id: 'date', pattern: /^(date|day|.+_date|.+_on)$/, accepts: TEMPORAL, produce: (c) => timestamp({ ...c, logical: c.logical.type === 'integer' ? c.logical : { type: 'date' } }) },
  { id: 'street', pattern: /^(address(_line_?1)?|street(_address)?|address1|line1)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.streetAddress() },
  { id: 'address2', pattern: /^(address_line_?2|address2|line2|suite)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.secondaryAddress() },
  { id: 'city', pattern: /^(city|town|municipality)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.city() },
  { id: 'region', pattern: /^(province|region|county)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.state() },
  { id: 'country_code', pattern: /^(country_code|country_iso|iso_country)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.countryCode() },
  { id: 'country', pattern: /^(country|nation)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.country() },
  { id: 'postal_code', pattern: /^(postal_?code|zip(_?code)?|post_?code)$/, accepts: TEXTUAL, produce: (c) => c.faker.location.zipCode() },
  { id: 'latitude', pattern: /^(lat|latitude)$/, accepts: NUMERIC, produce: (c) => c.faker.location.latitude() },
  { id: 'longitude', pattern: /^(lng|lon|long|longitude)$/, accepts: NUMERIC, produce: (c) => c.faker.location.longitude() },
  { id: 'company', pattern: /^(company(_name)?|organization|organisation|employer|vendor|supplier)$/, accepts: TEXTUAL, produce: (c) => c.faker.company.name() },
  { id: 'job_title', pattern: /^(job_title|position|role_title|occupation)$/, accepts: TEXTUAL, produce: (c) => c.faker.person.jobTitle() },
  { id: 'title', pattern: /^(title|subject|headline|product_name)$/, accepts: TEXTUAL, produce: titleFor },
  { id: 'name', pattern: /^(name|label)$/, accepts: TEXTUAL, produce: nameFor },
  { id: 'description', pattern: /^(description|notes?|bio|summary|comments?|body|content|message|details|remarks|reason)$/, accepts: TEXTUAL, produce: (c) => c.faker.lorem.sentences({ min: 1, max: 2 }) },
  { id: 'salary', pattern: /^(salary|annual_salary|wage)$/, accepts: NUMERIC, produce: (c) => money(c, 30000, 200000) },
  { id: 'money', pattern: /^(amount|price|unit_price|total|subtotal|sub_total|balance|cost|fee|tax|shipping|grand_total|value|revenue|discount_amount)$|_(amount|price|total|cost|fee)$/, accepts: NUMERIC, produce: (c) => money(c, 1, 1000) },
  { id: 'currency', pattern: /^(currency(_code)?|iso_currency)$/, accepts: TEXTUAL, produce: (c) => c.faker.finance.currencyCode() },
  { id: 'percentage', pattern: /^(percent(age)?|pct|discount|discount_percent|progress)$/, accepts: NUMERIC, produce: (c) => (c.logical.type === 'integer' ? c.faker.number.int({ min: 0, max: 100 }) : c.faker.number.float({ min: 0, max: 100, fractionDigits: 2 })) },
  { id: 'rate', pattern: /^(rate|ratio|tax_rate|conversion_rate|interest_rate)$/, accepts: NUMERIC, produce: (c) => c.faker.number.float({ min: 0, max: 1, fractionDigits: 4 }) },
  { id: 'line_quantity', pattern: /^(quantity|qty)$/, accepts: NUMERIC, produce: (c) => c.faker.number.int({ min: 1, max: /(item|line|cart)/.test(c.entity) ? 5 : 100 }) },
  { id: 'quantity', pattern: /^(quantity|qty|count|stock|units|inventory|on_hand|.+_count|num_.+|seats)$/, accepts: NUMERIC, produce: (c) => c.faker.number.int({ min: 0, max: 100 }) },
  { id: 'rating', pattern: /^(rating|stars|score)$/, accepts: NUMERIC, produce: (c) => c.faker.number.int({ min: 1, max: 5 }) },
  { id: 'age', pattern: /^age$/, accepts: NUMERIC, produce: (c) => c.faker.number.int({ min: 18, max: 90 }) },
  { id: 'year', pattern: /^(year|.+_year)$/, accepts: NUMERIC, produce: (c) => c.faker.number.int({ min: 1995, max: 2025 }) },
  { id: 'boolean', pattern: /^(is_.+|has_.+|can_.+|active|enabled|disabled|verified|deleted|archived|visible|published|.+_flag)$/, accepts: ['boolean', 'integer', 'any', 'text', 'decimal', 'real'], produce: (c) => (c.faker.datatype.boolean({ probability: 0.75 }) ? 1 : 0) },
  { id: 'state_address', pattern: /^state$/, accepts: TEXTUAL, produce: (c) => (hasAddressSiblings(c) ? c.faker.location.state() : statusFor(c)) },
  { id: 'status', pattern: /^(status|state|stage|.+_status)$/, accepts: TEXTUAL, produce: statusFor },
  { id: 'url', pattern: /^(url|website|homepage|link|.+_url|uri)$/, accepts: TEXTUAL, produce: (c) => c.faker.internet.url() },
  { id: 'ip', pattern: /^(ip|ip_address|ipv4|remote_addr|client_ip)$/, accepts: TEXTUAL, produce: (c) => c.faker.internet.ipv4() },
  { id: 'user_agent', pattern: /^user_agent$/, accepts: TEXTUAL, produce: (c) => c.faker.internet.userAgent() },
  { id: 'json', pattern: /^(json|metadata|meta|payload|attributes|settings|preferences|properties|extra|config)$/, accepts: ['json', 'text', 'any'], produce: (c) => jsonValue(c) },
  { id: 'blob', pattern: /^(blob|binary|file_data|data_blob|thumbnail|.+_bytes|checksum_bytes)$/, accepts: ['blob', 'any'], produce: (c) => blobValue(c) },
  { id: 'sku', pattern: /^(sku|code|product_code|barcode|reference|ref)$/, accepts: TEXTUAL, produce: (c) => c.faker.string.alphanumeric({ length: 10, casing: 'upper' }) },
  { id: 'slug', pattern: /^slug$/, accepts: TEXTUAL, produce: (c) => c.faker.helpers.slugify(c.faker.lorem.words(3)).toLowerCase() },
  { id: 'color', pattern: /^(colou?r)$/, accepts: TEXTUAL, produce: (c) => c.faker.color.human() },
  { id: 'version', pattern: /^version$/, accepts: TEXTUAL, produce: (c) => c.faker.system.semver() },
  { id: 'action', pattern: /^(action|event|event_type|operation)$/, accepts: TEXTUAL, produce: (c) => c.faker.helpers.arrayElement(['create', 'update', 'delete', 'login', 'logout']) },
  { id: 'gender_free_type', pattern: /^(type|kind|category)$/, accepts: TEXTUAL, produce: (c) => c.faker.commerce.department() },
];

function jsonValue(c: GenContext): string {
  return JSON.stringify({ source: c.faker.helpers.arrayElement(['web', 'mobile', 'api']), version: c.faker.number.int({ min: 1, max: 5 }), tags: c.faker.lorem.words(2).split(' ') });
}

function blobValue(c: GenContext): Uint8Array {
  return Uint8Array.from({ length: 16 }, () => c.faker.number.int({ min: 0, max: 255 }));
}

/** Fallback generator driven purely by the declared type family. */
export function valueForType(c: GenContext): GenValue {
  const f = c.faker;
  switch (c.logical.type) {
    case 'integer':
      return f.number.int({ min: 1, max: 10000 });
    case 'real':
      return f.number.float({ min: 0, max: 10000, fractionDigits: 2 });
    case 'decimal':
      return f.number.float({ min: 0, max: 10000, fractionDigits: Math.min(c.logical.scale ?? 2, 6) });
    case 'boolean':
      return f.datatype.boolean() ? 1 : 0;
    case 'date':
    case 'datetime':
      return timestamp(c);
    case 'time':
      return isoDateTime(f.date.recent()).slice(11);
    case 'json':
      return jsonValue(c);
    case 'uuid':
      return f.string.uuid();
    case 'blob':
      return blobValue(c);
    default:
      return f.lorem.words({ min: 1, max: 4 });
  }
}

export interface ProducedValue {
  readonly value: GenValue;
  readonly source: string;
}

/** Precedence: CHECK IN-list → semantic name rule (type-compatible) → declared type. */
export function produceValue(c: GenContext): ProducedValue {
  if (c.hints.allowed && c.hints.allowed.length > 0) return { value: c.faker.helpers.arrayElement([...c.hints.allowed]), source: 'check-in-list' };
  const rule = SEMANTIC_RULES.find((r) => r.pattern.test(c.name) && r.accepts.includes(c.logical.type));
  if (rule) return { value: rule.produce(c), source: rule.id };
  return { value: valueForType(c), source: `type:${c.logical.type}` };
}

/** True when a semantic rule (not just the type fallback) would drive this column. */
export function matchesSemanticRule(name: string, logical: LogicalType): boolean {
  return SEMANTIC_RULES.some((r) => r.pattern.test(name) && r.accepts.includes(logical));
}

export const NULL_HEAVY_COLUMN = /^(deleted|cancel+ed|archived|closed|refunded|terminated)_(at|on|date|time)$/;
