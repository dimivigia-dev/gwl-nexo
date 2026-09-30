var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// runtime/mysql-platform.mjs
var mysql_platform_exports = {};
__export(mysql_platform_exports, {
  BUCKET: () => BUCKET,
  database: () => database,
  env: () => env,
  mysqlSQL: () => mysqlSQL,
  pool: () => pool
});
import mysql from "mysql2/promise";
import { createHash, randomUUID } from "node:crypto";
function mysqlSQL(sql2) {
  return sql2.replace(/"([a-zA-Z_][a-zA-Z_0-9]*)"/g, "`$1`").replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO").replace(/datetime\(\s*'now'\s*,\s*'-([0-9]+) minutes'\s*\)/gi, "DATE_SUB(UTC_TIMESTAMP(), INTERVAL $1 MINUTE)").replace(/MAX\(planner_thread_reads\.last_read_message_id,excluded\.last_read_message_id\)/gi, "GREATEST(planner_thread_reads.last_read_message_id,excluded.last_read_message_id)").replace(/\s+ON\s+CONFLICT\s*(?:\([^)]*\))?\s+DO\s+NOTHING\s*$/gi, "").replace(/\s+ON\s+CONFLICT\s*\([^)]*\)\s+DO\s+UPDATE\s+SET\s+/gi, " ON DUPLICATE KEY UPDATE ").replace(/excluded\.(?:`([a-zA-Z_0-9]+)`|([a-zA-Z_0-9]+))/gi, (_, a, b) => `VALUES(\`${a || b}\`)`);
}
function param(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return value.replace("T", " ").slice(0, -1);
  return value;
}
function normalizeRow(row, fields) {
  const dateFields = /* @__PURE__ */ new Set(["recorded_at", "expires_at", "locked_until", "claimed_at", "starts_at", "ends_at"]);
  if (Array.isArray(row)) return row.map((value, i) => normalizeValue(value, fields[i]?.name));
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, normalizeValue(value, name)]));
  function normalizeValue(value, name) {
    if (typeof value === "string" && dateFields.has(name) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) return value.replace(" ", "T") + "Z";
    return value;
  }
}
function database(executor = pool) {
  return {
    prepare(original) {
      let values = [];
      return {
        bind(...args) {
          values = args.map(param);
          return this;
        },
        async execute(arrayMode = false) {
          let sql2 = mysqlSQL(original);
          if (/ON\s+CONFLICT\s*(?:\([^)]*\))?\s+DO\s+NOTHING/gi.test(original)) sql2 = sql2.replace(/^insert into/i, "INSERT IGNORE INTO");
          const returning = sql2.match(/\s+returning\s+([\s\S]+)$/i);
          if (returning) sql2 = sql2.slice(0, returning.index);
          const connection = typeof executor.getConnection === "function" ? await executor.getConnection() : executor;
          try {
            const [result, fields] = await connection.query({ sql: sql2, rowsAsArray: arrayMode }, values);
            if (returning) {
              const table = sql2.match(/^insert\s+(?:ignore\s+)?into\s+(`?[a-z_0-9]+`?)/i)?.[1];
              if (!table || !result.insertId) throw new Error("N\xE3o foi poss\xEDvel recuperar o registro salvo.");
              const [rows, returnedFields] = await connection.query({ sql: `SELECT ${returning[1]} FROM ${table} WHERE id=?`, rowsAsArray: arrayMode }, [result.insertId]);
              return { rows: rows.map((row) => normalizeRow(row, returnedFields)), meta: { changes: result.affectedRows, last_row_id: result.insertId } };
            }
            if (Array.isArray(result)) return { rows: result.map((row) => normalizeRow(row, fields)), meta: {} };
            return { rows: [], meta: { changes: result.affectedRows, last_row_id: result.insertId } };
          } finally {
            if (connection !== executor) connection.release();
          }
        },
        async all() {
          const result = await this.execute();
          return { success: true, results: result.rows, meta: result.meta };
        },
        async raw() {
          return (await this.execute(true)).rows;
        },
        async first(column) {
          const first = (await this.execute()).rows[0] || null;
          return column && first ? first[column] : first;
        },
        async run() {
          return { success: true, meta: (await this.execute()).meta };
        }
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.all()));
    }
  };
}
async function* bytes(value) {
  if (value instanceof ReadableStream) {
    const reader = value.getReader();
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        yield Buffer.from(item.value);
      }
    } finally {
      reader.releaseLock();
    }
  } else if (value instanceof Blob) yield* bytes(value.stream());
  else if (value instanceof ArrayBuffer) yield Buffer.from(value);
  else if (ArrayBuffer.isView(value)) yield Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else if (typeof value === "string") yield Buffer.from(value);
  else if (value?.[Symbol.asyncIterator]) for await (const chunk of value) yield Buffer.from(chunk);
  else throw new Error("Formato de arquivo inv\xE1lido.");
}
var pool, digest, BUCKET, env;
var init_mysql_platform = __esm({
  "runtime/mysql-platform.mjs"() {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 8,
      charset: "utf8mb4",
      dateStrings: true,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: false,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : void 0
    });
    pool.on("connection", (connection) => connection.query("SET time_zone = '+00:00'"));
    digest = (value) => createHash("sha256").update(value).digest("hex");
    BUCKET = {
      async put(key, value, options = {}) {
        const id = digest(key), version2 = randomUUID();
        let index2 = 0, size = 0;
        const hash = createHash("sha256");
        try {
          for await (const chunk of bytes(value)) {
            hash.update(chunk);
            size += chunk.length;
            if (size > 150 * 1024 * 1024) throw new Error("O arquivo excede o limite de 150 MB.");
            for (let offset = 0; offset < chunk.length; offset += 512 * 1024) {
              await pool.execute("INSERT INTO hostinger_object_chunks (version_id,chunk_index,data) VALUES (?,?,?)", [version2, index2++, chunk.subarray(offset, offset + 512 * 1024)]);
            }
          }
          const [old] = await pool.execute("SELECT version_id FROM hostinger_objects WHERE id=?", [id]);
          await pool.execute("INSERT INTO hostinger_objects(id,object_key,version_id,size,etag,http_metadata) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version_id=VALUES(version_id),size=VALUES(size),etag=VALUES(etag),http_metadata=VALUES(http_metadata)", [id, key, version2, size, hash.digest("hex"), JSON.stringify(options.httpMetadata || {})]);
          if (old[0]) await pool.execute("DELETE FROM hostinger_object_chunks WHERE version_id=?", [old[0].version_id]);
          return this.head(key);
        } catch (error) {
          await pool.execute("DELETE FROM hostinger_object_chunks WHERE version_id=?", [version2]).catch(() => {
          });
          throw error;
        }
      },
      async head(key) {
        const [rows] = await pool.execute("SELECT * FROM hostinger_objects WHERE id=?", [digest(key)]);
        if (!rows[0]) return null;
        const row = rows[0];
        return { key, size: Number(row.size), etag: row.etag, version: row.version_id, httpMetadata: JSON.parse(row.http_metadata || "{}") };
      },
      async get(key) {
        const metadata = await this.head(key);
        if (!metadata) return null;
        let index2 = 0;
        const body = new ReadableStream({ async pull(controller) {
          try {
            const [rows] = await pool.execute("SELECT data FROM hostinger_object_chunks WHERE version_id=? AND chunk_index=?", [metadata.version, index2++]);
            if (!rows.length) controller.close();
            else controller.enqueue(new Uint8Array(rows[0].data));
          } catch (error) {
            controller.error(error);
          }
        } });
        return { ...metadata, body, async arrayBuffer() {
          return new Response(body).arrayBuffer();
        } };
      },
      async delete(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          const meta = await this.head(key);
          if (!meta) continue;
          await pool.execute("DELETE FROM hostinger_objects WHERE id=?", [digest(key)]);
          await pool.execute("DELETE FROM hostinger_object_chunks WHERE version_id=?", [meta.version]);
        }
      }
    };
    env = { DB: database(), BUCKET };
  }
});

// runtime/server-entry.mjs
init_mysql_platform();
import http from "node:http";
import { Readable } from "node:stream";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

// runtime/request-context.mjs
import { AsyncLocalStorage } from "node:async_hooks";
var context = new AsyncLocalStorage();
function withRequest(request, fn) {
  return context.run(request, fn);
}
async function headers() {
  return context.getStore()?.headers || new Headers();
}

// source/app/chatgpt-auth.ts
var USER_EMAIL_HEADER = "oai-authenticated-user-email";
var USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
var USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
var PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
async function getChatGPTUser() {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;
  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName = encodedFullName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8 ? safeDecodeURIComponent(encodedFullName) : null;
  return {
    displayName: fullName ?? email,
    email,
    fullName
  };
}
function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

// source/app/ponto-auth.ts
var PONTO_COOKIE = "ponto_dimivig_session";
var PASSWORD_ITERATIONS = 1e5;
var PLATFORM_OWNER_EMAIL = process.env.OWNER_EMAIL || "dimivigia@gmail.com";
var encoder = new TextEncoder();
function bytesToHex(bytes2) {
  return Array.from(bytes2, (value) => value.toString(16).padStart(2, "0")).join("");
}
function bytesToBase64(bytes2) {
  let binary = "";
  for (const byte of bytes2) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomSecret(size = 32) {
  const bytes2 = crypto.getRandomValues(new Uint8Array(size));
  return bytesToBase64(bytes2).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sha256(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function passwordDigest(password, saltBase64, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltBase64), iterations },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}
async function passwordMaterial(password) {
  if (password.length < 10 || password.length > 128) {
    throw new Error("A senha deve ter entre 10 e 128 caracteres.");
  }
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(18)));
  return { salt, hash: await passwordDigest(password, salt), iterations: PASSWORD_ITERATIONS };
}
function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index2 = 0; index2 < left.length; index2++) difference |= left.charCodeAt(index2) ^ right.charCodeAt(index2);
  return difference === 0;
}
function cookieValue(request, name = PONTO_COOKIE) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}
function sessionCookie(token, maxAgeSeconds) {
  return `${PONTO_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
function clearedSessionCookie() {
  return `${PONTO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
async function credentialIdentity(request, db) {
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    "SELECT c.id AS credential_id,c.email,c.must_change_password,p.name,p.status,p.role,p.employee_id,p.site_id,s.expires_at FROM ponto_sessions s JOIN ponto_credentials c ON c.id=s.credential_id JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP"
  ).bind(tokenHash).first();
  if (!row || row.status === "inactive") return null;
  await db.prepare("UPDATE ponto_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(tokenHash).run();
  return {
    email: String(row.email || ""),
    fullName: String(row.name || row.email || ""),
    displayName: String(row.name || row.email || ""),
    credentialId: Number(row.credential_id),
    mustChangePassword: Boolean(row.must_change_password),
    source: "ponto"
  };
}
async function pontoIdentity(request, db, allowPlatformOwner = true) {
  const credential = await credentialIdentity(request, db);
  if (credential) return credential;
  if (!allowPlatformOwner) return null;
  const user = await getChatGPTUser();
  if (!user || user.email.trim().toLowerCase() !== PLATFORM_OWNER_EMAIL) return null;
  return { email: user.email, fullName: user.fullName, displayName: user.displayName, source: "chatgpt" };
}
async function upsertCredential(db, profileId, email, password, mustChange = false) {
  const material = await passwordMaterial(password);
  await db.prepare(
    "INSERT INTO ponto_credentials (profile_id,email,password_hash,password_salt,iterations,must_change_password,failed_attempts,locked_until,updated_at) VALUES (?,?,?,?,?,?,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT(profile_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,password_salt=excluded.password_salt,iterations=excluded.iterations,must_change_password=excluded.must_change_password,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP"
  ).bind(profileId, email.trim().toLowerCase(), material.hash, material.salt, material.iterations, mustChange ? 1 : 0).run();
}
async function createPontoSession(db, credentialId, request, remember = false) {
  const token = randomSecret(36);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const expiresAt = new Date(Date.now() + maxAge * 1e3).toISOString();
  await db.prepare("DELETE FROM ponto_sessions WHERE expires_at<=CURRENT_TIMESTAMP").run();
  await db.prepare("INSERT INTO ponto_sessions (id,credential_id,token_hash,expires_at,user_agent) VALUES (?,?,?,?,?)").bind(id, credentialId, tokenHash, expiresAt, (request.headers.get("user-agent") || "").slice(0, 300)).run();
  return { token, maxAge, expiresAt };
}

// source/app/api/contracts/route.ts
var route_exports = {};
__export(route_exports, {
  DELETE: () => DELETE,
  GET: () => GET,
  PATCH: () => PATCH,
  POST: () => POST
});

// ../../../sites/gwl-central/node_modules/drizzle-orm/entity.js
var entityKind = /* @__PURE__ */ Symbol.for("drizzle:entityKind");
function is(value, type) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value instanceof type) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(type, entityKind)) {
    throw new Error(
      `Class "${type.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`
    );
  }
  let cls = Object.getPrototypeOf(value).constructor;
  if (cls) {
    while (cls) {
      if (entityKind in cls && cls[entityKind] === type[entityKind]) {
        return true;
      }
      cls = Object.getPrototypeOf(cls);
    }
  }
  return false;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/column.js
var Column = class {
  constructor(table, config) {
    this.table = table;
    this.config = config;
    this.name = config.name;
    this.keyAsName = config.keyAsName;
    this.notNull = config.notNull;
    this.default = config.default;
    this.defaultFn = config.defaultFn;
    this.onUpdateFn = config.onUpdateFn;
    this.hasDefault = config.hasDefault;
    this.primary = config.primaryKey;
    this.isUnique = config.isUnique;
    this.uniqueName = config.uniqueName;
    this.uniqueType = config.uniqueType;
    this.dataType = config.dataType;
    this.columnType = config.columnType;
    this.generated = config.generated;
    this.generatedIdentity = config.generatedIdentity;
  }
  static [entityKind] = "Column";
  name;
  keyAsName;
  primary;
  notNull;
  default;
  defaultFn;
  onUpdateFn;
  hasDefault;
  isUnique;
  uniqueName;
  uniqueType;
  dataType;
  columnType;
  enumValues = void 0;
  generated = void 0;
  generatedIdentity = void 0;
  config;
  mapFromDriverValue(value) {
    return value;
  }
  mapToDriverValue(value) {
    return value;
  }
  // ** @internal */
  shouldDisableInsert() {
    return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/column-builder.js
var ColumnBuilder = class {
  static [entityKind] = "ColumnBuilder";
  config;
  constructor(name, dataType, columnType) {
    this.config = {
      name,
      keyAsName: name === "",
      notNull: false,
      default: void 0,
      hasDefault: false,
      primaryKey: false,
      isUnique: false,
      uniqueName: void 0,
      uniqueType: void 0,
      dataType,
      columnType,
      generated: void 0
    };
  }
  /**
   * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
   *
   * @example
   * ```ts
   * const users = pgTable('users', {
   * 	id: integer('id').$type<UserId>().primaryKey(),
   * 	details: json('details').$type<UserDetails>().notNull(),
   * });
   * ```
   */
  $type() {
    return this;
  }
  /**
   * Adds a `not null` clause to the column definition.
   *
   * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
   */
  notNull() {
    this.config.notNull = true;
    return this;
  }
  /**
   * Adds a `default <value>` clause to the column definition.
   *
   * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
   *
   * If you need to set a dynamic default value, use {@link $defaultFn} instead.
   */
  default(value) {
    this.config.default = value;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a dynamic default value to the column.
   * The function will be called when the row is inserted, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $defaultFn(fn) {
    this.config.defaultFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $defaultFn}.
   */
  $default = this.$defaultFn;
  /**
   * Adds a dynamic update value to the column.
   * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
   * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $onUpdateFn(fn) {
    this.config.onUpdateFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $onUpdateFn}.
   */
  $onUpdate = this.$onUpdateFn;
  /**
   * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
   *
   * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
   */
  primaryKey() {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this;
  }
  /** @internal Sets the name of the column to the key within the table definition if a name was not given. */
  setName(name) {
    if (this.config.name !== "") return;
    this.config.name = name;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/table.utils.js
var TableName = /* @__PURE__ */ Symbol.for("drizzle:Name");

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/foreign-keys.js
var ForeignKeyBuilder = class {
  static [entityKind] = "PgForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate = "no action";
  /** @internal */
  _onDelete = "no action";
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action === void 0 ? "no action" : action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action === void 0 ? "no action" : action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey(table, this);
  }
};
var ForeignKey = class {
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "PgForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/tracing-utils.js
function iife(fn, ...args) {
  return fn(...args);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/unique-constraint.js
function uniqueKeyName(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
var UniqueConstraintBuilder = class {
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "PgUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  nullsNotDistinctConfig = false;
  nullsNotDistinct() {
    this.nullsNotDistinctConfig = true;
    return this;
  }
  /** @internal */
  build(table) {
    return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name);
  }
};
var UniqueOnConstraintBuilder = class {
  static [entityKind] = "PgUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder(columns, this.name);
  }
};
var UniqueConstraint = class {
  constructor(table, columns, nullsNotDistinct, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
    this.nullsNotDistinct = nullsNotDistinct;
  }
  static [entityKind] = "PgUniqueConstraint";
  columns;
  name;
  nullsNotDistinct = false;
  getName() {
    return this.name;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/utils/array.js
function parsePgArrayValue(arrayString, startFrom, inQuotes) {
  for (let i = startFrom; i < arrayString.length; i++) {
    const char = arrayString[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === '"') {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i + 1];
    }
    if (inQuotes) {
      continue;
    }
    if (char === "," || char === "}") {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i];
    }
  }
  return [arrayString.slice(startFrom).replace(/\\/g, ""), arrayString.length];
}
function parsePgNestedArray(arrayString, startFrom = 0) {
  const result = [];
  let i = startFrom;
  let lastCharIsComma = false;
  while (i < arrayString.length) {
    const char = arrayString[i];
    if (char === ",") {
      if (lastCharIsComma || i === startFrom) {
        result.push("");
      }
      lastCharIsComma = true;
      i++;
      continue;
    }
    lastCharIsComma = false;
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === '"') {
      const [value2, startFrom2] = parsePgArrayValue(arrayString, i + 1, true);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    if (char === "}") {
      return [result, i + 1];
    }
    if (char === "{") {
      const [value2, startFrom2] = parsePgNestedArray(arrayString, i + 1);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false);
    result.push(value);
    i = newStartFrom;
  }
  return [result, i];
}
function parsePgArray(arrayString) {
  const [result] = parsePgNestedArray(arrayString, 1);
  return result;
}
function makePgArray(array) {
  return `{${array.map((item) => {
    if (Array.isArray(item)) {
      return makePgArray(item);
    }
    if (typeof item === "string") {
      return `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return `${item}`;
  }).join(",")}}`;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/columns/common.js
var PgColumnBuilder = class extends ColumnBuilder {
  foreignKeyConfigs = [];
  static [entityKind] = "PgColumnBuilder";
  array(size) {
    return new PgArrayBuilder(this.config.name, this, size);
  }
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name, config) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    this.config.uniqueType = config?.nulls;
    return this;
  }
  generatedAlwaysAs(as) {
    this.config.generated = {
      as,
      type: "always",
      mode: "stored"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return iife(
        (ref2, actions2) => {
          const builder = new ForeignKeyBuilder(() => {
            const foreignColumn = ref2();
            return { columns: [column], foreignColumns: [foreignColumn] };
          });
          if (actions2.onUpdate) {
            builder.onUpdate(actions2.onUpdate);
          }
          if (actions2.onDelete) {
            builder.onDelete(actions2.onDelete);
          }
          return builder.build(table);
        },
        ref,
        actions
      );
    });
  }
  /** @internal */
  buildExtraConfigColumn(table) {
    return new ExtraConfigColumn(table, this.config);
  }
};
var PgColumn = class extends Column {
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "PgColumn";
};
var ExtraConfigColumn = class extends PgColumn {
  static [entityKind] = "ExtraConfigColumn";
  getSQLType() {
    return this.getSQLType();
  }
  indexConfig = {
    order: this.config.order ?? "asc",
    nulls: this.config.nulls ?? "last",
    opClass: this.config.opClass
  };
  defaultConfig = {
    order: "asc",
    nulls: "last",
    opClass: void 0
  };
  asc() {
    this.indexConfig.order = "asc";
    return this;
  }
  desc() {
    this.indexConfig.order = "desc";
    return this;
  }
  nullsFirst() {
    this.indexConfig.nulls = "first";
    return this;
  }
  nullsLast() {
    this.indexConfig.nulls = "last";
    return this;
  }
  /**
   * ### PostgreSQL documentation quote
   *
   * > An operator class with optional parameters can be specified for each column of an index.
   * The operator class identifies the operators to be used by the index for that column.
   * For example, a B-tree index on four-byte integers would use the int4_ops class;
   * this operator class includes comparison functions for four-byte integers.
   * In practice the default operator class for the column's data type is usually sufficient.
   * The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
   * For example, we might want to sort a complex-number data type either by absolute value or by real part.
   * We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
   * More information about operator classes check:
   *
   * ### Useful links
   * https://www.postgresql.org/docs/current/sql-createindex.html
   *
   * https://www.postgresql.org/docs/current/indexes-opclass.html
   *
   * https://www.postgresql.org/docs/current/xindex.html
   *
   * ### Additional types
   * If you have the `pg_vector` extension installed in your database, you can use the
   * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
   *
   * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
   *
   * @param opClass
   * @returns
   */
  op(opClass) {
    this.indexConfig.opClass = opClass;
    return this;
  }
};
var IndexedColumn = class {
  static [entityKind] = "IndexedColumn";
  constructor(name, keyAsName, type, indexConfig) {
    this.name = name;
    this.keyAsName = keyAsName;
    this.type = type;
    this.indexConfig = indexConfig;
  }
  name;
  keyAsName;
  type;
  indexConfig;
};
var PgArrayBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgArrayBuilder";
  constructor(name, baseBuilder, size) {
    super(name, "array", "PgArray");
    this.config.baseBuilder = baseBuilder;
    this.config.size = size;
  }
  /** @internal */
  build(table) {
    const baseColumn = this.config.baseBuilder.build(table);
    return new PgArray(
      table,
      this.config,
      baseColumn
    );
  }
};
var PgArray = class _PgArray extends PgColumn {
  constructor(table, config, baseColumn, range) {
    super(table, config);
    this.baseColumn = baseColumn;
    this.range = range;
    this.size = config.size;
  }
  size;
  static [entityKind] = "PgArray";
  getSQLType() {
    return `${this.baseColumn.getSQLType()}[${typeof this.size === "number" ? this.size : ""}]`;
  }
  mapFromDriverValue(value) {
    if (typeof value === "string") {
      value = parsePgArray(value);
    }
    return value.map((v) => this.baseColumn.mapFromDriverValue(v));
  }
  mapToDriverValue(value, isNestedArray = false) {
    const a = value.map(
      (v) => v === null ? null : is(this.baseColumn, _PgArray) ? this.baseColumn.mapToDriverValue(v, true) : this.baseColumn.mapToDriverValue(v)
    );
    if (isNestedArray) return a;
    return makePgArray(a);
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/columns/enum.js
var PgEnumObjectColumnBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgEnumObjectColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumObjectColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumObjectColumn(
      table,
      this.config
    );
  }
};
var PgEnumObjectColumn = class extends PgColumn {
  static [entityKind] = "PgEnumObjectColumn";
  enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};
var isPgEnumSym = /* @__PURE__ */ Symbol.for("drizzle:isPgEnum");
function isPgEnum(obj) {
  return !!obj && typeof obj === "function" && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}
var PgEnumColumnBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgEnumColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumColumn(
      table,
      this.config
    );
  }
};
var PgEnumColumn = class extends PgColumn {
  static [entityKind] = "PgEnumColumn";
  enum = this.config.enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/subquery.js
var Subquery = class {
  static [entityKind] = "Subquery";
  constructor(sql2, fields, alias, isWith = false, usedTables = []) {
    this._ = {
      brand: "Subquery",
      sql: sql2,
      selectedFields: fields,
      alias,
      isWith,
      usedTables
    };
  }
  // getSQL(): SQL<unknown> {
  // 	return new SQL([this]);
  // }
};
var WithSubquery = class extends Subquery {
  static [entityKind] = "WithSubquery";
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/version.js
var version = "0.45.2";

// ../../../sites/gwl-central/node_modules/drizzle-orm/tracing.js
var otel;
var rawTracer;
var tracer = {
  startActiveSpan(name, fn) {
    if (!otel) {
      return fn();
    }
    if (!rawTracer) {
      rawTracer = otel.trace.getTracer("drizzle-orm", version);
    }
    return iife(
      (otel2, rawTracer2) => rawTracer2.startActiveSpan(
        name,
        (span) => {
          try {
            return fn(span);
          } catch (e) {
            span.setStatus({
              code: otel2.SpanStatusCode.ERROR,
              message: e instanceof Error ? e.message : "Unknown error"
              // eslint-disable-line no-instanceof/no-instanceof
            });
            throw e;
          } finally {
            span.end();
          }
        }
      ),
      otel,
      rawTracer
    );
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/view-common.js
var ViewBaseConfig = /* @__PURE__ */ Symbol.for("drizzle:ViewBaseConfig");

// ../../../sites/gwl-central/node_modules/drizzle-orm/table.js
var Schema = /* @__PURE__ */ Symbol.for("drizzle:Schema");
var Columns = /* @__PURE__ */ Symbol.for("drizzle:Columns");
var ExtraConfigColumns = /* @__PURE__ */ Symbol.for("drizzle:ExtraConfigColumns");
var OriginalName = /* @__PURE__ */ Symbol.for("drizzle:OriginalName");
var BaseName = /* @__PURE__ */ Symbol.for("drizzle:BaseName");
var IsAlias = /* @__PURE__ */ Symbol.for("drizzle:IsAlias");
var ExtraConfigBuilder = /* @__PURE__ */ Symbol.for("drizzle:ExtraConfigBuilder");
var IsDrizzleTable = /* @__PURE__ */ Symbol.for("drizzle:IsDrizzleTable");
var Table = class {
  static [entityKind] = "Table";
  /** @internal */
  static Symbol = {
    Name: TableName,
    Schema,
    OriginalName,
    Columns,
    ExtraConfigColumns,
    BaseName,
    IsAlias,
    ExtraConfigBuilder
  };
  /**
   * @internal
   * Can be changed if the table is aliased.
   */
  [TableName];
  /**
   * @internal
   * Used to store the original name of the table, before any aliasing.
   */
  [OriginalName];
  /** @internal */
  [Schema];
  /** @internal */
  [Columns];
  /** @internal */
  [ExtraConfigColumns];
  /**
   *  @internal
   * Used to store the table name before the transformation via the `tableCreator` functions.
   */
  [BaseName];
  /** @internal */
  [IsAlias] = false;
  /** @internal */
  [IsDrizzleTable] = true;
  /** @internal */
  [ExtraConfigBuilder] = void 0;
  constructor(name, schema, baseName) {
    this[TableName] = this[OriginalName] = name;
    this[Schema] = schema;
    this[BaseName] = baseName;
  }
};
function getTableName(table) {
  return table[TableName];
}
function getTableUniqueName(table) {
  return `${table[Schema] ?? "public"}.${table[TableName]}`;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sql/sql.js
var FakePrimitiveParam = class {
  static [entityKind] = "FakePrimitiveParam";
};
function isSQLWrapper(value) {
  return value !== null && value !== void 0 && typeof value.getSQL === "function";
}
function mergeQueries(queries) {
  const result = { sql: "", params: [] };
  for (const query of queries) {
    result.sql += query.sql;
    result.params.push(...query.params);
    if (query.typings?.length) {
      if (!result.typings) {
        result.typings = [];
      }
      result.typings.push(...query.typings);
    }
  }
  return result;
}
var StringChunk = class {
  static [entityKind] = "StringChunk";
  value;
  constructor(value) {
    this.value = Array.isArray(value) ? value : [value];
  }
  getSQL() {
    return new SQL([this]);
  }
};
var SQL = class _SQL {
  constructor(queryChunks) {
    this.queryChunks = queryChunks;
    for (const chunk of queryChunks) {
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        this.usedTables.push(
          schemaName === void 0 ? chunk[Table.Symbol.Name] : schemaName + "." + chunk[Table.Symbol.Name]
        );
      }
    }
  }
  static [entityKind] = "SQL";
  /** @internal */
  decoder = noopDecoder;
  shouldInlineParams = false;
  /** @internal */
  usedTables = [];
  append(query) {
    this.queryChunks.push(...query.queryChunks);
    return this;
  }
  toQuery(config) {
    return tracer.startActiveSpan("drizzle.buildSQL", (span) => {
      const query = this.buildQueryFromSourceParams(this.queryChunks, config);
      span?.setAttributes({
        "drizzle.query.text": query.sql,
        "drizzle.query.params": JSON.stringify(query.params)
      });
      return query;
    });
  }
  buildQueryFromSourceParams(chunks, _config) {
    const config = Object.assign({}, _config, {
      inlineParams: _config.inlineParams || this.shouldInlineParams,
      paramStartIndex: _config.paramStartIndex || { value: 0 }
    });
    const {
      casing,
      escapeName,
      escapeParam,
      prepareTyping,
      inlineParams,
      paramStartIndex
    } = config;
    return mergeQueries(chunks.map((chunk) => {
      if (is(chunk, StringChunk)) {
        return { sql: chunk.value.join(""), params: [] };
      }
      if (is(chunk, Name)) {
        return { sql: escapeName(chunk.value), params: [] };
      }
      if (chunk === void 0) {
        return { sql: "", params: [] };
      }
      if (Array.isArray(chunk)) {
        const result = [new StringChunk("(")];
        for (const [i, p] of chunk.entries()) {
          result.push(p);
          if (i < chunk.length - 1) {
            result.push(new StringChunk(", "));
          }
        }
        result.push(new StringChunk(")"));
        return this.buildQueryFromSourceParams(result, config);
      }
      if (is(chunk, _SQL)) {
        return this.buildQueryFromSourceParams(chunk.queryChunks, {
          ...config,
          inlineParams: inlineParams || chunk.shouldInlineParams
        });
      }
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        const tableName = chunk[Table.Symbol.Name];
        return {
          sql: schemaName === void 0 || chunk[IsAlias] ? escapeName(tableName) : escapeName(schemaName) + "." + escapeName(tableName),
          params: []
        };
      }
      if (is(chunk, Column)) {
        const columnName = casing.getColumnCasing(chunk);
        if (_config.invokeSource === "indexes") {
          return { sql: escapeName(columnName), params: [] };
        }
        const schemaName = chunk.table[Table.Symbol.Schema];
        return {
          sql: chunk.table[IsAlias] || schemaName === void 0 ? escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName) : escapeName(schemaName) + "." + escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName),
          params: []
        };
      }
      if (is(chunk, View)) {
        const schemaName = chunk[ViewBaseConfig].schema;
        const viewName = chunk[ViewBaseConfig].name;
        return {
          sql: schemaName === void 0 || chunk[ViewBaseConfig].isAlias ? escapeName(viewName) : escapeName(schemaName) + "." + escapeName(viewName),
          params: []
        };
      }
      if (is(chunk, Param)) {
        if (is(chunk.value, Placeholder)) {
          return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
        }
        const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
        if (is(mappedValue, _SQL)) {
          return this.buildQueryFromSourceParams([mappedValue], config);
        }
        if (inlineParams) {
          return { sql: this.mapInlineParam(mappedValue, config), params: [] };
        }
        let typings = ["none"];
        if (prepareTyping) {
          typings = [prepareTyping(chunk.encoder)];
        }
        return { sql: escapeParam(paramStartIndex.value++, mappedValue), params: [mappedValue], typings };
      }
      if (is(chunk, Placeholder)) {
        return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
      }
      if (is(chunk, _SQL.Aliased) && chunk.fieldAlias !== void 0) {
        return { sql: escapeName(chunk.fieldAlias), params: [] };
      }
      if (is(chunk, Subquery)) {
        if (chunk._.isWith) {
          return { sql: escapeName(chunk._.alias), params: [] };
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk._.sql,
          new StringChunk(") "),
          new Name(chunk._.alias)
        ], config);
      }
      if (isPgEnum(chunk)) {
        if (chunk.schema) {
          return { sql: escapeName(chunk.schema) + "." + escapeName(chunk.enumName), params: [] };
        }
        return { sql: escapeName(chunk.enumName), params: [] };
      }
      if (isSQLWrapper(chunk)) {
        if (chunk.shouldOmitSQLParens?.()) {
          return this.buildQueryFromSourceParams([chunk.getSQL()], config);
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk.getSQL(),
          new StringChunk(")")
        ], config);
      }
      if (inlineParams) {
        return { sql: this.mapInlineParam(chunk, config), params: [] };
      }
      return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
    }));
  }
  mapInlineParam(chunk, { escapeString }) {
    if (chunk === null) {
      return "null";
    }
    if (typeof chunk === "number" || typeof chunk === "boolean") {
      return chunk.toString();
    }
    if (typeof chunk === "string") {
      return escapeString(chunk);
    }
    if (typeof chunk === "object") {
      const mappedValueAsString = chunk.toString();
      if (mappedValueAsString === "[object Object]") {
        return escapeString(JSON.stringify(chunk));
      }
      return escapeString(mappedValueAsString);
    }
    throw new Error("Unexpected param value: " + chunk);
  }
  getSQL() {
    return this;
  }
  as(alias) {
    if (alias === void 0) {
      return this;
    }
    return new _SQL.Aliased(this, alias);
  }
  mapWith(decoder) {
    this.decoder = typeof decoder === "function" ? { mapFromDriverValue: decoder } : decoder;
    return this;
  }
  inlineParams() {
    this.shouldInlineParams = true;
    return this;
  }
  /**
   * This method is used to conditionally include a part of the query.
   *
   * @param condition - Condition to check
   * @returns itself if the condition is `true`, otherwise `undefined`
   */
  if(condition) {
    return condition ? this : void 0;
  }
};
var Name = class {
  constructor(value) {
    this.value = value;
  }
  static [entityKind] = "Name";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function isDriverValueEncoder(value) {
  return typeof value === "object" && value !== null && "mapToDriverValue" in value && typeof value.mapToDriverValue === "function";
}
var noopDecoder = {
  mapFromDriverValue: (value) => value
};
var noopEncoder = {
  mapToDriverValue: (value) => value
};
var noopMapper = {
  ...noopDecoder,
  ...noopEncoder
};
var Param = class {
  /**
   * @param value - Parameter value
   * @param encoder - Encoder to convert the value to a driver parameter
   */
  constructor(value, encoder2 = noopEncoder) {
    this.value = value;
    this.encoder = encoder2;
  }
  static [entityKind] = "Param";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function sql(strings, ...params) {
  const queryChunks = [];
  if (params.length > 0 || strings.length > 0 && strings[0] !== "") {
    queryChunks.push(new StringChunk(strings[0]));
  }
  for (const [paramIndex, param2] of params.entries()) {
    queryChunks.push(param2, new StringChunk(strings[paramIndex + 1]));
  }
  return new SQL(queryChunks);
}
((sql2) => {
  function empty() {
    return new SQL([]);
  }
  sql2.empty = empty;
  function fromList(list) {
    return new SQL(list);
  }
  sql2.fromList = fromList;
  function raw(str) {
    return new SQL([new StringChunk(str)]);
  }
  sql2.raw = raw;
  function join(chunks, separator) {
    const result = [];
    for (const [i, chunk] of chunks.entries()) {
      if (i > 0 && separator !== void 0) {
        result.push(separator);
      }
      result.push(chunk);
    }
    return new SQL(result);
  }
  sql2.join = join;
  function identifier(value) {
    return new Name(value);
  }
  sql2.identifier = identifier;
  function placeholder2(name2) {
    return new Placeholder(name2);
  }
  sql2.placeholder = placeholder2;
  function param2(value, encoder2) {
    return new Param(value, encoder2);
  }
  sql2.param = param2;
})(sql || (sql = {}));
((SQL2) => {
  class Aliased {
    constructor(sql2, fieldAlias) {
      this.sql = sql2;
      this.fieldAlias = fieldAlias;
    }
    static [entityKind] = "SQL.Aliased";
    /** @internal */
    isSelectionField = false;
    getSQL() {
      return this.sql;
    }
    /** @internal */
    clone() {
      return new Aliased(this.sql, this.fieldAlias);
    }
  }
  SQL2.Aliased = Aliased;
})(SQL || (SQL = {}));
var Placeholder = class {
  constructor(name2) {
    this.name = name2;
  }
  static [entityKind] = "Placeholder";
  getSQL() {
    return new SQL([this]);
  }
};
function fillPlaceholders(params, values) {
  return params.map((p) => {
    if (is(p, Placeholder)) {
      if (!(p.name in values)) {
        throw new Error(`No value for placeholder "${p.name}" was provided`);
      }
      return values[p.name];
    }
    if (is(p, Param) && is(p.value, Placeholder)) {
      if (!(p.value.name in values)) {
        throw new Error(`No value for placeholder "${p.value.name}" was provided`);
      }
      return p.encoder.mapToDriverValue(values[p.value.name]);
    }
    return p;
  });
}
var IsDrizzleView = /* @__PURE__ */ Symbol.for("drizzle:IsDrizzleView");
var View = class {
  static [entityKind] = "View";
  /** @internal */
  [ViewBaseConfig];
  /** @internal */
  [IsDrizzleView] = true;
  constructor({ name: name2, schema, selectedFields, query }) {
    this[ViewBaseConfig] = {
      name: name2,
      originalName: name2,
      schema,
      selectedFields,
      query,
      isExisting: !query,
      isAlias: false
    };
  }
  getSQL() {
    return new SQL([this]);
  }
};
Column.prototype.getSQL = function() {
  return new SQL([this]);
};
Table.prototype.getSQL = function() {
  return new SQL([this]);
};
Subquery.prototype.getSQL = function() {
  return new SQL([this]);
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/alias.js
var ColumnAliasProxyHandler = class {
  constructor(table) {
    this.table = table;
  }
  static [entityKind] = "ColumnAliasProxyHandler";
  get(columnObj, prop) {
    if (prop === "table") {
      return this.table;
    }
    return columnObj[prop];
  }
};
var TableAliasProxyHandler = class {
  constructor(alias, replaceOriginalName) {
    this.alias = alias;
    this.replaceOriginalName = replaceOriginalName;
  }
  static [entityKind] = "TableAliasProxyHandler";
  get(target, prop) {
    if (prop === Table.Symbol.IsAlias) {
      return true;
    }
    if (prop === Table.Symbol.Name) {
      return this.alias;
    }
    if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
      return this.alias;
    }
    if (prop === ViewBaseConfig) {
      return {
        ...target[ViewBaseConfig],
        name: this.alias,
        isAlias: true
      };
    }
    if (prop === Table.Symbol.Columns) {
      const columns = target[Table.Symbol.Columns];
      if (!columns) {
        return columns;
      }
      const proxiedColumns = {};
      Object.keys(columns).map((key) => {
        proxiedColumns[key] = new Proxy(
          columns[key],
          new ColumnAliasProxyHandler(new Proxy(target, this))
        );
      });
      return proxiedColumns;
    }
    const value = target[prop];
    if (is(value, Column)) {
      return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
    }
    return value;
  }
};
var RelationTableAliasProxyHandler = class {
  constructor(alias) {
    this.alias = alias;
  }
  static [entityKind] = "RelationTableAliasProxyHandler";
  get(target, prop) {
    if (prop === "sourceTable") {
      return aliasedTable(target.sourceTable, this.alias);
    }
    return target[prop];
  }
};
function aliasedTable(table, tableAlias) {
  return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
}
function aliasedTableColumn(column, tableAlias) {
  return new Proxy(
    column,
    new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false)))
  );
}
function mapColumnsInAliasedSQLToAlias(query, alias) {
  return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}
function mapColumnsInSQLToAlias(query, alias) {
  return sql.join(query.queryChunks.map((c) => {
    if (is(c, Column)) {
      return aliasedTableColumn(c, alias);
    }
    if (is(c, SQL)) {
      return mapColumnsInSQLToAlias(c, alias);
    }
    if (is(c, SQL.Aliased)) {
      return mapColumnsInAliasedSQLToAlias(c, alias);
    }
    return c;
  }));
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/errors.js
var DrizzleError = class extends Error {
  static [entityKind] = "DrizzleError";
  constructor({ message, cause }) {
    super(message);
    this.name = "DrizzleError";
    this.cause = cause;
  }
};
var DrizzleQueryError = class _DrizzleQueryError extends Error {
  constructor(query, params, cause) {
    super(`Failed query: ${query}
params: ${params}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
    Error.captureStackTrace(this, _DrizzleQueryError);
    if (cause) this.cause = cause;
  }
};
var TransactionRollbackError = class extends DrizzleError {
  static [entityKind] = "TransactionRollbackError";
  constructor() {
    super({ message: "Rollback" });
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/logger.js
var ConsoleLogWriter = class {
  static [entityKind] = "ConsoleLogWriter";
  write(message) {
    console.log(message);
  }
};
var DefaultLogger = class {
  static [entityKind] = "DefaultLogger";
  writer;
  constructor(config) {
    this.writer = config?.writer ?? new ConsoleLogWriter();
  }
  logQuery(query, params) {
    const stringifiedParams = params.map((p) => {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    });
    const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(", ")}]` : "";
    this.writer.write(`Query: ${query}${paramsStr}`);
  }
};
var NoopLogger = class {
  static [entityKind] = "NoopLogger";
  logQuery() {
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/query-promise.js
var QueryPromise = class {
  static [entityKind] = "QueryPromise";
  [Symbol.toStringTag] = "QueryPromise";
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/utils.js
function mapResultRow(columns, row, joinsNotNullableMap) {
  const nullifyMap = {};
  const result = columns.reduce(
    (result2, { path, field }, columnIndex) => {
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else if (is(field, Subquery)) {
        decoder = field._.sql.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      let node = result2;
      for (const [pathChunkIndex, pathChunk] of path.entries()) {
        if (pathChunkIndex < path.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk];
        } else {
          const rawValue = row[columnIndex];
          const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
          if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
            const objectName = path[0];
            if (!(objectName in nullifyMap)) {
              nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
            } else if (typeof nullifyMap[objectName] === "string" && nullifyMap[objectName] !== getTableName(field.table)) {
              nullifyMap[objectName] = false;
            }
          }
        }
      }
      return result2;
    },
    {}
  );
  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}
function orderSelectedFields(fields, pathPrefix) {
  return Object.entries(fields).reduce((result, [name, field]) => {
    if (typeof name !== "string") {
      return result;
    }
    const newPath = pathPrefix ? [...pathPrefix, name] : [name];
    if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
      result.push({ path: newPath, field });
    } else if (is(field, Table)) {
      result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
    } else {
      result.push(...orderSelectedFields(field, newPath));
    }
    return result;
  }, []);
}
function haveSameKeys(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const [index2, key] of leftKeys.entries()) {
    if (key !== rightKeys[index2]) {
      return false;
    }
  }
  return true;
}
function mapUpdateSet(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== void 0).map(([key, value]) => {
    if (is(value, SQL) || is(value, Column)) {
      return [key, value];
    } else {
      return [key, new Param(value, table[Table.Symbol.Columns][key])];
    }
  });
  if (entries.length === 0) {
    throw new Error("No values to set");
  }
  return Object.fromEntries(entries);
}
function applyMixins(baseClass, extendedClasses) {
  for (const extendedClass of extendedClasses) {
    for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        baseClass.prototype,
        name,
        Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || /* @__PURE__ */ Object.create(null)
      );
    }
  }
}
function getTableColumns(table) {
  return table[Table.Symbol.Columns];
}
function getTableLikeName(table) {
  return is(table, Subquery) ? table._.alias : is(table, View) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : table[Table.Symbol.IsAlias] ? table[Table.Symbol.Name] : table[Table.Symbol.BaseName];
}
function getColumnNameAndConfig(a, b) {
  return {
    name: typeof a === "string" && a.length > 0 ? a : "",
    config: typeof a === "object" ? a : b
  };
}
var textDecoder = typeof TextDecoder === "undefined" ? null : new TextDecoder();

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/table.js
var InlineForeignKeys = /* @__PURE__ */ Symbol.for("drizzle:PgInlineForeignKeys");
var EnableRLS = /* @__PURE__ */ Symbol.for("drizzle:EnableRLS");
var PgTable = class extends Table {
  static [entityKind] = "PgTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys,
    EnableRLS
  });
  /**@internal */
  [InlineForeignKeys] = [];
  /** @internal */
  [EnableRLS] = false;
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
  /** @internal */
  [Table.Symbol.ExtraConfigColumns] = {};
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/pg-core/primary-keys.js
var PrimaryKeyBuilder = class {
  static [entityKind] = "PgPrimaryKeyBuilder";
  /** @internal */
  columns;
  /** @internal */
  name;
  constructor(columns, name) {
    this.columns = columns;
    this.name = name;
  }
  /** @internal */
  build(table) {
    return new PrimaryKey(table, this.columns, this.name);
  }
};
var PrimaryKey = class {
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name;
  }
  static [entityKind] = "PgPrimaryKey";
  columns;
  name;
  getName() {
    return this.name ?? `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join("_")}_pk`;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sql/expressions/conditions.js
function bindIfParam(value, column) {
  if (isDriverValueEncoder(column) && !isSQLWrapper(value) && !is(value, Param) && !is(value, Placeholder) && !is(value, Column) && !is(value, Table) && !is(value, View)) {
    return new Param(value, column);
  }
  return value;
}
var eq = (left, right) => {
  return sql`${left} = ${bindIfParam(right, left)}`;
};
var ne = (left, right) => {
  return sql`${left} <> ${bindIfParam(right, left)}`;
};
function and(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" and ")),
    new StringChunk(")")
  ]);
}
function or(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" or ")),
    new StringChunk(")")
  ]);
}
function not(condition) {
  return sql`not ${condition}`;
}
var gt = (left, right) => {
  return sql`${left} > ${bindIfParam(right, left)}`;
};
var gte = (left, right) => {
  return sql`${left} >= ${bindIfParam(right, left)}`;
};
var lt = (left, right) => {
  return sql`${left} < ${bindIfParam(right, left)}`;
};
var lte = (left, right) => {
  return sql`${left} <= ${bindIfParam(right, left)}`;
};
function inArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`false`;
    }
    return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} in ${bindIfParam(values, column)}`;
}
function notInArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`true`;
    }
    return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} not in ${bindIfParam(values, column)}`;
}
function isNull(value) {
  return sql`${value} is null`;
}
function isNotNull(value) {
  return sql`${value} is not null`;
}
function exists(subquery) {
  return sql`exists ${subquery}`;
}
function notExists(subquery) {
  return sql`not exists ${subquery}`;
}
function between(column, min, max) {
  return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(
    max,
    column
  )}`;
}
function notBetween(column, min, max) {
  return sql`${column} not between ${bindIfParam(
    min,
    column
  )} and ${bindIfParam(max, column)}`;
}
function like(column, value) {
  return sql`${column} like ${value}`;
}
function notLike(column, value) {
  return sql`${column} not like ${value}`;
}
function ilike(column, value) {
  return sql`${column} ilike ${value}`;
}
function notIlike(column, value) {
  return sql`${column} not ilike ${value}`;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sql/expressions/select.js
function asc(column) {
  return sql`${column} asc`;
}
function desc(column) {
  return sql`${column} desc`;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/relations.js
var Relation = class {
  constructor(sourceTable, referencedTable, relationName) {
    this.sourceTable = sourceTable;
    this.referencedTable = referencedTable;
    this.relationName = relationName;
    this.referencedTableName = referencedTable[Table.Symbol.Name];
  }
  static [entityKind] = "Relation";
  referencedTableName;
  fieldName;
};
var Relations = class {
  constructor(table, config) {
    this.table = table;
    this.config = config;
  }
  static [entityKind] = "Relations";
};
var One = class _One extends Relation {
  constructor(sourceTable, referencedTable, config, isNullable) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
    this.isNullable = isNullable;
  }
  static [entityKind] = "One";
  withFieldName(fieldName) {
    const relation = new _One(
      this.sourceTable,
      this.referencedTable,
      this.config,
      this.isNullable
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
var Many = class _Many extends Relation {
  constructor(sourceTable, referencedTable, config) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
  }
  static [entityKind] = "Many";
  withFieldName(fieldName) {
    const relation = new _Many(
      this.sourceTable,
      this.referencedTable,
      this.config
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
function getOperators() {
  return {
    and,
    between,
    eq,
    exists,
    gt,
    gte,
    ilike,
    inArray,
    isNull,
    isNotNull,
    like,
    lt,
    lte,
    ne,
    not,
    notBetween,
    notExists,
    notLike,
    notIlike,
    notInArray,
    or,
    sql
  };
}
function getOrderByOperators() {
  return {
    sql,
    asc,
    desc
  };
}
function extractTablesRelationalConfig(schema, configHelpers) {
  if (Object.keys(schema).length === 1 && "default" in schema && !is(schema["default"], Table)) {
    schema = schema["default"];
  }
  const tableNamesMap = {};
  const relationsBuffer = {};
  const tablesConfig = {};
  for (const [key, value] of Object.entries(schema)) {
    if (is(value, Table)) {
      const dbName = getTableUniqueName(value);
      const bufferedRelations = relationsBuffer[dbName];
      tableNamesMap[dbName] = key;
      tablesConfig[key] = {
        tsName: key,
        dbName: value[Table.Symbol.Name],
        schema: value[Table.Symbol.Schema],
        columns: value[Table.Symbol.Columns],
        relations: bufferedRelations?.relations ?? {},
        primaryKey: bufferedRelations?.primaryKey ?? []
      };
      for (const column of Object.values(
        value[Table.Symbol.Columns]
      )) {
        if (column.primary) {
          tablesConfig[key].primaryKey.push(column);
        }
      }
      const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value[Table.Symbol.ExtraConfigColumns]);
      if (extraConfig) {
        for (const configEntry of Object.values(extraConfig)) {
          if (is(configEntry, PrimaryKeyBuilder)) {
            tablesConfig[key].primaryKey.push(...configEntry.columns);
          }
        }
      }
    } else if (is(value, Relations)) {
      const dbName = getTableUniqueName(value.table);
      const tableName = tableNamesMap[dbName];
      const relations2 = value.config(
        configHelpers(value.table)
      );
      let primaryKey;
      for (const [relationName, relation] of Object.entries(relations2)) {
        if (tableName) {
          const tableConfig = tablesConfig[tableName];
          tableConfig.relations[relationName] = relation;
          if (primaryKey) {
            tableConfig.primaryKey.push(...primaryKey);
          }
        } else {
          if (!(dbName in relationsBuffer)) {
            relationsBuffer[dbName] = {
              relations: {},
              primaryKey
            };
          }
          relationsBuffer[dbName].relations[relationName] = relation;
        }
      }
    }
  }
  return { tables: tablesConfig, tableNamesMap };
}
function createOne(sourceTable) {
  return function one(table, config) {
    return new One(
      sourceTable,
      table,
      config,
      config?.fields.reduce((res, f) => res && f.notNull, true) ?? false
    );
  };
}
function createMany(sourceTable) {
  return function many(referencedTable, config) {
    return new Many(sourceTable, referencedTable, config);
  };
}
function normalizeRelation(schema, tableNamesMap, relation) {
  if (is(relation, One) && relation.config) {
    return {
      fields: relation.config.fields,
      references: relation.config.references
    };
  }
  const referencedTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
  if (!referencedTableTsName) {
    throw new Error(
      `Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const referencedTableConfig = schema[referencedTableTsName];
  if (!referencedTableConfig) {
    throw new Error(`Table "${referencedTableTsName}" not found in schema`);
  }
  const sourceTable = relation.sourceTable;
  const sourceTableTsName = tableNamesMap[getTableUniqueName(sourceTable)];
  if (!sourceTableTsName) {
    throw new Error(
      `Table "${sourceTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const reverseRelations = [];
  for (const referencedTableRelation of Object.values(
    referencedTableConfig.relations
  )) {
    if (relation.relationName && relation !== referencedTableRelation && referencedTableRelation.relationName === relation.relationName || !relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable) {
      reverseRelations.push(referencedTableRelation);
    }
  }
  if (reverseRelations.length > 1) {
    throw relation.relationName ? new Error(
      `There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`
    ) : new Error(
      `There are multiple relations between "${referencedTableTsName}" and "${relation.sourceTable[Table.Symbol.Name]}". Please specify relation name`
    );
  }
  if (reverseRelations[0] && is(reverseRelations[0], One) && reverseRelations[0].config) {
    return {
      fields: reverseRelations[0].config.references,
      references: reverseRelations[0].config.fields
    };
  }
  throw new Error(
    `There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`
  );
}
function createTableRelationsHelpers(sourceTable) {
  return {
    one: createOne(sourceTable),
    many: createMany(sourceTable)
  };
}
function mapRelationalRow(tablesConfig, tableConfig, row, buildQueryResultSelection, mapColumnValue = (value) => value) {
  const result = {};
  for (const [
    selectionItemIndex,
    selectionItem
  ] of buildQueryResultSelection.entries()) {
    if (selectionItem.isJson) {
      const relation = tableConfig.relations[selectionItem.tsKey];
      const rawSubRows = row[selectionItemIndex];
      const subRows = typeof rawSubRows === "string" ? JSON.parse(rawSubRows) : rawSubRows;
      result[selectionItem.tsKey] = is(relation, One) ? subRows && mapRelationalRow(
        tablesConfig,
        tablesConfig[selectionItem.relationTableTsKey],
        subRows,
        selectionItem.selection,
        mapColumnValue
      ) : subRows.map(
        (subRow) => mapRelationalRow(
          tablesConfig,
          tablesConfig[selectionItem.relationTableTsKey],
          subRow,
          selectionItem.selection,
          mapColumnValue
        )
      );
    } else {
      const value = mapColumnValue(row[selectionItemIndex]);
      const field = selectionItem.field;
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
    }
  }
  return result;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/selection-proxy.js
var SelectionProxyHandler = class _SelectionProxyHandler {
  static [entityKind] = "SelectionProxyHandler";
  config;
  constructor(config) {
    this.config = { ...config };
  }
  get(subquery, prop) {
    if (prop === "_") {
      return {
        ...subquery["_"],
        selectedFields: new Proxy(
          subquery._.selectedFields,
          this
        )
      };
    }
    if (prop === ViewBaseConfig) {
      return {
        ...subquery[ViewBaseConfig],
        selectedFields: new Proxy(
          subquery[ViewBaseConfig].selectedFields,
          this
        )
      };
    }
    if (typeof prop === "symbol") {
      return subquery[prop];
    }
    const columns = is(subquery, Subquery) ? subquery._.selectedFields : is(subquery, View) ? subquery[ViewBaseConfig].selectedFields : subquery;
    const value = columns[prop];
    if (is(value, SQL.Aliased)) {
      if (this.config.sqlAliasedBehavior === "sql" && !value.isSelectionField) {
        return value.sql;
      }
      const newValue = value.clone();
      newValue.isSelectionField = true;
      return newValue;
    }
    if (is(value, SQL)) {
      if (this.config.sqlBehavior === "sql") {
        return value;
      }
      throw new Error(
        `You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`
      );
    }
    if (is(value, Column)) {
      if (this.config.alias) {
        return new Proxy(
          value,
          new ColumnAliasProxyHandler(
            new Proxy(
              value.table,
              new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false)
            )
          )
        );
      }
      return value;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return new Proxy(value, new _SelectionProxyHandler(this.config));
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/foreign-keys.js
var ForeignKeyBuilder2 = class {
  static [entityKind] = "SQLiteForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate;
  /** @internal */
  _onDelete;
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey2(table, this);
  }
};
var ForeignKey2 = class {
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "SQLiteForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/unique-constraint.js
function uniqueKeyName2(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
var UniqueConstraintBuilder2 = class {
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "SQLiteUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  build(table) {
    return new UniqueConstraint2(table, this.columns, this.name);
  }
};
var UniqueOnConstraintBuilder2 = class {
  static [entityKind] = "SQLiteUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder2(columns, this.name);
  }
};
var UniqueConstraint2 = class {
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName2(this.table, this.columns.map((column) => column.name));
  }
  static [entityKind] = "SQLiteUniqueConstraint";
  columns;
  name;
  getName() {
    return this.name;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/common.js
var SQLiteColumnBuilder = class extends ColumnBuilder {
  static [entityKind] = "SQLiteColumnBuilder";
  foreignKeyConfigs = [];
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    return this;
  }
  generatedAlwaysAs(as, config) {
    this.config.generated = {
      as,
      type: "always",
      mode: config?.mode ?? "virtual"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return ((ref2, actions2) => {
        const builder = new ForeignKeyBuilder2(() => {
          const foreignColumn = ref2();
          return { columns: [column], foreignColumns: [foreignColumn] };
        });
        if (actions2.onUpdate) {
          builder.onUpdate(actions2.onUpdate);
        }
        if (actions2.onDelete) {
          builder.onDelete(actions2.onDelete);
        }
        return builder.build(table);
      })(ref, actions);
    });
  }
};
var SQLiteColumn = class extends Column {
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName2(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "SQLiteColumn";
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/blob.js
var SQLiteBigIntBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteBigInt(table, this.config);
  }
};
var SQLiteBigInt = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBigInt";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return BigInt(buf.toString("utf8"));
    }
    return BigInt(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(value.toString());
  }
};
var SQLiteBlobJsonBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBlobJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteBlobJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobJson(
      table,
      this.config
    );
  }
};
var SQLiteBlobJson = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBlobJson";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return JSON.parse(buf.toString("utf8"));
    }
    return JSON.parse(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(JSON.stringify(value));
  }
};
var SQLiteBlobBufferBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBlobBufferBuilder";
  constructor(name) {
    super(name, "buffer", "SQLiteBlobBuffer");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobBuffer(table, this.config);
  }
};
var SQLiteBlobBuffer = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBlobBuffer";
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    return Buffer.from(value);
  }
  getSQLType() {
    return "blob";
  }
};
function blob(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "json") {
    return new SQLiteBlobJsonBuilder(name);
  }
  if (config?.mode === "bigint") {
    return new SQLiteBigIntBuilder(name);
  }
  return new SQLiteBlobBufferBuilder(name);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/custom.js
var SQLiteCustomColumnBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteCustomColumnBuilder";
  constructor(name, fieldConfig, customTypeParams) {
    super(name, "custom", "SQLiteCustomColumn");
    this.config.fieldConfig = fieldConfig;
    this.config.customTypeParams = customTypeParams;
  }
  /** @internal */
  build(table) {
    return new SQLiteCustomColumn(
      table,
      this.config
    );
  }
};
var SQLiteCustomColumn = class extends SQLiteColumn {
  static [entityKind] = "SQLiteCustomColumn";
  sqlName;
  mapTo;
  mapFrom;
  constructor(table, config) {
    super(table, config);
    this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
    this.mapTo = config.customTypeParams.toDriver;
    this.mapFrom = config.customTypeParams.fromDriver;
  }
  getSQLType() {
    return this.sqlName;
  }
  mapFromDriverValue(value) {
    return typeof this.mapFrom === "function" ? this.mapFrom(value) : value;
  }
  mapToDriverValue(value) {
    return typeof this.mapTo === "function" ? this.mapTo(value) : value;
  }
};
function customType(customTypeParams) {
  return (a, b) => {
    const { name, config } = getColumnNameAndConfig(a, b);
    return new SQLiteCustomColumnBuilder(
      name,
      config,
      customTypeParams
    );
  };
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/integer.js
var SQLiteBaseIntegerBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBaseIntegerBuilder";
  constructor(name, dataType, columnType) {
    super(name, dataType, columnType);
    this.config.autoIncrement = false;
  }
  primaryKey(config) {
    if (config?.autoIncrement) {
      this.config.autoIncrement = true;
    }
    this.config.hasDefault = true;
    return super.primaryKey();
  }
};
var SQLiteBaseInteger = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBaseInteger";
  autoIncrement = this.config.autoIncrement;
  getSQLType() {
    return "integer";
  }
};
var SQLiteIntegerBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteIntegerBuilder";
  constructor(name) {
    super(name, "number", "SQLiteInteger");
  }
  build(table) {
    return new SQLiteInteger(
      table,
      this.config
    );
  }
};
var SQLiteInteger = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteInteger";
};
var SQLiteTimestampBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteTimestampBuilder";
  constructor(name, mode) {
    super(name, "date", "SQLiteTimestamp");
    this.config.mode = mode;
  }
  /**
   * @deprecated Use `default()` with your own expression instead.
   *
   * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
   */
  defaultNow() {
    return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
  }
  build(table) {
    return new SQLiteTimestamp(
      table,
      this.config
    );
  }
};
var SQLiteTimestamp = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteTimestamp";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    if (this.config.mode === "timestamp") {
      return new Date(value * 1e3);
    }
    return new Date(value);
  }
  mapToDriverValue(value) {
    const unix = value.getTime();
    if (this.config.mode === "timestamp") {
      return Math.floor(unix / 1e3);
    }
    return unix;
  }
};
var SQLiteBooleanBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteBooleanBuilder";
  constructor(name, mode) {
    super(name, "boolean", "SQLiteBoolean");
    this.config.mode = mode;
  }
  build(table) {
    return new SQLiteBoolean(
      table,
      this.config
    );
  }
};
var SQLiteBoolean = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteBoolean";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    return Number(value) === 1;
  }
  mapToDriverValue(value) {
    return value ? 1 : 0;
  }
};
function integer(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "timestamp" || config?.mode === "timestamp_ms") {
    return new SQLiteTimestampBuilder(name, config.mode);
  }
  if (config?.mode === "boolean") {
    return new SQLiteBooleanBuilder(name, config.mode);
  }
  return new SQLiteIntegerBuilder(name);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/numeric.js
var SQLiteNumericBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericBuilder";
  constructor(name) {
    super(name, "string", "SQLiteNumeric");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumeric(
      table,
      this.config
    );
  }
};
var SQLiteNumeric = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumeric";
  mapFromDriverValue(value) {
    if (typeof value === "string") return value;
    return String(value);
  }
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericNumberBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericNumberBuilder";
  constructor(name) {
    super(name, "number", "SQLiteNumericNumber");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericNumber(
      table,
      this.config
    );
  }
};
var SQLiteNumericNumber = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumericNumber";
  mapFromDriverValue(value) {
    if (typeof value === "number") return value;
    return Number(value);
  }
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericBigIntBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteNumericBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericBigInt(
      table,
      this.config
    );
  }
};
var SQLiteNumericBigInt = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumericBigInt";
  mapFromDriverValue = BigInt;
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
function numeric(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  const mode = config?.mode;
  return mode === "number" ? new SQLiteNumericNumberBuilder(name) : mode === "bigint" ? new SQLiteNumericBigIntBuilder(name) : new SQLiteNumericBuilder(name);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/real.js
var SQLiteRealBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteRealBuilder";
  constructor(name) {
    super(name, "number", "SQLiteReal");
  }
  /** @internal */
  build(table) {
    return new SQLiteReal(table, this.config);
  }
};
var SQLiteReal = class extends SQLiteColumn {
  static [entityKind] = "SQLiteReal";
  getSQLType() {
    return "real";
  }
};
function real(name) {
  return new SQLiteRealBuilder(name ?? "");
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/text.js
var SQLiteTextBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteTextBuilder";
  constructor(name, config) {
    super(name, "string", "SQLiteText");
    this.config.enumValues = config.enum;
    this.config.length = config.length;
  }
  /** @internal */
  build(table) {
    return new SQLiteText(
      table,
      this.config
    );
  }
};
var SQLiteText = class extends SQLiteColumn {
  static [entityKind] = "SQLiteText";
  enumValues = this.config.enumValues;
  length = this.config.length;
  constructor(table, config) {
    super(table, config);
  }
  getSQLType() {
    return `text${this.config.length ? `(${this.config.length})` : ""}`;
  }
};
var SQLiteTextJsonBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteTextJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteTextJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteTextJson(
      table,
      this.config
    );
  }
};
var SQLiteTextJson = class extends SQLiteColumn {
  static [entityKind] = "SQLiteTextJson";
  getSQLType() {
    return "text";
  }
  mapFromDriverValue(value) {
    return JSON.parse(value);
  }
  mapToDriverValue(value) {
    return JSON.stringify(value);
  }
};
function text(a, b = {}) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config.mode === "json") {
    return new SQLiteTextJsonBuilder(name);
  }
  return new SQLiteTextBuilder(name, config);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/columns/all.js
function getSQLiteColumnBuilders() {
  return {
    blob,
    customType,
    integer,
    numeric,
    real,
    text
  };
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/table.js
var InlineForeignKeys2 = /* @__PURE__ */ Symbol.for("drizzle:SQLiteInlineForeignKeys");
var SQLiteTable = class extends Table {
  static [entityKind] = "SQLiteTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys: InlineForeignKeys2
  });
  /** @internal */
  [Table.Symbol.Columns];
  /** @internal */
  [InlineForeignKeys2] = [];
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
};
function sqliteTableBase(name, columns, extraConfig, schema, baseName = name) {
  const rawTable = new SQLiteTable(name, schema, baseName);
  const parsedColumns = typeof columns === "function" ? columns(getSQLiteColumnBuilders()) : columns;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name2, colBuilderBase]) => {
      const colBuilder = colBuilderBase;
      colBuilder.setName(name2);
      const column = colBuilder.build(rawTable);
      rawTable[InlineForeignKeys2].push(...colBuilder.buildForeignKeys(column, rawTable));
      return [name2, column];
    })
  );
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;
  table[Table.Symbol.ExtraConfigColumns] = builtColumns;
  if (extraConfig) {
    table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig;
  }
  return table;
}
var sqliteTable = (name, columns, extraConfig) => {
  return sqliteTableBase(name, columns, extraConfig);
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/indexes.js
var IndexBuilderOn = class {
  constructor(name, unique) {
    this.name = name;
    this.unique = unique;
  }
  static [entityKind] = "SQLiteIndexBuilderOn";
  on(...columns) {
    return new IndexBuilder(this.name, columns, this.unique);
  }
};
var IndexBuilder = class {
  static [entityKind] = "SQLiteIndexBuilder";
  /** @internal */
  config;
  constructor(name, columns, unique) {
    this.config = {
      name,
      columns,
      unique,
      where: void 0
    };
  }
  /**
   * Condition for partial index.
   */
  where(condition) {
    this.config.where = condition;
    return this;
  }
  /** @internal */
  build(table) {
    return new Index(this.config, table);
  }
};
var Index = class {
  static [entityKind] = "SQLiteIndex";
  config;
  constructor(config, table) {
    this.config = { ...config, table };
  }
};
function index(name) {
  return new IndexBuilderOn(name, false);
}
function uniqueIndex(name) {
  return new IndexBuilderOn(name, true);
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/utils.js
function extractUsedTable(table) {
  if (is(table, SQLiteTable)) {
    return [`${table[Table.Symbol.BaseName]}`];
  }
  if (is(table, Subquery)) {
    return table._.usedTables ?? [];
  }
  if (is(table, SQL)) {
    return table.usedTables ?? [];
  }
  return [];
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/delete.js
var SQLiteDeleteBase = class extends QueryPromise {
  constructor(table, session, dialect, withList) {
    super();
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.config = { table, withList };
  }
  static [entityKind] = "SQLiteDelete";
  /** @internal */
  config;
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will delete only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be deleted.
   *
   * ```ts
   * // Delete all cars with green color
   * db.delete(cars).where(eq(cars.color, 'green'));
   * // or
   * db.delete(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Delete all BMW cars with a green color
   * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Delete all cars with the green or blue color
   * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildDeleteQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "delete",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute(placeholderValues) {
    return this._prepare().execute(placeholderValues);
  }
  $dynamic() {
    return this;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/casing.js
function toSnakeCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.map((word) => word.toLowerCase()).join("_");
}
function toCamelCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.reduce((acc, word, i) => {
    const formattedWord = i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1)}`;
    return acc + formattedWord;
  }, "");
}
function noopCase(input) {
  return input;
}
var CasingCache = class {
  static [entityKind] = "CasingCache";
  /** @internal */
  cache = {};
  cachedTables = {};
  convert;
  constructor(casing) {
    this.convert = casing === "snake_case" ? toSnakeCase : casing === "camelCase" ? toCamelCase : noopCase;
  }
  getColumnCasing(column) {
    if (!column.keyAsName) return column.name;
    const schema = column.table[Table.Symbol.Schema] ?? "public";
    const tableName = column.table[Table.Symbol.OriginalName];
    const key = `${schema}.${tableName}.${column.name}`;
    if (!this.cache[key]) {
      this.cacheTable(column.table);
    }
    return this.cache[key];
  }
  cacheTable(table) {
    const schema = table[Table.Symbol.Schema] ?? "public";
    const tableName = table[Table.Symbol.OriginalName];
    const tableKey = `${schema}.${tableName}`;
    if (!this.cachedTables[tableKey]) {
      for (const column of Object.values(table[Table.Symbol.Columns])) {
        const columnKey = `${tableKey}.${column.name}`;
        this.cache[columnKey] = this.convert(column.name);
      }
      this.cachedTables[tableKey] = true;
    }
  }
  clearCache() {
    this.cache = {};
    this.cachedTables = {};
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/view-base.js
var SQLiteViewBase = class extends View {
  static [entityKind] = "SQLiteViewBase";
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/dialect.js
var SQLiteDialect = class {
  static [entityKind] = "SQLiteDialect";
  /** @internal */
  casing;
  constructor(config) {
    this.casing = new CasingCache(config?.casing);
  }
  escapeName(name) {
    return `"${name.replace(/"/g, '""')}"`;
  }
  escapeParam(_num) {
    return "?";
  }
  escapeString(str) {
    return `'${str.replace(/'/g, "''")}'`;
  }
  buildWithCTE(queries) {
    if (!queries?.length) return void 0;
    const withSqlChunks = [sql`with `];
    for (const [i, w] of queries.entries()) {
      withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
      if (i < queries.length - 1) {
        withSqlChunks.push(sql`, `);
      }
    }
    withSqlChunks.push(sql` `);
    return sql.join(withSqlChunks);
  }
  buildDeleteQuery({
    table,
    where,
    returning,
    withList,
    limit,
    orderBy
  }) {
    const withSql = this.buildWithCTE(withList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}delete from ${table}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  buildUpdateSet(table, set) {
    const tableColumns = table[Table.Symbol.Columns];
    const columnNames = Object.keys(tableColumns).filter(
      (colName) => set[colName] !== void 0 || tableColumns[colName]?.onUpdateFn !== void 0
    );
    const setSize = columnNames.length;
    return sql.join(
      columnNames.flatMap((colName, i) => {
        const col = tableColumns[colName];
        const onUpdateFnResult = col.onUpdateFn?.();
        const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
        const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;
        if (i < setSize - 1) {
          return [res, sql.raw(", ")];
        }
        return [res];
      })
    );
  }
  buildUpdateQuery({
    table,
    set,
    where,
    returning,
    withList,
    joins,
    from,
    limit,
    orderBy
  }) {
    const withSql = this.buildWithCTE(withList);
    const setSql = this.buildUpdateSet(table, set);
    const fromSql = from && sql.join([sql.raw(" from "), this.buildFromTable(from)]);
    const joinsSql = this.buildJoins(joins);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  /**
   * Builds selection SQL with provided fields/expressions
   *
   * Examples:
   *
   * `select <selection> from`
   *
   * `insert ... returning <selection>`
   *
   * If `isSingleTable` is true, then columns won't be prefixed with table name
   */
  buildSelection(fields, { isSingleTable = false } = {}) {
    const columnsLen = fields.length;
    const chunks = fields.flatMap(({ field }, i) => {
      const chunk = [];
      if (is(field, SQL.Aliased) && field.isSelectionField) {
        chunk.push(sql.identifier(field.fieldAlias));
      } else if (is(field, SQL.Aliased) || is(field, SQL)) {
        const query = is(field, SQL.Aliased) ? field.sql : field;
        if (isSingleTable) {
          chunk.push(
            new SQL(
              query.queryChunks.map((c) => {
                if (is(c, Column)) {
                  return sql.identifier(this.casing.getColumnCasing(c));
                }
                return c;
              })
            )
          );
        } else {
          chunk.push(query);
        }
        if (is(field, SQL.Aliased)) {
          chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
        }
      } else if (is(field, Column)) {
        const tableName = field.table[Table.Symbol.Name];
        if (field.columnType === "SQLiteNumericBigInt") {
          if (isSingleTable) {
            chunk.push(
              sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          } else {
            chunk.push(
              sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          }
        } else {
          if (isSingleTable) {
            chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
          } else {
            chunk.push(
              sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`
            );
          }
        }
      } else if (is(field, Subquery)) {
        const entries = Object.entries(field._.selectedFields);
        if (entries.length === 1) {
          const entry = entries[0][1];
          const fieldDecoder = is(entry, SQL) ? entry.decoder : is(entry, Column) ? { mapFromDriverValue: (v) => entry.mapFromDriverValue(v) } : entry.sql.decoder;
          if (fieldDecoder) field._.sql.decoder = fieldDecoder;
        }
        chunk.push(field);
      }
      if (i < columnsLen - 1) {
        chunk.push(sql`, `);
      }
      return chunk;
    });
    return sql.join(chunks);
  }
  buildJoins(joins) {
    if (!joins || joins.length === 0) {
      return void 0;
    }
    const joinsArray = [];
    if (joins) {
      for (const [index2, joinMeta] of joins.entries()) {
        if (index2 === 0) {
          joinsArray.push(sql` `);
        }
        const table = joinMeta.table;
        const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : void 0;
        if (is(table, SQLiteTable)) {
          const tableName = table[SQLiteTable.Symbol.Name];
          const tableSchema = table[SQLiteTable.Symbol.Schema];
          const origTableName = table[SQLiteTable.Symbol.OriginalName];
          const alias = tableName === origTableName ? void 0 : joinMeta.alias;
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : void 0}${sql.identifier(
              origTableName
            )}${alias && sql` ${sql.identifier(alias)}`}${onSql}`
          );
        } else {
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`
          );
        }
        if (index2 < joins.length - 1) {
          joinsArray.push(sql` `);
        }
      }
    }
    return sql.join(joinsArray);
  }
  buildLimit(limit) {
    return typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
  }
  buildOrderBy(orderBy) {
    const orderByList = [];
    if (orderBy) {
      for (const [index2, orderByValue] of orderBy.entries()) {
        orderByList.push(orderByValue);
        if (index2 < orderBy.length - 1) {
          orderByList.push(sql`, `);
        }
      }
    }
    return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : void 0;
  }
  buildFromTable(table) {
    if (is(table, Table) && table[Table.Symbol.IsAlias]) {
      return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? "")}.`.if(table[Table.Symbol.Schema])}${sql.identifier(
        table[Table.Symbol.OriginalName]
      )} ${sql.identifier(table[Table.Symbol.Name])}`;
    }
    return table;
  }
  buildSelectQuery({
    withList,
    fields,
    fieldsFlat,
    where,
    having,
    table,
    joins,
    orderBy,
    groupBy,
    limit,
    offset,
    distinct,
    setOperators
  }) {
    const fieldsList = fieldsFlat ?? orderSelectedFields(fields);
    for (const f of fieldsList) {
      if (is(f.field, Column) && getTableName(f.field.table) !== (is(table, Subquery) ? table._.alias : is(table, SQLiteViewBase) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : getTableName(table)) && !((table2) => joins?.some(
        ({ alias }) => alias === (table2[Table.Symbol.IsAlias] ? getTableName(table2) : table2[Table.Symbol.BaseName])
      ))(f.field.table)) {
        const tableName = getTableName(f.field.table);
        throw new Error(
          `Your "${f.path.join(
            "->"
          )}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`
        );
      }
    }
    const isSingleTable = !joins || joins.length === 0;
    const withSql = this.buildWithCTE(withList);
    const distinctSql = distinct ? sql` distinct` : void 0;
    const selection = this.buildSelection(fieldsList, { isSingleTable });
    const tableSql = this.buildFromTable(table);
    const joinsSql = this.buildJoins(joins);
    const whereSql = where ? sql` where ${where}` : void 0;
    const havingSql = having ? sql` having ${having}` : void 0;
    const groupByList = [];
    if (groupBy) {
      for (const [index2, groupByValue] of groupBy.entries()) {
        groupByList.push(groupByValue);
        if (index2 < groupBy.length - 1) {
          groupByList.push(sql`, `);
        }
      }
    }
    const groupBySql = groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    const finalQuery = sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
    if (setOperators.length > 0) {
      return this.buildSetOperations(finalQuery, setOperators);
    }
    return finalQuery;
  }
  buildSetOperations(leftSelect, setOperators) {
    const [setOperator, ...rest] = setOperators;
    if (!setOperator) {
      throw new Error("Cannot pass undefined values to any set operator");
    }
    if (rest.length === 0) {
      return this.buildSetOperationQuery({ leftSelect, setOperator });
    }
    return this.buildSetOperations(
      this.buildSetOperationQuery({ leftSelect, setOperator }),
      rest
    );
  }
  buildSetOperationQuery({
    leftSelect,
    setOperator: { type, isAll, rightSelect, limit, orderBy, offset }
  }) {
    const leftChunk = sql`${leftSelect.getSQL()} `;
    const rightChunk = sql`${rightSelect.getSQL()}`;
    let orderBySql;
    if (orderBy && orderBy.length > 0) {
      const orderByValues = [];
      for (const singleOrderBy of orderBy) {
        if (is(singleOrderBy, SQLiteColumn)) {
          orderByValues.push(sql.identifier(singleOrderBy.name));
        } else if (is(singleOrderBy, SQL)) {
          for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
            const chunk = singleOrderBy.queryChunks[i];
            if (is(chunk, SQLiteColumn)) {
              singleOrderBy.queryChunks[i] = sql.identifier(
                this.casing.getColumnCasing(chunk)
              );
            }
          }
          orderByValues.push(sql`${singleOrderBy}`);
        } else {
          orderByValues.push(sql`${singleOrderBy}`);
        }
      }
      orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
    }
    const limitSql = typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
    const operatorChunk = sql.raw(`${type} ${isAll ? "all " : ""}`);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
  }
  buildInsertQuery({
    table,
    values: valuesOrSelect,
    onConflict,
    returning,
    withList,
    select
  }) {
    const valuesSqlList = [];
    const columns = table[Table.Symbol.Columns];
    const colEntries = Object.entries(columns).filter(
      ([_, col]) => !col.shouldDisableInsert()
    );
    const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
    if (select) {
      const select2 = valuesOrSelect;
      if (is(select2, SQL)) {
        valuesSqlList.push(select2);
      } else {
        valuesSqlList.push(select2.getSQL());
      }
    } else {
      const values = valuesOrSelect;
      valuesSqlList.push(sql.raw("values "));
      for (const [valueIndex, value] of values.entries()) {
        const valueList = [];
        for (const [fieldName, col] of colEntries) {
          const colValue = value[fieldName];
          if (colValue === void 0 || is(colValue, Param) && colValue.value === void 0) {
            let defaultValue;
            if (col.default !== null && col.default !== void 0) {
              defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
            } else if (col.defaultFn !== void 0) {
              const defaultFnResult = col.defaultFn();
              defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
            } else if (!col.default && col.onUpdateFn !== void 0) {
              const onUpdateFnResult = col.onUpdateFn();
              defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
            } else {
              defaultValue = sql`null`;
            }
            valueList.push(defaultValue);
          } else {
            valueList.push(colValue);
          }
        }
        valuesSqlList.push(valueList);
        if (valueIndex < values.length - 1) {
          valuesSqlList.push(sql`, `);
        }
      }
    }
    const withSql = this.buildWithCTE(withList);
    const valuesSql = sql.join(valuesSqlList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const onConflictSql = onConflict?.length ? sql.join(onConflict) : void 0;
    return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
  }
  sqlToQuery(sql2, invokeSource) {
    return sql2.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      invokeSource
    });
  }
  buildRelationalQuery({
    fullSchema,
    schema,
    tableNamesMap,
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    nestedQueryRelation,
    joinOn
  }) {
    let selection = [];
    let limit, offset, orderBy = [], where;
    const joins = [];
    if (config === true) {
      const selectionEntries = Object.entries(tableConfig.columns);
      selection = selectionEntries.map(([key, value]) => ({
        dbKey: value.name,
        tsKey: key,
        field: aliasedTableColumn(value, tableAlias),
        relationTableTsKey: void 0,
        isJson: false,
        selection: []
      }));
    } else {
      const aliasedColumns = Object.fromEntries(
        Object.entries(tableConfig.columns).map(([key, value]) => [
          key,
          aliasedTableColumn(value, tableAlias)
        ])
      );
      if (config.where) {
        const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
        where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
      }
      const fieldsSelection = [];
      let selectedColumns = [];
      if (config.columns) {
        let isIncludeMode = false;
        for (const [field, value] of Object.entries(config.columns)) {
          if (value === void 0) {
            continue;
          }
          if (field in tableConfig.columns) {
            if (!isIncludeMode && value === true) {
              isIncludeMode = true;
            }
            selectedColumns.push(field);
          }
        }
        if (selectedColumns.length > 0) {
          selectedColumns = isIncludeMode ? selectedColumns.filter((c) => config.columns?.[c] === true) : Object.keys(tableConfig.columns).filter(
            (key) => !selectedColumns.includes(key)
          );
        }
      } else {
        selectedColumns = Object.keys(tableConfig.columns);
      }
      for (const field of selectedColumns) {
        const column = tableConfig.columns[field];
        fieldsSelection.push({ tsKey: field, value: column });
      }
      let selectedRelations = [];
      if (config.with) {
        selectedRelations = Object.entries(config.with).filter(
          (entry) => !!entry[1]
        ).map(([tsKey, queryConfig]) => ({
          tsKey,
          queryConfig,
          relation: tableConfig.relations[tsKey]
        }));
      }
      let extras;
      if (config.extras) {
        extras = typeof config.extras === "function" ? config.extras(aliasedColumns, { sql }) : config.extras;
        for (const [tsKey, value] of Object.entries(extras)) {
          fieldsSelection.push({
            tsKey,
            value: mapColumnsInAliasedSQLToAlias(value, tableAlias)
          });
        }
      }
      for (const { tsKey, value } of fieldsSelection) {
        selection.push({
          dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey].name,
          tsKey,
          field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
          relationTableTsKey: void 0,
          isJson: false,
          selection: []
        });
      }
      let orderByOrig = typeof config.orderBy === "function" ? config.orderBy(aliasedColumns, getOrderByOperators()) : config.orderBy ?? [];
      if (!Array.isArray(orderByOrig)) {
        orderByOrig = [orderByOrig];
      }
      orderBy = orderByOrig.map((orderByValue) => {
        if (is(orderByValue, Column)) {
          return aliasedTableColumn(orderByValue, tableAlias);
        }
        return mapColumnsInSQLToAlias(orderByValue, tableAlias);
      });
      limit = config.limit;
      offset = config.offset;
      for (const {
        tsKey: selectedRelationTsKey,
        queryConfig: selectedRelationConfigValue,
        relation
      } of selectedRelations) {
        const normalizedRelation = normalizeRelation(
          schema,
          tableNamesMap,
          relation
        );
        const relationTableName = getTableUniqueName(relation.referencedTable);
        const relationTableTsName = tableNamesMap[relationTableName];
        const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
        const joinOn2 = and(
          ...normalizedRelation.fields.map(
            (field2, i) => eq(
              aliasedTableColumn(
                normalizedRelation.references[i],
                relationTableAlias
              ),
              aliasedTableColumn(field2, tableAlias)
            )
          )
        );
        const builtRelation = this.buildRelationalQuery({
          fullSchema,
          schema,
          tableNamesMap,
          table: fullSchema[relationTableTsName],
          tableConfig: schema[relationTableTsName],
          queryConfig: is(relation, One) ? selectedRelationConfigValue === true ? { limit: 1 } : { ...selectedRelationConfigValue, limit: 1 } : selectedRelationConfigValue,
          tableAlias: relationTableAlias,
          joinOn: joinOn2,
          nestedQueryRelation: relation
        });
        const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
        selection.push({
          dbKey: selectedRelationTsKey,
          tsKey: selectedRelationTsKey,
          field,
          relationTableTsKey: relationTableTsName,
          isJson: true,
          selection: builtRelation.selection
        });
      }
    }
    if (selection.length === 0) {
      throw new DrizzleError({
        message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`
      });
    }
    let result;
    where = and(joinOn, where);
    if (nestedQueryRelation) {
      let field = sql`json_array(${sql.join(
        selection.map(
          ({ field: field2 }) => is(field2, SQLiteColumn) ? sql.identifier(this.casing.getColumnCasing(field2)) : is(field2, SQL.Aliased) ? field2.sql : field2
        ),
        sql`, `
      )})`;
      if (is(nestedQueryRelation, Many)) {
        field = sql`coalesce(json_group_array(${field}), json_array())`;
      }
      const nestedSelection = [
        {
          dbKey: "data",
          tsKey: "data",
          field: field.as("data"),
          isJson: true,
          relationTableTsKey: tableConfig.tsName,
          selection
        }
      ];
      const needsSubquery = limit !== void 0 || offset !== void 0 || orderBy.length > 0;
      if (needsSubquery) {
        result = this.buildSelectQuery({
          table: aliasedTable(table, tableAlias),
          fields: {},
          fieldsFlat: [
            {
              path: [],
              field: sql.raw("*")
            }
          ],
          where,
          limit,
          offset,
          orderBy,
          setOperators: []
        });
        where = void 0;
        limit = void 0;
        offset = void 0;
        orderBy = void 0;
      } else {
        result = aliasedTable(table, tableAlias);
      }
      result = this.buildSelectQuery({
        table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
        fields: {},
        fieldsFlat: nestedSelection.map(({ field: field2 }) => ({
          path: [],
          field: is(field2, Column) ? aliasedTableColumn(field2, tableAlias) : field2
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    } else {
      result = this.buildSelectQuery({
        table: aliasedTable(table, tableAlias),
        fields: {},
        fieldsFlat: selection.map(({ field }) => ({
          path: [],
          field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    }
    return {
      tableTsKey: tableConfig.tsName,
      sql: result,
      selection
    };
  }
};
var SQLiteSyncDialect = class extends SQLiteDialect {
  static [entityKind] = "SQLiteSyncDialect";
  migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    session.run(migrationTableCreate);
    const dbMigrations = session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    session.run(sql`BEGIN`);
    try {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            session.run(sql.raw(stmt));
          }
          session.run(
            sql`INSERT INTO ${sql.identifier(
              migrationsTable
            )} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
      session.run(sql`COMMIT`);
    } catch (e) {
      session.run(sql`ROLLBACK`);
      throw e;
    }
  }
};
var SQLiteAsyncDialect = class extends SQLiteDialect {
  static [entityKind] = "SQLiteAsyncDialect";
  async migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    await session.run(migrationTableCreate);
    const dbMigrations = await session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    await session.transaction(async (tx) => {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            await tx.run(sql.raw(stmt));
          }
          await tx.run(
            sql`INSERT INTO ${sql.identifier(
              migrationsTable
            )} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
    });
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/query-builders/query-builder.js
var TypedQueryBuilder = class {
  static [entityKind] = "TypedQueryBuilder";
  /** @internal */
  getSelectedFields() {
    return this._.selectedFields;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/select.js
var SQLiteSelectBuilder = class {
  static [entityKind] = "SQLiteSelectBuilder";
  fields;
  session;
  dialect;
  withList;
  distinct;
  constructor(config) {
    this.fields = config.fields;
    this.session = config.session;
    this.dialect = config.dialect;
    this.withList = config.withList;
    this.distinct = config.distinct;
  }
  from(source) {
    const isPartialSelect = !!this.fields;
    let fields;
    if (this.fields) {
      fields = this.fields;
    } else if (is(source, Subquery)) {
      fields = Object.fromEntries(
        Object.keys(source._.selectedFields).map((key) => [key, source[key]])
      );
    } else if (is(source, SQLiteViewBase)) {
      fields = source[ViewBaseConfig].selectedFields;
    } else if (is(source, SQL)) {
      fields = {};
    } else {
      fields = getTableColumns(source);
    }
    return new SQLiteSelectBase({
      table: source,
      fields,
      isPartialSelect,
      session: this.session,
      dialect: this.dialect,
      withList: this.withList,
      distinct: this.distinct
    });
  }
};
var SQLiteSelectQueryBuilderBase = class extends TypedQueryBuilder {
  static [entityKind] = "SQLiteSelectQueryBuilder";
  _;
  /** @internal */
  config;
  joinsNotNullableMap;
  tableName;
  isPartialSelect;
  session;
  dialect;
  cacheConfig = void 0;
  usedTables = /* @__PURE__ */ new Set();
  constructor({ table, fields, isPartialSelect, session, dialect, withList, distinct }) {
    super();
    this.config = {
      withList,
      table,
      fields: { ...fields },
      distinct,
      setOperators: []
    };
    this.isPartialSelect = isPartialSelect;
    this.session = session;
    this.dialect = dialect;
    this._ = {
      selectedFields: fields,
      config: this.config
    };
    this.tableName = getTableLikeName(table);
    this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
    for (const item of extractUsedTable(table)) this.usedTables.add(item);
  }
  /** @internal */
  getUsedTables() {
    return [...this.usedTables];
  }
  createJoin(joinType) {
    return (table, on) => {
      const baseTableName = this.tableName;
      const tableName = getTableLikeName(table);
      for (const item of extractUsedTable(table)) this.usedTables.add(item);
      if (typeof tableName === "string" && this.config.joins?.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (!this.isPartialSelect) {
        if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") {
          this.config.fields = {
            [baseTableName]: this.config.fields
          };
        }
        if (typeof tableName === "string" && !is(table, SQL)) {
          const selection = is(table, Subquery) ? table._.selectedFields : is(table, View) ? table[ViewBaseConfig].selectedFields : table[Table.Symbol.Columns];
          this.config.fields[tableName] = selection;
        }
      }
      if (typeof on === "function") {
        on = on(
          new Proxy(
            this.config.fields,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      if (!this.config.joins) {
        this.config.joins = [];
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      if (typeof tableName === "string") {
        switch (joinType) {
          case "left": {
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
          case "right": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "cross":
          case "inner": {
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "full": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
        }
      }
      return this;
    };
  }
  /**
   * Executes a `left join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  leftJoin = this.createJoin("left");
  /**
   * Executes a `right join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  rightJoin = this.createJoin("right");
  /**
   * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
   *
   * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  innerJoin = this.createJoin("inner");
  /**
   * Executes a `full join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  fullJoin = this.createJoin("full");
  /**
   * Executes a `cross join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
   *
   * @param table the table to join.
   *
   * @example
   *
   * ```ts
   * // Select all users, each user with every pet
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .crossJoin(pets)
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .crossJoin(pets)
   * ```
   */
  crossJoin = this.createJoin("cross");
  createSetOperator(type, isAll) {
    return (rightSelection) => {
      const rightSelect = typeof rightSelection === "function" ? rightSelection(getSQLiteSetOperators()) : rightSelection;
      if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
      this.config.setOperators.push({ type, isAll, rightSelect });
      return this;
    };
  }
  /**
   * Adds `union` set operator to the query.
   *
   * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
   *
   * @example
   *
   * ```ts
   * // Select all unique names from customers and users tables
   * await db.select({ name: users.name })
   *   .from(users)
   *   .union(
   *     db.select({ name: customers.name }).from(customers)
   *   );
   * // or
   * import { union } from 'drizzle-orm/sqlite-core'
   *
   * await union(
   *   db.select({ name: users.name }).from(users),
   *   db.select({ name: customers.name }).from(customers)
   * );
   * ```
   */
  union = this.createSetOperator("union", false);
  /**
   * Adds `union all` set operator to the query.
   *
   * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
   *
   * @example
   *
   * ```ts
   * // Select all transaction ids from both online and in-store sales
   * await db.select({ transaction: onlineSales.transactionId })
   *   .from(onlineSales)
   *   .unionAll(
   *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   *   );
   * // or
   * import { unionAll } from 'drizzle-orm/sqlite-core'
   *
   * await unionAll(
   *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
   *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   * );
   * ```
   */
  unionAll = this.createSetOperator("union", true);
  /**
   * Adds `intersect` set operator to the query.
   *
   * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
   *
   * @example
   *
   * ```ts
   * // Select course names that are offered in both departments A and B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .intersect(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { intersect } from 'drizzle-orm/sqlite-core'
   *
   * await intersect(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  intersect = this.createSetOperator("intersect", false);
  /**
   * Adds `except` set operator to the query.
   *
   * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
   *
   * @example
   *
   * ```ts
   * // Select all courses offered in department A but not in department B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .except(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { except } from 'drizzle-orm/sqlite-core'
   *
   * await except(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  except = this.createSetOperator("except", false);
  /** @internal */
  addSetOperators(setOperators) {
    this.config.setOperators.push(...setOperators);
    return this;
  }
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#filtering}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be selected.
   *
   * ```ts
   * // Select all cars with green color
   * await db.select().from(cars).where(eq(cars.color, 'green'));
   * // or
   * await db.select().from(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Select all BMW cars with a green color
   * await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Select all cars with the green or blue color
   * await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    if (typeof where === "function") {
      where = where(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.where = where;
    return this;
  }
  /**
   * Adds a `having` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
   *
   * @param having the `having` clause.
   *
   * @example
   *
   * ```ts
   * // Select all brands with more than one car
   * await db.select({
   * 	brand: cars.brand,
   * 	count: sql<number>`cast(count(${cars.id}) as int)`,
   * })
   *   .from(cars)
   *   .groupBy(cars.brand)
   *   .having(({ count }) => gt(count, 1));
   * ```
   */
  having(having) {
    if (typeof having === "function") {
      having = having(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.having = having;
    return this;
  }
  groupBy(...columns) {
    if (typeof columns[0] === "function") {
      const groupBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
    } else {
      this.config.groupBy = columns;
    }
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    } else {
      const orderByArray = columns;
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    }
    return this;
  }
  /**
   * Adds a `limit` clause to the query.
   *
   * Calling this method will set the maximum number of rows that will be returned by this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param limit the `limit` clause.
   *
   * @example
   *
   * ```ts
   * // Get the first 10 people from this query.
   * await db.select().from(people).limit(10);
   * ```
   */
  limit(limit) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).limit = limit;
    } else {
      this.config.limit = limit;
    }
    return this;
  }
  /**
   * Adds an `offset` clause to the query.
   *
   * Calling this method will skip a number of rows when returning results from this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param offset the `offset` clause.
   *
   * @example
   *
   * ```ts
   * // Get the 10th-20th people from this query.
   * await db.select().from(people).offset(10).limit(10);
   * ```
   */
  offset(offset) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).offset = offset;
    } else {
      this.config.offset = offset;
    }
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildSelectQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  as(alias) {
    const usedTables = [];
    usedTables.push(...extractUsedTable(this.config.table));
    if (this.config.joins) {
      for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table));
    }
    return new Proxy(
      new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]),
      new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  /** @internal */
  getSelectedFields() {
    return new Proxy(
      this.config.fields,
      new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  $dynamic() {
    return this;
  }
};
var SQLiteSelectBase = class extends SQLiteSelectQueryBuilderBase {
  static [entityKind] = "SQLiteSelect";
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    if (!this.session) {
      throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
    }
    const fieldsList = orderSelectedFields(this.config.fields);
    const query = this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      fieldsList,
      "all",
      true,
      void 0,
      {
        type: "select",
        tables: [...this.usedTables]
      },
      this.cacheConfig
    );
    query.joinsNotNullableMap = this.joinsNotNullableMap;
    return query;
  }
  $withCache(config) {
    this.cacheConfig = config === void 0 ? { config: {}, enable: true, autoInvalidate: true } : config === false ? { enable: false } : { enable: true, autoInvalidate: true, ...config };
    return this;
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.all();
  }
};
applyMixins(SQLiteSelectBase, [QueryPromise]);
function createSetOperator(type, isAll) {
  return (leftSelect, rightSelect, ...restSelects) => {
    const setOperators = [rightSelect, ...restSelects].map((select) => ({
      type,
      isAll,
      rightSelect: select
    }));
    for (const setOperator of setOperators) {
      if (!haveSameKeys(leftSelect.getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
    }
    return leftSelect.addSetOperators(setOperators);
  };
}
var getSQLiteSetOperators = () => ({
  union,
  unionAll,
  intersect,
  except
});
var union = createSetOperator("union", false);
var unionAll = createSetOperator("union", true);
var intersect = createSetOperator("intersect", false);
var except = createSetOperator("except", false);

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/query-builder.js
var QueryBuilder = class {
  static [entityKind] = "SQLiteQueryBuilder";
  dialect;
  dialectConfig;
  constructor(dialect) {
    this.dialect = is(dialect, SQLiteDialect) ? dialect : void 0;
    this.dialectConfig = is(dialect, SQLiteDialect) ? void 0 : dialect;
  }
  $with = (alias, selection) => {
    const queryBuilder = this;
    const as = (qb) => {
      if (typeof qb === "function") {
        qb = qb(queryBuilder);
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    };
    return { as };
  };
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries,
        distinct: true
      });
    }
    return { select, selectDistinct };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: void 0, dialect: this.getDialect() });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: void 0,
      dialect: this.getDialect(),
      distinct: true
    });
  }
  // Lazy load dialect to avoid circular dependency
  getDialect() {
    if (!this.dialect) {
      this.dialect = new SQLiteSyncDialect(this.dialectConfig);
    }
    return this.dialect;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/insert.js
var SQLiteInsertBuilder = class {
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteInsertBuilder";
  values(values) {
    values = Array.isArray(values) ? values : [values];
    if (values.length === 0) {
      throw new Error("values() must be called with at least one value");
    }
    const mappedValues = values.map((entry) => {
      const result = {};
      const cols = this.table[Table.Symbol.Columns];
      for (const colKey of Object.keys(entry)) {
        const colValue = entry[colKey];
        result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
      }
      return result;
    });
    return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
  }
  select(selectQuery) {
    const select = typeof selectQuery === "function" ? selectQuery(new QueryBuilder()) : selectQuery;
    if (!is(select, SQL) && !haveSameKeys(this.table[Columns], select._.selectedFields)) {
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition"
      );
    }
    return new SQLiteInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
  }
};
var SQLiteInsertBase = class extends QueryPromise {
  constructor(table, values, session, dialect, withList, select) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { table, values, withList, select };
  }
  static [entityKind] = "SQLiteInsert";
  /** @internal */
  config;
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /**
   * Adds an `on conflict do nothing` clause to the query.
   *
   * Calling this method simply avoids inserting a row as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
   *
   * @param config The `target` and `where` clauses.
   *
   * @example
   * ```ts
   * // Insert one row and cancel the insert if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing();
   *
   * // Explicitly specify conflict target
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing({ target: cars.id });
   * ```
   */
  onConflictDoNothing(config = {}) {
    if (!this.config.onConflict) this.config.onConflict = [];
    if (config.target === void 0) {
      this.config.onConflict.push(sql` on conflict do nothing`);
    } else {
      const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
      const whereSql = config.where ? sql` where ${config.where}` : sql``;
      this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
    }
    return this;
  }
  /**
   * Adds an `on conflict do update` clause to the query.
   *
   * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts}
   *
   * @param config The `target`, `set` and `where` clauses.
   *
   * @example
   * ```ts
   * // Update the row if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'Porsche' }
   *   });
   *
   * // Upsert with 'where' clause
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'newBMW' },
   *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
   *   });
   * ```
   */
  onConflictDoUpdate(config) {
    if (config.where && (config.targetWhere || config.setWhere)) {
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    }
    if (!this.config.onConflict) this.config.onConflict = [];
    const whereSql = config.where ? sql` where ${config.where}` : void 0;
    const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : void 0;
    const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : void 0;
    const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
    const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
    this.config.onConflict.push(
      sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`
    );
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildInsertQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/update.js
var SQLiteUpdateBuilder = class {
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteUpdateBuilder";
  set(values) {
    return new SQLiteUpdateBase(
      this.table,
      mapUpdateSet(this.table, values),
      this.session,
      this.dialect,
      this.withList
    );
  }
};
var SQLiteUpdateBase = class extends QueryPromise {
  constructor(table, set, session, dialect, withList) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { set, table, withList, joins: [] };
  }
  static [entityKind] = "SQLiteUpdate";
  /** @internal */
  config;
  from(source) {
    this.config.from = source;
    return this;
  }
  createJoin(joinType) {
    return (table, on) => {
      const tableName = getTableLikeName(table);
      if (typeof tableName === "string" && this.config.joins.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (typeof on === "function") {
        const from = this.config.from ? is(table, SQLiteTable) ? table[Table.Symbol.Columns] : is(table, Subquery) ? table._.selectedFields : is(table, SQLiteViewBase) ? table[ViewBaseConfig].selectedFields : void 0 : void 0;
        on = on(
          new Proxy(
            this.config.table[Table.Symbol.Columns],
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          ),
          from && new Proxy(
            from,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      return this;
    };
  }
  leftJoin = this.createJoin("left");
  rightJoin = this.createJoin("right");
  innerJoin = this.createJoin("inner");
  fullJoin = this.createJoin("full");
  /**
   * Adds a 'where' clause to the query.
   *
   * Calling this method will update only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param where the 'where' clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be updated.
   *
   * ```ts
   * // Update all cars with green color
   * db.update(cars).set({ color: 'red' })
   *   .where(eq(cars.color, 'green'));
   * // or
   * db.update(cars).set({ color: 'red' })
   *   .where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Update all BMW cars with a green color
   * db.update(cars).set({ color: 'red' })
   *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Update all cars with the green or blue color
   * db.update(cars).set({ color: 'red' })
   *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildUpdateQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/count.js
var SQLiteCountBuilder = class _SQLiteCountBuilder extends SQL {
  constructor(params) {
    super(_SQLiteCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);
    this.params = params;
    this.session = params.session;
    this.sql = _SQLiteCountBuilder.buildCount(
      params.source,
      params.filters
    );
  }
  sql;
  static [entityKind] = "SQLiteCountBuilderAsync";
  [Symbol.toStringTag] = "SQLiteCountBuilderAsync";
  session;
  static buildEmbeddedCount(source, filters) {
    return sql`(select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters})`;
  }
  static buildCount(source, filters) {
    return sql`select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters}`;
  }
  then(onfulfilled, onrejected) {
    return Promise.resolve(this.session.count(this.sql)).then(
      onfulfilled,
      onrejected
    );
  }
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/query.js
var RelationalQueryBuilder = class {
  constructor(mode, fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session) {
    this.mode = mode;
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
  }
  static [entityKind] = "SQLiteAsyncRelationalQueryBuilder";
  findMany(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    );
  }
  findFirst(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    );
  }
};
var SQLiteRelationalQuery = class extends QueryPromise {
  constructor(fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session, config, mode) {
    super();
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
    this.config = config;
    this.mode = mode;
  }
  static [entityKind] = "SQLiteAsyncRelationalQuery";
  /** @internal */
  mode;
  /** @internal */
  getSQL() {
    return this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    }).sql;
  }
  /** @internal */
  _prepare(isOneTimeQuery = false) {
    const { query, builtQuery } = this._toSQL();
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      builtQuery,
      void 0,
      this.mode === "first" ? "get" : "all",
      true,
      (rawRows, mapColumnValue) => {
        const rows = rawRows.map(
          (row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
        );
        if (this.mode === "first") {
          return rows[0];
        }
        return rows;
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  _toSQL() {
    const query = this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    });
    const builtQuery = this.dialect.sqlToQuery(query.sql);
    return { query, builtQuery };
  }
  toSQL() {
    return this._toSQL().builtQuery;
  }
  /** @internal */
  executeRaw() {
    if (this.mode === "first") {
      return this._prepare(false).get();
    }
    return this._prepare(false).all();
  }
  async execute() {
    return this.executeRaw();
  }
};
var SQLiteSyncRelationalQuery = class extends SQLiteRelationalQuery {
  static [entityKind] = "SQLiteSyncRelationalQuery";
  sync() {
    return this.executeRaw();
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/query-builders/raw.js
var SQLiteRaw = class extends QueryPromise {
  constructor(execute, getSQL, action, dialect, mapBatchResult) {
    super();
    this.execute = execute;
    this.getSQL = getSQL;
    this.dialect = dialect;
    this.mapBatchResult = mapBatchResult;
    this.config = { action };
  }
  static [entityKind] = "SQLiteRaw";
  /** @internal */
  config;
  getQuery() {
    return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
  }
  mapResult(result, isFromBatch) {
    return isFromBatch ? this.mapBatchResult(result) : result;
  }
  _prepare() {
    return this;
  }
  /** @internal */
  isResponseInArrayMode() {
    return false;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/db.js
var BaseSQLiteDatabase = class {
  constructor(resultKind, dialect, session, schema) {
    this.resultKind = resultKind;
    this.dialect = dialect;
    this.session = session;
    this._ = schema ? {
      schema: schema.schema,
      fullSchema: schema.fullSchema,
      tableNamesMap: schema.tableNamesMap
    } : {
      schema: void 0,
      fullSchema: {},
      tableNamesMap: {}
    };
    this.query = {};
    const query = this.query;
    if (this._.schema) {
      for (const [tableName, columns] of Object.entries(this._.schema)) {
        query[tableName] = new RelationalQueryBuilder(
          resultKind,
          schema.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          schema.fullSchema[tableName],
          columns,
          dialect,
          session
        );
      }
    }
    this.$cache = { invalidate: async (_params) => {
    } };
  }
  static [entityKind] = "BaseSQLiteDatabase";
  query;
  /**
   * Creates a subquery that defines a temporary named result set as a CTE.
   *
   * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param alias The alias for the subquery.
   *
   * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
   *
   * @example
   *
   * ```ts
   * // Create a subquery with alias 'sq' and use it in the select query
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * const result = await db.with(sq).select().from(sq);
   * ```
   *
   * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
   *
   * ```ts
   * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
   * const sq = db.$with('sq').as(db.select({
   *   name: sql<string>`upper(${users.name})`.as('name'),
   * })
   * .from(users));
   *
   * const result = await db.with(sq).select({ name: sq.name }).from(sq);
   * ```
   */
  $with = (alias, selection) => {
    const self = this;
    const as = (qb) => {
      if (typeof qb === "function") {
        qb = qb(new QueryBuilder(self.dialect));
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    };
    return { as };
  };
  $count(source, filters) {
    return new SQLiteCountBuilder({ source, filters, session: this.session });
  }
  /**
   * Incorporates a previously defined CTE (using `$with`) into the main query.
   *
   * This method allows the main query to reference a temporary named result set.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param queries The CTEs to incorporate into the main query.
   *
   * @example
   *
   * ```ts
   * // Define a subquery 'sq' as a CTE using $with
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * // Incorporate the CTE 'sq' into the main query and select from it
   * const result = await db.with(sq).select().from(sq);
   * ```
   */
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries,
        distinct: true
      });
    }
    function update(table) {
      return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
    }
    function insert(into) {
      return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
    }
    function delete_(from) {
      return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
    }
    return { select, selectDistinct, update, insert, delete: delete_ };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: this.session, dialect: this.dialect });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: this.session,
      dialect: this.dialect,
      distinct: true
    });
  }
  /**
   * Creates an update query.
   *
   * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
   *
   * Use `.set()` method to specify which values to update.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param table The table to update.
   *
   * @example
   *
   * ```ts
   * // Update all rows in the 'cars' table
   * await db.update(cars).set({ color: 'red' });
   *
   * // Update rows with filters and conditions
   * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
   *
   * // Update with returning clause
   * const updatedCar: Car[] = await db.update(cars)
   *   .set({ color: 'red' })
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  update(table) {
    return new SQLiteUpdateBuilder(table, this.session, this.dialect);
  }
  $cache;
  /**
   * Creates an insert query.
   *
   * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert}
   *
   * @param table The table to insert into.
   *
   * @example
   *
   * ```ts
   * // Insert one row
   * await db.insert(cars).values({ brand: 'BMW' });
   *
   * // Insert multiple rows
   * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
   *
   * // Insert with returning clause
   * const insertedCar: Car[] = await db.insert(cars)
   *   .values({ brand: 'BMW' })
   *   .returning();
   * ```
   */
  insert(into) {
    return new SQLiteInsertBuilder(into, this.session, this.dialect);
  }
  /**
   * Creates a delete query.
   *
   * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param table The table to delete from.
   *
   * @example
   *
   * ```ts
   * // Delete all rows in the 'cars' table
   * await db.delete(cars);
   *
   * // Delete rows with filters and conditions
   * await db.delete(cars).where(eq(cars.color, 'green'));
   *
   * // Delete with returning clause
   * const deletedCar: Car[] = await db.delete(cars)
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  delete(from) {
    return new SQLiteDeleteBase(from, this.session, this.dialect);
  }
  run(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.run(sequel),
        () => sequel,
        "run",
        this.dialect,
        this.session.extractRawRunValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.run(sequel);
  }
  all(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.all(sequel),
        () => sequel,
        "all",
        this.dialect,
        this.session.extractRawAllValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.all(sequel);
  }
  get(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.get(sequel),
        () => sequel,
        "get",
        this.dialect,
        this.session.extractRawGetValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.get(sequel);
  }
  values(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.values(sequel),
        () => sequel,
        "values",
        this.dialect,
        this.session.extractRawValuesValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.values(sequel);
  }
  transaction(transaction, config) {
    return this.session.transaction(transaction, config);
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/cache/core/cache.js
var Cache = class {
  static [entityKind] = "Cache";
};
var NoopCache = class extends Cache {
  strategy() {
    return "all";
  }
  static [entityKind] = "NoopCache";
  async get(_key) {
    return void 0;
  }
  async put(_hashedQuery, _response, _tables, _config) {
  }
  async onMutate(_params) {
  }
};
async function hashQuery(sql2, params) {
  const dataToHash = `${sql2}-${JSON.stringify(params)}`;
  const encoder2 = new TextEncoder();
  const data = encoder2.encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// ../../../sites/gwl-central/node_modules/drizzle-orm/sqlite-core/session.js
var ExecuteResultSync = class extends QueryPromise {
  constructor(resultCb) {
    super();
    this.resultCb = resultCb;
  }
  static [entityKind] = "ExecuteResultSync";
  async execute() {
    return this.resultCb();
  }
  sync() {
    return this.resultCb();
  }
};
var SQLitePreparedQuery = class {
  constructor(mode, executeMethod, query, cache, queryMetadata, cacheConfig) {
    this.mode = mode;
    this.executeMethod = executeMethod;
    this.query = query;
    this.cache = cache;
    this.queryMetadata = queryMetadata;
    this.cacheConfig = cacheConfig;
    if (cache && cache.strategy() === "all" && cacheConfig === void 0) {
      this.cacheConfig = { enable: true, autoInvalidate: true };
    }
    if (!this.cacheConfig?.enable) {
      this.cacheConfig = void 0;
    }
  }
  static [entityKind] = "PreparedQuery";
  /** @internal */
  joinsNotNullableMap;
  /** @internal */
  async queryWithCache(queryString, params, query) {
    if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.cacheConfig && !this.cacheConfig.enable) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0) {
      try {
        const [res] = await Promise.all([
          query(),
          this.cache.onMutate({ tables: this.queryMetadata.tables })
        ]);
        return res;
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (!this.cacheConfig) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.queryMetadata.type === "select") {
      const fromCache = await this.cache.get(
        this.cacheConfig.tag ?? await hashQuery(queryString, params),
        this.queryMetadata.tables,
        this.cacheConfig.tag !== void 0,
        this.cacheConfig.autoInvalidate
      );
      if (fromCache === void 0) {
        let result;
        try {
          result = await query();
        } catch (e) {
          throw new DrizzleQueryError(queryString, params, e);
        }
        await this.cache.put(
          this.cacheConfig.tag ?? await hashQuery(queryString, params),
          result,
          // make sure we send tables that were used in a query only if user wants to invalidate it on each write
          this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
          this.cacheConfig.tag !== void 0,
          this.cacheConfig.config
        );
        return result;
      }
      return fromCache;
    }
    try {
      return await query();
    } catch (e) {
      throw new DrizzleQueryError(queryString, params, e);
    }
  }
  getQuery() {
    return this.query;
  }
  mapRunResult(result, _isFromBatch) {
    return result;
  }
  mapAllResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  mapGetResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  execute(placeholderValues) {
    if (this.mode === "async") {
      return this[this.executeMethod](placeholderValues);
    }
    return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
  }
  mapResult(response, isFromBatch) {
    switch (this.executeMethod) {
      case "run": {
        return this.mapRunResult(response, isFromBatch);
      }
      case "all": {
        return this.mapAllResult(response, isFromBatch);
      }
      case "get": {
        return this.mapGetResult(response, isFromBatch);
      }
    }
  }
};
var SQLiteSession = class {
  constructor(dialect) {
    this.dialect = dialect;
  }
  static [entityKind] = "SQLiteSession";
  prepareOneTimeQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return this.prepareQuery(
      query,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
      queryMetadata,
      cacheConfig
    );
  }
  run(query) {
    const staticQuery = this.dialect.sqlToQuery(query);
    try {
      return this.prepareOneTimeQuery(staticQuery, void 0, "run", false).run();
    } catch (err) {
      throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
    }
  }
  /** @internal */
  extractRawRunValueFromBatchResult(result) {
    return result;
  }
  all(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).all();
  }
  /** @internal */
  extractRawAllValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  get(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).get();
  }
  /** @internal */
  extractRawGetValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  values(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).values();
  }
  async count(sql2) {
    const result = await this.values(sql2);
    return result[0][0];
  }
  /** @internal */
  extractRawValuesValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
};
var SQLiteTransaction = class extends BaseSQLiteDatabase {
  constructor(resultType, dialect, session, schema, nestedIndex = 0) {
    super(resultType, dialect, session, schema);
    this.schema = schema;
    this.nestedIndex = nestedIndex;
  }
  static [entityKind] = "SQLiteTransaction";
  rollback() {
    throw new TransactionRollbackError();
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/d1/session.js
var SQLiteD1Session = class extends SQLiteSession {
  constructor(client, dialect, schema, options = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.options = options;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  static [entityKind] = "SQLiteD1Session";
  logger;
  cache;
  prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    const stmt = this.client.prepare(query.sql);
    return new D1PreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  async batch(queries) {
    const preparedQueries = [];
    const builtQueries = [];
    for (const query of queries) {
      const preparedQuery = query._prepare();
      const builtQuery = preparedQuery.getQuery();
      preparedQueries.push(preparedQuery);
      if (builtQuery.params.length > 0) {
        builtQueries.push(preparedQuery.stmt.bind(...builtQuery.params));
      } else {
        const builtQuery2 = preparedQuery.getQuery();
        builtQueries.push(
          this.client.prepare(builtQuery2.sql).bind(...builtQuery2.params)
        );
      }
    }
    const batchResults = await this.client.batch(builtQueries);
    return batchResults.map((result, i) => preparedQueries[i].mapResult(result, true));
  }
  extractRawAllValueFromBatchResult(result) {
    return result.results;
  }
  extractRawGetValueFromBatchResult(result) {
    return result.results[0];
  }
  extractRawValuesValueFromBatchResult(result) {
    return d1ToRawMapping(result.results);
  }
  async transaction(transaction, config) {
    const tx = new D1Transaction("async", this.dialect, this, this.schema);
    await this.run(sql.raw(`begin${config?.behavior ? " " + config.behavior : ""}`));
    try {
      const result = await transaction(tx);
      await this.run(sql`commit`);
      return result;
    } catch (err) {
      await this.run(sql`rollback`);
      throw err;
    }
  }
};
var D1Transaction = class _D1Transaction extends SQLiteTransaction {
  static [entityKind] = "D1Transaction";
  async transaction(transaction) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new _D1Transaction("async", this.dialect, this.session, this.schema, this.nestedIndex + 1);
    await this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await transaction(tx);
      await this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
};
function d1ToRawMapping(results) {
  const rows = [];
  for (const row of results) {
    const entry = Object.keys(row).map((k) => row[k]);
    rows.push(entry);
  }
  return rows;
}
var D1PreparedQuery = class extends SQLitePreparedQuery {
  constructor(stmt, query, logger, cache, queryMetadata, cacheConfig, fields, executeMethod, _isResponseInArrayMode, customResultMapper) {
    super("async", executeMethod, query, cache, queryMetadata, cacheConfig);
    this.logger = logger;
    this._isResponseInArrayMode = _isResponseInArrayMode;
    this.customResultMapper = customResultMapper;
    this.fields = fields;
    this.stmt = stmt;
  }
  static [entityKind] = "D1PreparedQuery";
  /** @internal */
  customResultMapper;
  /** @internal */
  fields;
  /** @internal */
  stmt;
  async run(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return await this.queryWithCache(this.query.sql, params, async () => {
      return this.stmt.bind(...params).run();
    });
  }
  async all(placeholderValues) {
    const { fields, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return await this.queryWithCache(query.sql, params, async () => {
        return stmt.bind(...params).all().then(({ results }) => this.mapAllResult(results));
      });
    }
    const rows = await this.values(placeholderValues);
    return this.mapAllResult(rows);
  }
  mapAllResult(rows, isFromBatch) {
    if (isFromBatch) {
      rows = d1ToRawMapping(rows.results);
    }
    if (!this.fields && !this.customResultMapper) {
      return rows;
    }
    if (this.customResultMapper) {
      return this.customResultMapper(rows);
    }
    return rows.map((row) => mapResultRow(this.fields, row, this.joinsNotNullableMap));
  }
  async get(placeholderValues) {
    const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return await this.queryWithCache(query.sql, params, async () => {
        return stmt.bind(...params).all().then(({ results }) => results[0]);
      });
    }
    const rows = await this.values(placeholderValues);
    if (!rows[0]) {
      return void 0;
    }
    if (customResultMapper) {
      return customResultMapper(rows);
    }
    return mapResultRow(fields, rows[0], joinsNotNullableMap);
  }
  mapGetResult(result, isFromBatch) {
    if (isFromBatch) {
      result = d1ToRawMapping(result.results)[0];
    }
    if (!this.fields && !this.customResultMapper) {
      return result;
    }
    if (this.customResultMapper) {
      return this.customResultMapper([result]);
    }
    return mapResultRow(this.fields, result, this.joinsNotNullableMap);
  }
  async values(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return await this.queryWithCache(this.query.sql, params, async () => {
      return this.stmt.bind(...params).raw();
    });
  }
  /** @internal */
  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
};

// ../../../sites/gwl-central/node_modules/drizzle-orm/d1/driver.js
var DrizzleD1Database = class extends BaseSQLiteDatabase {
  static [entityKind] = "D1Database";
  async batch(batch) {
    return this.session.batch(batch);
  }
};
function drizzle(client, config = {}) {
  const dialect = new SQLiteAsyncDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }
  let schema;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap
    };
  }
  const session = new SQLiteD1Session(client, dialect, schema, { logger, cache: config.cache });
  const db = new DrizzleD1Database("async", dialect, session, schema);
  db.$client = client;
  db.$cache = config.cache;
  if (db.$cache) {
    db.$cache["invalidate"] = config.cache?.onMutate;
  }
  return db;
}

// source/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  contractActivity: () => contractActivity,
  contractCatalog: () => contractCatalog,
  contractCompetencies: () => contractCompetencies,
  contractEvents: () => contractEvents,
  contracts: () => contracts,
  plannerBoards: () => plannerBoards,
  plannerCaptchaChallenges: () => plannerCaptchaChallenges,
  plannerDocuments: () => plannerDocuments,
  plannerEvents: () => plannerEvents,
  plannerLinks: () => plannerLinks,
  plannerMessageAttachments: () => plannerMessageAttachments,
  plannerMessages: () => plannerMessages,
  plannerTasks: () => plannerTasks,
  plannerThreadMembers: () => plannerThreadMembers,
  plannerThreadReads: () => plannerThreadReads,
  plannerThreads: () => plannerThreads,
  pontoAccessProfiles: () => pontoAccessProfiles,
  pontoAssets: () => pontoAssets,
  pontoAuditEvents: () => pontoAuditEvents,
  pontoCredentials: () => pontoCredentials,
  pontoDocuments: () => pontoDocuments,
  pontoEmployees: () => pontoEmployees,
  pontoJustifications: () => pontoJustifications,
  pontoOccurrenceTypes: () => pontoOccurrenceTypes,
  pontoRecords: () => pontoRecords,
  pontoSchedules: () => pontoSchedules,
  pontoSessions: () => pontoSessions,
  pontoSites: () => pontoSites,
  pontoTimesheetSignatures: () => pontoTimesheetSignatures,
  resultArchiveContracts: () => resultArchiveContracts,
  resultArchives: () => resultArchives
});
var contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  responsible: text("responsible").notNull(),
  referenceMonth: text("reference_month").notNull(),
  ccStatus: text("cc_status").notNull().default("pending"),
  vaStatus: text("va_status").notNull().default("pending"),
  fgtsStatus: text("fgts_status").notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("contracts_name_month_unique").on(table.name, table.referenceMonth),
  index("contracts_responsible_idx").on(table.responsible),
  index("contracts_month_idx").on(table.referenceMonth)
]);
var contractEvents = sqliteTable("contract_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("events_contract_idx").on(table.contractId)]);
var contractCatalog = sqliteTable("contract_catalog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  responsible: text("responsible").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("contract_catalog_name_unique").on(table.name),
  index("contract_catalog_responsible_idx").on(table.responsible)
]);
var contractCompetencies = sqliteTable("contract_competencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" }),
  referenceMonth: text("reference_month").notNull(),
  ccStatus: text("cc_status").notNull().default("pending"),
  vaStatus: text("va_status").notNull().default("pending"),
  fgtsStatus: text("fgts_status").notNull().default("pending"),
  timesheetStatus: text("timesheet_status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("contract_competency_unique").on(table.contractId, table.referenceMonth),
  index("contract_competency_month_idx").on(table.referenceMonth)
]);
var contractActivity = sqliteTable("contract_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" }),
  referenceMonth: text("reference_month"),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("contract_activity_contract_idx").on(table.contractId)]);
var resultArchives = sqliteTable("result_archives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").references(() => contractCatalog.id, { onDelete: "set null" }),
  module: text("module").notNull(),
  referenceMonth: text("reference_month").notNull(),
  actor: text("actor").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull().default("application/zip"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("result_archives_object_key_unique").on(table.objectKey),
  index("result_archives_contract_idx").on(table.contractId),
  index("result_archives_month_idx").on(table.referenceMonth)
]);
var resultArchiveContracts = sqliteTable("result_archive_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resultId: integer("result_id").notNull().references(() => resultArchives.id, { onDelete: "cascade" }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" })
}, (table) => [
  uniqueIndex("result_archive_contract_unique").on(table.resultId, table.contractId),
  index("result_archive_contract_result_idx").on(table.resultId)
]);
var pontoEmployees = sqliteTable("ponto_employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  registration: text("registration").notNull(),
  cpf: text("cpf").notNull().default(""),
  jobTitle: text("job_title").notNull().default("Vigilante"),
  siteId: integer("site_id"),
  schedule: text("schedule").notNull().default("12x36"),
  admissionDate: text("admission_date").notNull().default(""),
  journeyStartDate: text("journey_start_date").notNull().default(""),
  ctpsNumber: text("ctps_number").notNull().default(""),
  ctpsSeries: text("ctps_series").notNull().default(""),
  pisPasep: text("pis_pasep").notNull().default(""),
  expectedStart: text("expected_start").notNull().default("06:00"),
  expectedBreakStart: text("expected_break_start").notNull().default("12:00"),
  expectedBreakEnd: text("expected_break_end").notNull().default("13:00"),
  expectedEnd: text("expected_end").notNull().default("18:00"),
  registersPoint: integer("registers_point", { mode: "boolean" }).notNull().default(true),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  status: text("status").notNull().default("active"),
  requirePhoto: integer("require_photo", { mode: "boolean" }).notNull().default(true),
  requireGeo: integer("require_geo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_employee_source_unique").on(table.sourceSystem, table.sourceId),
  index("ponto_employee_registration_idx").on(table.registration),
  index("ponto_employee_site_idx").on(table.siteId),
  index("ponto_employee_status_idx").on(table.status)
]);
var pontoSites = sqliteTable("ponto_sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  contract: text("contract").notNull().default(""),
  city: text("city").notNull().default(""),
  responsible: text("responsible").notNull().default(""),
  company: text("company").notNull().default("Dimivig Seguran\xE7a"),
  cnpj: text("cnpj").notNull().default(""),
  siteType: text("site_type").notNull().default("Armado"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  addressNumber: text("address_number").notNull().default(""),
  zipCode: text("zip_code").notNull().default(""),
  rotating: integer("rotating", { mode: "boolean" }).notNull().default(false),
  requirePhoto: integer("require_photo", { mode: "boolean" }).notNull().default(true),
  requireGeo: integer("require_geo", { mode: "boolean" }).notNull().default(true),
  notes: text("notes").notNull().default(""),
  latitude: text("latitude").notNull().default(""),
  longitude: text("longitude").notNull().default(""),
  radiusMeters: integer("radius_meters").notNull().default(300),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_sites_source_unique").on(table.sourceSystem, table.sourceId),
  index("ponto_sites_status_idx").on(table.status)
]);
var pontoRecords = sqliteTable("ponto_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  recordedAt: text("recorded_at").notNull(),
  latitude: text("latitude").notNull().default(""),
  longitude: text("longitude").notNull().default(""),
  accuracy: integer("accuracy").notNull().default(0),
  photoKey: text("photo_key"),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("valid"),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("ponto_records_employee_idx").on(table.employeeId),
  index("ponto_records_date_idx").on(table.recordedAt)
]);
var pontoSchedules = sqliteTable("ponto_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  workDate: text("work_date").notNull(),
  shift: text("shift").notNull().default("12x36"),
  expectedStart: text("expected_start").notNull().default("07:00"),
  expectedBreakStart: text("expected_break_start").notNull().default("12:00"),
  expectedBreakEnd: text("expected_break_end").notNull().default("13:00"),
  expectedEnd: text("expected_end").notNull().default("19:00"),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_schedule_employee_date_unique").on(table.employeeId, table.workDate),
  index("ponto_schedule_date_idx").on(table.workDate)
]);
var pontoJustifications = sqliteTable("ponto_justifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  occurrenceDate: text("occurrence_date").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  endDate: text("end_date").notNull().default(""),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  relatedEmployeeId: integer("related_employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  relatedDate: text("related_date").notNull().default(""),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name").notNull().default(""),
  attachmentContentType: text("attachment_content_type").notNull().default(""),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("ponto_justification_employee_idx").on(table.employeeId),
  index("ponto_justification_status_idx").on(table.status)
]);
var pontoTimesheetSignatures = sqliteTable("ponto_timesheet_signatures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  signatureKey: text("signature_key").notNull(),
  signedName: text("signed_name").notNull(),
  signedBy: text("signed_by").notNull(),
  signedAt: text("signed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  status: text("status").notNull().default("signed")
}, (table) => [
  uniqueIndex("ponto_signature_employee_period_unique").on(table.employeeId, table.startDate, table.endDate),
  index("ponto_signature_period_idx").on(table.startDate, table.endDate)
]);
var pontoOccurrenceTypes = sqliteTable("ponto_occurrence_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Outros"),
  effect: text("effect").notNull().default("informativo"),
  requiresRelatedEmployee: integer("requires_related_employee", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_occurrence_types_code_unique").on(table.code),
  uniqueIndex("ponto_occurrence_types_name_unique").on(table.name),
  index("ponto_occurrence_types_status_idx").on(table.status)
]);
var pontoAuditEvents = sqliteTable("ponto_audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json").notNull().default(""),
  afterJson: text("after_json").notNull().default(""),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("ponto_audit_entity_idx").on(table.entity, table.entityId),
  index("ponto_audit_created_idx").on(table.createdAt)
]);
var pontoDocuments = sqliteTable("ponto_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  size: integer("size").notNull().default(0),
  signed: integer("signed", { mode: "boolean" }).notNull().default(false),
  signedBy: text("signed_by").notNull().default(""),
  competence: text("competence").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_documents_object_key_unique").on(table.objectKey),
  index("ponto_documents_employee_idx").on(table.employeeId),
  index("ponto_documents_competence_idx").on(table.competence)
]);
var pontoAccessProfiles = sqliteTable("ponto_access_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default("Colaborador"),
  plannerRole: text("planner_role").notNull().default(""),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [uniqueIndex("ponto_access_profiles_email_unique").on(table.email)]);
var plannerCaptchaChallenges = sqliteTable("planner_captcha_challenges", {
  id: text("id").primaryKey(),
  answerHash: text("answer_hash").notNull(),
  requesterHash: text("requester_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("planner_captcha_expiry_idx").on(table.expiresAt),
  index("planner_captcha_requester_idx").on(table.requesterHash)
]);
var pontoCredentials = sqliteTable("ponto_credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => pontoAccessProfiles.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull().default(21e4),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_credentials_profile_unique").on(table.profileId),
  uniqueIndex("ponto_credentials_email_unique").on(table.email)
]);
var pontoSessions = sqliteTable("ponto_sessions", {
  id: text("id").primaryKey(),
  credentialId: integer("credential_id").notNull().references(() => pontoCredentials.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_sessions_token_unique").on(table.tokenHash),
  index("ponto_sessions_credential_idx").on(table.credentialId),
  index("ponto_sessions_expiry_idx").on(table.expiresAt)
]);
var pontoAssets = sqliteTable("ponto_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Equipamento"),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("available"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("ponto_assets_code_unique").on(table.code),
  index("ponto_assets_site_idx").on(table.siteId)
]);
var plannerTasks = sqliteTable("planner_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  visibility: text("visibility").notNull().default("personal"),
  assigneeEmail: text("assignee_email").notNull().default(""),
  assigneeName: text("assignee_name").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  dueTime: text("due_time").notNull().default(""),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  claimedAt: text("claimed_at").notNull().default(""),
  notes: text("notes").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  priority: text("priority").notNull().default("media"),
  status: text("status").notNull().default("pendente"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("planner_tasks_owner_status_idx").on(table.ownerEmail, table.status),
  index("planner_tasks_visibility_assignee_idx").on(table.visibility, table.assigneeEmail),
  index("planner_tasks_due_idx").on(table.dueDate)
]);
var plannerEvents = sqliteTable("planner_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  eventTime: text("event_time").notNull().default(""),
  emoji: text("emoji").notNull().default("\u{1F4CC}"),
  color: text("color").notNull().default("#4f7cff"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("planner_events_owner_date_idx").on(table.ownerEmail, table.eventDate)]);
var plannerThreads = sqliteTable("planner_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("group"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var plannerThreadMembers = sqliteTable("planner_thread_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  memberEmail: text("member_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("planner_thread_member_unique").on(table.threadId, table.memberEmail),
  index("planner_thread_member_email_idx").on(table.memberEmail)
]);
var plannerMessages = sqliteTable("planner_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("planner_messages_thread_date_idx").on(table.threadId, table.createdAt), index("planner_messages_thread_id_idx").on(table.threadId, table.id)]);
var plannerThreadReads = sqliteTable("planner_thread_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  memberEmail: text("member_email").notNull(),
  lastReadMessageId: integer("last_read_message_id").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("planner_thread_reads_member_unique").on(table.threadId, table.memberEmail),
  index("planner_thread_reads_member_idx").on(table.memberEmail)
]);
var plannerMessageAttachments = sqliteTable("planner_message_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull().references(() => plannerMessages.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("planner_message_attachments_object_key_unique").on(table.objectKey),
  index("planner_message_attachments_message_idx").on(table.messageId)
]);
var plannerDocuments = sqliteTable("planner_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("planner_documents_object_key_unique").on(table.objectKey),
  index("planner_documents_owner_idx").on(table.ownerEmail)
]);
var plannerBoards = sqliteTable("planner_boards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerEmail: text("owner_email").notNull(),
  allowedEmails: text("allowed_emails").notNull().default("[]"),
  payload: text("payload").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("planner_boards_owner_idx").on(table.ownerEmail)]);
var plannerLinks = sqliteTable("planner_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("site"),
  color: text("color").notNull().default("#4f7cff"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("planner_links_owner_idx").on(table.ownerEmail)]);

// source/db/index.ts
async function getDb() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return drizzle(env2.DB, { schema: schema_exports });
}

// source/app/api/contracts/route.ts
var people = /* @__PURE__ */ new Set(["Gustavo"]);
var statuses = /* @__PURE__ */ new Set(["pending", "progress", "done"]);
var deliveryLabels = {
  ccStatus: "Contracheque + Comprovante",
  vaStatus: "Vale-Alimenta\xE7\xE3o",
  fgtsStatus: "FGTS",
  timesheetStatus: "Folha de Ponto"
};
var validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
var unauthorized = () => Response.json({ error: "Fa\xE7a login no GWL Flow para continuar." }, { status: 401 });
function errorResponse(error) {
  const message = error instanceof Error ? error.message : "Erro inesperado";
  const friendly = message.includes("no such table") ? "O banco de contratos ainda est\xE1 sendo preparado." : message;
  return Response.json({ error: friendly }, { status: 500 });
}
async function ensureCompetency(db, month) {
  await db.run(sql`INSERT OR IGNORE INTO contract_competencies (contract_id, reference_month)
    SELECT id, ${month} FROM contract_catalog`);
}
async function GET(request) {
  if (!await getChatGPTUser()) return unauthorized();
  try {
    const month = new URL(request.url).searchParams.get("month") || "";
    if (!validMonth(month)) return Response.json({ error: "Selecione uma compet\xEAncia v\xE1lida." }, { status: 400 });
    const db = await getDb();
    await ensureCompetency(db, month);
    const rows = await db.select({
      id: contractCatalog.id,
      name: contractCatalog.name,
      responsible: contractCatalog.responsible,
      notes: contractCatalog.notes,
      referenceMonth: contractCompetencies.referenceMonth,
      ccStatus: contractCompetencies.ccStatus,
      vaStatus: contractCompetencies.vaStatus,
      fgtsStatus: contractCompetencies.fgtsStatus,
      timesheetStatus: contractCompetencies.timesheetStatus,
      updatedAt: contractCompetencies.updatedAt
    }).from(contractCatalog).innerJoin(contractCompetencies, and(
      eq(contractCompetencies.contractId, contractCatalog.id),
      eq(contractCompetencies.referenceMonth, month)
    )).orderBy(contractCatalog.name);
    const events = await db.select({
      id: contractActivity.id,
      contractId: contractActivity.contractId,
      actor: contractActivity.actor,
      description: contractActivity.description,
      createdAt: contractActivity.createdAt,
      referenceMonth: contractActivity.referenceMonth,
      contractName: contractCatalog.name
    }).from(contractActivity).leftJoin(contractCatalog, eq(contractActivity.contractId, contractCatalog.id)).orderBy(desc(contractActivity.id)).limit(20);
    return Response.json({ contracts: rows, events });
  } catch (error) {
    return errorResponse(error);
  }
}
async function POST(request) {
  if (!await getChatGPTUser()) return unauthorized();
  try {
    const body = await request.json();
    const name = body.name?.trim() || "";
    const responsible = body.responsible || "";
    if (!name || !people.has(responsible)) return Response.json({ error: "Preencha o contrato e o respons\xE1vel." }, { status: 400 });
    const db = await getDb();
    const existing = await db.select({ id: contractCatalog.id }).from(contractCatalog).where(eq(contractCatalog.name, name)).limit(1);
    if (existing.length) return Response.json({ error: "Este contrato j\xE1 est\xE1 cadastrado e aparece automaticamente em todas as compet\xEAncias." }, { status: 409 });
    const [created] = await db.insert(contractCatalog).values({ name, responsible, notes: body.notes?.trim() || "" }).returning();
    await db.insert(contractActivity).values({ contractId: created.id, actor: people.has(body.actor || "") ? body.actor : responsible, description: `Contrato cadastrado e atribu\xEDdo a ${responsible}. Dispon\xEDvel em todas as compet\xEAncias.` });
    return Response.json({ contract: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
async function PATCH(request) {
  if (!await getChatGPTUser()) return unauthorized();
  try {
    const body = await request.json();
    if (!body.id || !people.has(body.actor || "")) return Response.json({ error: "Atualiza\xE7\xE3o inv\xE1lida." }, { status: 400 });
    if (body.field && (!Object.hasOwn(deliveryLabels, body.field) || !statuses.has(body.status || ""))) {
      return Response.json({ error: "Etapa ou situa\xE7\xE3o inv\xE1lida." }, { status: 400 });
    }
    if (body.responsible && !people.has(body.responsible)) return Response.json({ error: "Respons\xE1vel inv\xE1lido." }, { status: 400 });
    const db = await getDb();
    const current2 = await db.select().from(contractCatalog).where(eq(contractCatalog.id, body.id)).limit(1);
    if (!current2.length) return Response.json({ error: "Contrato n\xE3o encontrado." }, { status: 404 });
    let description = "Contrato atualizado.";
    if (body.field && statuses.has(body.status || "")) {
      if (!body.month || !validMonth(body.month)) return Response.json({ error: "Compet\xEAncia inv\xE1lida." }, { status: 400 });
      await ensureCompetency(db, body.month);
      const statusLabels = { pending: "Pendente", progress: "Em andamento", done: "Conclu\xEDdo" };
      await db.update(contractCompetencies).set({ [body.field]: body.status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(and(eq(contractCompetencies.contractId, body.id), eq(contractCompetencies.referenceMonth, body.month)));
      description = `${deliveryLabels[body.field]} alterado para ${statusLabels[body.status]}.`;
    }
    if (body.responsible && people.has(body.responsible)) {
      await db.update(contractCatalog).set({ responsible: body.responsible, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(contractCatalog.id, body.id));
      description = `Respons\xE1vel alterado para ${body.responsible}.`;
    }
    if (typeof body.notes === "string") {
      await db.update(contractCatalog).set({ notes: body.notes.trim(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(contractCatalog.id, body.id));
      description = "Observa\xE7\xF5es atualizadas.";
    }
    await db.insert(contractActivity).values({ contractId: body.id, referenceMonth: body.month || null, actor: body.actor, description });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
async function DELETE(request) {
  if (!await getChatGPTUser()) return unauthorized();
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Contrato inv\xE1lido." }, { status: 400 });
    const db = await getDb();
    await db.delete(contractCatalog).where(eq(contractCatalog.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// source/app/api/results/route.ts
var route_exports2 = {};
__export(route_exports2, {
  DELETE: () => DELETE2,
  GET: () => GET2,
  POST: () => POST2,
  PUT: () => PUT
});
var modules = /* @__PURE__ */ new Set(["va", "fgts", "cc"]);
var people2 = /* @__PURE__ */ new Set(["Gustavo", "Wert", "Lucas"]);
var validMonth2 = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
var moduleLabels = { va: "Vale-Alimenta\xE7\xE3o", fgts: "FGTS", cc: "Contracheque + Comprovante" };
var moduleFields = { va: "vaStatus", fgts: "fgtsStatus", cc: "ccStatus" };
async function bucket() {
  if (!await getChatGPTUser()) throw new Error("Fa\xE7a login no GWL Flow para continuar.");
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.BUCKET) throw new Error("O arquivo permanente ainda n\xE3o est\xE1 dispon\xEDvel.");
  return env2.BUCKET;
}
function fail(error) {
  return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 500 });
}
var unauthorized2 = () => Response.json({ error: "Fa\xE7a login no GWL Flow para continuar." }, { status: 401 });
async function GET2(request) {
  if (!await getChatGPTUser()) return unauthorized2();
  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const download = url.searchParams.get("download") === "1";
    const view = url.searchParams.get("view") === "1";
    const db = await getDb();
    if (id && (download || view)) {
      const [row] = await db.select().from(resultArchives).where(eq(resultArchives.id, id)).limit(1);
      if (!row) return Response.json({ error: "Resultado n\xE3o encontrado." }, { status: 404 });
      const object = await (await bucket()).get(row.objectKey);
      if (!object) return Response.json({ error: "Arquivo n\xE3o encontrado no armazenamento." }, { status: 404 });
      const encoded = encodeURIComponent(row.fileName.replace(/[\r\n]/g, "_")).replace(/'/g, "%27");
      return new Response(object.body, { headers: { "content-type": row.contentType, "content-length": String(row.size), "content-disposition": `${view ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`, "cache-control": "private, max-age=300" } });
    }
    const month = url.searchParams.get("month") || "";
    const archives = month && validMonth2(month) ? await db.select().from(resultArchives).where(eq(resultArchives.referenceMonth, month)).orderBy(desc(resultArchives.id)).limit(300) : await db.select().from(resultArchives).orderBy(desc(resultArchives.id)).limit(300);
    const ids = archives.map((r) => r.id);
    const links = ids.length ? await db.select({ resultId: resultArchiveContracts.resultId, contractId: contractCatalog.id, contractName: contractCatalog.name }).from(resultArchiveContracts).innerJoin(contractCatalog, eq(resultArchiveContracts.contractId, contractCatalog.id)).where(inArray(resultArchiveContracts.resultId, ids)) : [];
    const legacyIds = archives.map((r) => r.contractId).filter((v) => Boolean(v));
    const legacy = legacyIds.length ? await db.select({ id: contractCatalog.id, name: contractCatalog.name }).from(contractCatalog).where(inArray(contractCatalog.id, legacyIds)) : [];
    const results = archives.map((row) => {
      const attached = links.filter((l) => l.resultId === row.id);
      const fallback = !attached.length && row.contractId ? legacy.filter((c) => c.id === row.contractId).map((c) => ({ contractId: c.id, contractName: c.name })) : [];
      const contracts2 = [...attached, ...fallback];
      return { ...row, contracts: contracts2, contractNames: contracts2.map((c) => c.contractName) };
    });
    return Response.json({ results });
  } catch (error) {
    return fail(error);
  }
}
async function POST2(request) {
  if (!await getChatGPTUser()) return unauthorized2();
  try {
    const url = new URL(request.url);
    const module = url.searchParams.get("module") || "";
    const month = url.searchParams.get("month") || "";
    const actor = url.searchParams.get("actor") || "";
    const fileName = (url.searchParams.get("fileName") || "resultado.zip").replace(/[\\/]/g, "_");
    const markDone = url.searchParams.get("markDone") !== "0";
    const requestedIds = (url.searchParams.get("contractIds") || "").split(",").map(Number).filter(Boolean);
    const markRequestedIds = (url.searchParams.get("markContractIds") || "").split(",").map(Number).filter(Boolean);
    const uploadId = (url.searchParams.get("uploadId") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 64);
    const uploadIndex = Math.max(0, Number(url.searchParams.get("uploadIndex") || 0));
    if (!modules.has(module) || !validMonth2(month) || !people2.has(actor) || !request.body) return Response.json({ error: "Preencha compet\xEAncia e respons\xE1vel." }, { status: 400 });
    const size = Number(request.headers.get("content-length") || 0);
    if (size > 150 * 1024 * 1024) return Response.json({ error: "O resultado excede o limite de 150 MB." }, { status: 413 });
    const db = await getDb();
    const validContracts = requestedIds.length ? await db.select({ id: contractCatalog.id, name: contractCatalog.name }).from(contractCatalog).where(inArray(contractCatalog.id, requestedIds)) : [];
    const markContracts = markRequestedIds.length ? await db.select({ id: contractCatalog.id, name: contractCatalog.name }).from(contractCatalog).where(inArray(contractCatalog.id, markRequestedIds)) : validContracts;
    const contractIds = validContracts.map((c) => c.id);
    const objectKey = uploadId ? `resultados/${month}/pdfs/${uploadId}-${uploadIndex}-${fileName}` : `resultados/${month}/lotes/${crypto.randomUUID()}-${fileName}`;
    if (uploadId) {
      const [existing] = await db.select().from(resultArchives).where(eq(resultArchives.objectKey, objectKey)).limit(1);
      if (existing) return Response.json({ result: existing, matched: validContracts, alreadySaved: true }, { status: 200 });
    }
    const store = await bucket();
    await store.put(objectKey, request.body, { httpMetadata: { contentType: request.headers.get("content-type") || "application/zip" } });
    const stored = await store.head(objectKey);
    const [created] = await db.insert(resultArchives).values({ contractId: contractIds[0] || null, module, referenceMonth: month, actor, fileName, objectKey, size: stored?.size || size, contentType: request.headers.get("content-type") || "application/zip" }).returning();
    if (contractIds.length) await db.insert(resultArchiveContracts).values(contractIds.map((contractId) => ({ resultId: created.id, contractId }))).onConflictDoNothing();
    for (const contract of markContracts) {
      if (markDone) {
        await db.run(sql`INSERT OR IGNORE INTO contract_competencies (contract_id, reference_month) VALUES (${contract.id}, ${month})`);
        await db.update(contractCompetencies).set({ [moduleFields[module]]: "done", updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(and(eq(contractCompetencies.contractId, contract.id), eq(contractCompetencies.referenceMonth, month)));
      }
      await db.insert(contractActivity).values({ contractId: contract.id, referenceMonth: month, actor, description: `${moduleLabels[module]}: inclu\xEDdo no resultado final${markDone ? " e etapa marcada como conclu\xEDda" : ""}.` });
    }
    return Response.json({ result: created, matched: validContracts }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
async function PUT(request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id || !request.body) return Response.json({ error: "Arquivo inv\xE1lido." }, { status: 400 });
    const db = await getDb();
    const [row] = await db.select().from(resultArchives).where(eq(resultArchives.id, id)).limit(1);
    if (!row) return Response.json({ error: "Resultado n\xE3o encontrado." }, { status: 404 });
    if (row.contentType !== "application/pdf" && !row.fileName.toLowerCase().endsWith(".pdf")) return Response.json({ error: "Somente PDFs podem ser editados." }, { status: 400 });
    const store = await bucket();
    await store.put(row.objectKey, request.body, { httpMetadata: { contentType: "application/pdf" } });
    const stored = await store.head(row.objectKey);
    await db.update(resultArchives).set({ size: stored?.size || row.size, contentType: "application/pdf" }).where(eq(resultArchives.id, id));
    return Response.json({ ok: true, size: stored?.size || row.size });
  } catch (error) {
    return fail(error);
  }
}
async function DELETE2(request) {
  try {
    const url = new URL(request.url);
    const ids = Array.from(new Set([url.searchParams.get("id") || "", ...(url.searchParams.get("ids") || "").split(",")].map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 100);
    if (!ids.length) return Response.json({ error: "Nenhum resultado v\xE1lido foi selecionado." }, { status: 400 });
    const db = await getDb();
    const rows = await db.select().from(resultArchives).where(inArray(resultArchives.id, ids));
    if (!rows.length) return Response.json({ error: "Resultados n\xE3o encontrados." }, { status: 404 });
    const foundIds = rows.map((row) => row.id);
    const linked = await db.select({ resultId: resultArchiveContracts.resultId, contractId: resultArchiveContracts.contractId }).from(resultArchiveContracts).where(inArray(resultArchiveContracts.resultId, foundIds));
    const store = await bucket();
    await store.delete(rows.map((row) => row.objectKey));
    await db.delete(resultArchives).where(inArray(resultArchives.id, foundIds));
    const checks = /* @__PURE__ */ new Map();
    for (const link of linked) {
      const row = rows.find((item) => item.id === link.resultId);
      if (row) checks.set(`${link.contractId}:${row.module}:${row.referenceMonth}`, { contractId: link.contractId, module: row.module, month: row.referenceMonth, actor: row.actor });
    }
    let reopened = 0;
    for (const check of checks.values()) {
      const remaining = await db.select({ id: resultArchives.id }).from(resultArchiveContracts).innerJoin(resultArchives, eq(resultArchiveContracts.resultId, resultArchives.id)).where(and(eq(resultArchiveContracts.contractId, check.contractId), eq(resultArchives.module, check.module), eq(resultArchives.referenceMonth, check.month))).limit(1);
      if (!remaining.length) {
        await db.run(sql`INSERT OR IGNORE INTO contract_competencies (contract_id, reference_month) VALUES (${check.contractId}, ${check.month})`);
        await db.update(contractCompetencies).set({ [moduleFields[check.module]]: "pending", updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(and(eq(contractCompetencies.contractId, check.contractId), eq(contractCompetencies.referenceMonth, check.month)));
        await db.insert(contractActivity).values({ contractId: check.contractId, referenceMonth: check.month, actor: check.actor, description: `${moduleLabels[check.module]}: resultado exclu\xEDdo e etapa retornada para Pendente.` });
        reopened++;
      }
    }
    return Response.json({ ok: true, deleted: rows.length, reopened });
  } catch (error) {
    return fail(error);
  }
}

// source/app/api/ponto/route.ts
var route_exports3 = {};
__export(route_exports3, {
  DELETE: () => DELETE3,
  GET: () => GET3,
  PATCH: () => PATCH2,
  POST: () => POST3
});
async function database2() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.DB) throw new Error("Banco do Ponto Dimivig indispon\xEDvel.");
  return env2.DB;
}
async function storage() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.BUCKET) throw new Error("Armazenamento de fotos indispon\xEDvel.");
  return env2.BUCKET;
}
function decodeDataUrl(value, maxBytes) {
  const dataUrl = typeof value === "string" ? value : "";
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = clean(match[1], 120);
  const base64 = match[2];
  if (base64.length > Math.ceil(maxBytes * 1.4)) throw new Error("O arquivo excede o limite permitido.");
  const binary = atob(base64);
  if (binary.length > maxBytes) throw new Error("O arquivo excede o limite permitido.");
  const bytes2 = new Uint8Array(binary.length);
  for (let index2 = 0; index2 < binary.length; index2++) bytes2[index2] = binary.charCodeAt(index2);
  return { bytes: bytes2, contentType };
}
var bad = (message, status = 400) => Response.json({ error: message }, { status });
var clean = (value, max = 180) => String(value ?? "").trim().slice(0, max);
var validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
var recordKinds = /* @__PURE__ */ new Set([
  "entrada",
  "saida_intervalo",
  "retorno_intervalo",
  "saida"
]);
var occurrenceDefaults = [
  ["ajuste-ponto", "Ajuste de ponto", "Marca\xE7\xF5es", "ponto", 0],
  ["permuta", "Permuta", "Escala", "escala", 1],
  ["troca-escala", "Troca de escala", "Escala", "escala", 0],
  ["atestado-medico", "Atestado m\xE9dico", "Sa\xFAde", "abono_total", 0],
  ["atestado-acompanhamento", "Atestado de acompanhamento", "Sa\xFAde", "abono_total", 0],
  ["declaracao-comparecimento", "Declara\xE7\xE3o de comparecimento", "Sa\xFAde", "abono_parcial", 0],
  ["licenca-medica", "Licen\xE7a m\xE9dica", "Licen\xE7as", "abono_total", 0],
  ["acidente-trabalho", "Acidente de trabalho", "Licen\xE7as", "abono_total", 0],
  ["afastamento-inss", "Afastamento pelo INSS", "Licen\xE7as", "abono_total", 0],
  ["falta-justificada", "Falta justificada", "Aus\xEAncias", "abono_total", 0],
  ["falta-injustificada", "Falta injustificada", "Aus\xEAncias", "debito", 0],
  ["esquecimento", "Esquecimento de marca\xE7\xE3o", "Marca\xE7\xF5es", "ponto", 0],
  ["problema-aplicativo", "Problema no aplicativo", "Marca\xE7\xF5es", "ponto", 0],
  ["problema-equipamento", "Problema no equipamento", "Marca\xE7\xF5es", "ponto", 0],
  ["trabalho-externo", "Trabalho externo", "Opera\xE7\xE3o", "informativo", 0],
  ["home-office", "Home office", "Opera\xE7\xE3o", "informativo", 0],
  ["treinamento", "Treinamento / capacita\xE7\xE3o", "Opera\xE7\xE3o", "abono_total", 0],
  ["reuniao-externa", "Reuni\xE3o externa", "Opera\xE7\xE3o", "abono_total", 0],
  ["viagem-servico", "Viagem a servi\xE7o", "Opera\xE7\xE3o", "abono_total", 0],
  ["hora-extra", "Hora extra autorizada", "Compensa\xE7\xE3o", "credito", 0],
  ["banco-credito", "Banco de horas \u2014 cr\xE9dito", "Compensa\xE7\xE3o", "credito", 0],
  ["banco-debito", "Banco de horas \u2014 d\xE9bito", "Compensa\xE7\xE3o", "debito", 0],
  ["folga-autorizada", "Folga autorizada", "Folgas", "abono_total", 0],
  ["folga-compensatoria", "Folga compensat\xF3ria", "Folgas", "abono_total", 0],
  ["folga-trabalhada", "Folga trabalhada", "Folgas", "credito", 0],
  ["feriado-trabalhado", "Feriado trabalhado", "Folgas", "credito", 0],
  ["ferias", "F\xE9rias", "Licen\xE7as", "abono_total", 0],
  ["licenca-maternidade", "Licen\xE7a-maternidade", "Licen\xE7as", "abono_total", 0],
  ["licenca-paternidade", "Licen\xE7a-paternidade", "Licen\xE7as", "abono_total", 0],
  ["licenca-casamento", "Licen\xE7a casamento (gala)", "Licen\xE7as", "abono_total", 0],
  ["licenca-luto", "Licen\xE7a luto (nojo)", "Licen\xE7as", "abono_total", 0],
  ["doacao-sangue", "Doa\xE7\xE3o de sangue", "Aus\xEAncias legais", "abono_total", 0],
  ["comparecimento-justica", "Comparecimento \xE0 Justi\xE7a", "Aus\xEAncias legais", "abono_total", 0],
  ["alistamento", "Alistamento eleitoral ou militar", "Aus\xEAncias legais", "abono_total", 0],
  ["acompanhamento-familiar", "Acompanhamento familiar", "Aus\xEAncias legais", "abono_total", 0],
  ["saida-autorizada", "Sa\xEDda autorizada", "Opera\xE7\xE3o", "abono_parcial", 0],
  ["convocacao", "Convoca\xE7\xE3o", "Opera\xE7\xE3o", "informativo", 0],
  ["sobreaviso", "Sobreaviso", "Opera\xE7\xE3o", "informativo", 0],
  ["suspensao", "Suspens\xE3o", "Aus\xEAncias", "debito", 0],
  ["outro", "Outro", "Outros", "informativo", 0]
];
async function ensureOccurrenceTypes(db) {
  const count = await db.prepare("SELECT count(*) AS total FROM ponto_occurrence_types").first();
  if (Number(count?.total || 0) > 0) return;
  for (let index2 = 0; index2 < occurrenceDefaults.length; index2++) {
    const [code, name, category, effect, related] = occurrenceDefaults[index2];
    await db.prepare("INSERT OR IGNORE INTO ponto_occurrence_types (code,name,category,effect,requires_related_employee,status,sort_order) VALUES (?,?,?,?,?,'active',?)").bind(code, name, category, effect, related, index2 + 1).run();
  }
}
async function upsertPermutaSchedule(db, employee, date, required, notes) {
  await db.prepare("INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes").bind(Number(employee.id), date, clean(employee.schedule, 40) || "12x36", clean(employee.expected_start, 5) || "06:00", clean(employee.expected_break_start, 5), clean(employee.expected_break_end, 5), clean(employee.expected_end, 5) || "18:00", required ? 1 : 0, notes).run();
}
async function applyApprovedPermuta(db, justificationId, actor) {
  const request = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(justificationId).first();
  if (!request || clean(request.kind, 100).toLowerCase() !== "permuta") return;
  const firstId = Number(request.employee_id);
  const secondId = Number(request.related_employee_id);
  const firstDate = clean(request.occurrence_date, 10);
  const secondDate = clean(request.related_date, 10);
  if (!firstId || !secondId || !validDate(firstDate) || !validDate(secondDate)) return;
  const first = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(firstId).first();
  const second = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(secondId).first();
  if (!first || !second) return;
  await upsertPermutaSchedule(db, first, firstDate, false, `PERMUTA COM ${clean(second.name, 120)} \u2014 TRABALHAR\xC1 EM ${secondDate}`);
  await upsertPermutaSchedule(db, first, secondDate, true, `PERMUTA \u2014 COBERTURA DE ${clean(second.name, 120)}`);
  await upsertPermutaSchedule(db, second, secondDate, false, `PERMUTA COM ${clean(first.name, 120)} \u2014 TRABALHAR\xC1 EM ${firstDate}`);
  await upsertPermutaSchedule(db, second, firstDate, true, `PERMUTA \u2014 COBERTURA DE ${clean(first.name, 120)}`);
  await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('justification',?,'permuta_apply','',?,?)").bind(justificationId, JSON.stringify({ firstId, firstDate, secondId, secondDate }), actor).run();
}
var radians = (value) => value * Math.PI / 180;
var distanceMeters = (aLat, aLng, bLat, bLng) => {
  const earth = 6371e3;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};
async function authorized(request) {
  const db = await database2();
  return pontoIdentity(request, db);
}
async function ensureProfile(db, user) {
  const isPortalAdministrator = user.email.trim().toLowerCase() === "dimivigia@gmail.com";
  let profile2 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(user.email).first();
  if (profile2) {
    if (isPortalAdministrator && profile2.role !== "Administrador") {
      await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(profile2.id).run();
      profile2 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(profile2.id).first();
    }
    return profile2;
  }
  const total = await db.prepare("SELECT count(*) AS total FROM ponto_access_profiles").first();
  const role = isPortalAdministrator || Number(total?.total || 0) === 0 ? "Administrador" : "Colaborador";
  const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?,?,'active')").bind(user.email, clean(user.fullName || user.displayName), role).run();
  profile2 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(result.meta?.last_row_id).first();
  return profile2;
}
async function GET3(request) {
  const user = await authorized(request);
  if (!user) return bad("Fa\xE7a login no Ponto Dimivig para continuar.", 401);
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") || "bootstrap";
    const db = await database2();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive")
      return bad("Seu acesso ao Ponto Dimivig est\xE1 inativo.", 403);
    await ensureOccurrenceTypes(db);
    const role = String(appUser?.role || "Colaborador");
    const linkedEmployeeId = Number(appUser?.employee_id) || 0;
    const linkedSiteId = Number(appUser?.site_id) || 0;
    if (entity === "photo") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT r.photo_key,r.employee_id,e.site_id FROM ponto_records r JOIN ponto_employees e ON e.id=r.employee_id WHERE r.id = ?").bind(id).first();
      if (!row?.photo_key) return bad("Foto n\xE3o encontrada.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.photo_key);
      if (!object) return bad("Foto n\xE3o encontrada.", 404);
      return new Response(object.body, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "private, max-age=300"
        }
      });
    }
    if (entity === "justification-evidence") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT j.attachment_key,j.attachment_name,j.attachment_content_type,j.employee_id,e.site_id FROM ponto_justifications j JOIN ponto_employees e ON e.id=j.employee_id WHERE j.id=?").bind(id).first();
      if (!row?.attachment_key) return bad("Comprovante n\xE3o encontrado.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.attachment_key);
      if (!object) return bad("Comprovante n\xE3o encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": row.attachment_content_type || "application/octet-stream", "content-disposition": `inline; filename="${row.attachment_name.replaceAll('"', "")}"`, "cache-control": "private, max-age=300" } });
    }
    if (entity === "signature") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT sg.signature_key,sg.employee_id,e.site_id FROM ponto_timesheet_signatures sg JOIN ponto_employees e ON e.id=sg.employee_id WHERE sg.id=?").bind(id).first();
      if (!row?.signature_key) return bad("Assinatura n\xE3o encontrada.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.signature_key);
      if (!object) return bad("Assinatura n\xE3o encontrada.", 404);
      return new Response(object.body, { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
    }
    if (entity === "document") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT d.object_key,d.file_name,d.content_type,d.employee_id,d.site_id,e.site_id AS employee_site_id FROM ponto_documents d LEFT JOIN ponto_employees e ON e.id=d.employee_id WHERE d.id=?").bind(id).first();
      if (!row) return bad("Arquivo n\xE3o encontrado.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId && row.employee_site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.object_key);
      if (!object) return bad("Arquivo n\xE3o encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": row.content_type, "content-disposition": `inline; filename="${row.file_name.replaceAll('"', "")}"`, "cache-control": "private, max-age=300" } });
    }
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEndValue = /* @__PURE__ */ new Date(`${monthStart}T12:00:00Z`);
    monthEndValue.setUTCMonth(monthEndValue.getUTCMonth() + 1);
    monthEndValue.setUTCDate(0);
    const monthEnd = monthEndValue.toISOString().slice(0, 10);
    const requestedStart = clean(url.searchParams.get("startDate"), 10);
    const requestedEnd = clean(url.searchParams.get("endDate"), 10);
    const startDate = validDate(requestedStart) ? requestedStart : monthStart;
    const endDate = validDate(requestedEnd) ? requestedEnd : monthEnd;
    const rangeDays = Math.floor((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 864e5);
    if (rangeDays < 0 || rangeDays > 62) return bad("O per\xEDodo da folha deve ter entre 1 e 63 dias.");
    const recordStartValue = /* @__PURE__ */ new Date(`${startDate}T12:00:00Z`);
    const recordEndValue = /* @__PURE__ */ new Date(`${endDate}T12:00:00Z`);
    recordStartValue.setUTCDate(recordStartValue.getUTCDate() - 1);
    recordEndValue.setUTCDate(recordEndValue.getUTCDate() + 1);
    const recordsStartDate = recordStartValue.toISOString().slice(0, 10);
    const recordsEndDate = recordEndValue.toISOString().slice(0, 10);
    const documentCompetence = endDate.slice(0, 7);
    const [sites, employees, records, justifications, schedules, documents, profiles, assets, occurrenceTypes, auditEvents, signatures] = await Promise.all([
      db.prepare("SELECT * FROM ponto_sites ORDER BY status, name").all(),
      db.prepare(
        "SELECT e.*, s.name AS site_name, s.contract, s.company AS company_name, s.cnpj AS company_cnpj FROM ponto_employees e LEFT JOIN ponto_sites s ON s.id=e.site_id ORDER BY e.status, e.name"
      ).all(),
      db.prepare(
        "SELECT r.*, e.name AS employee_name, e.registration, e.job_title, e.site_id, e.status AS employee_status, s.name AS site_name, s.contract FROM ponto_records r JOIN ponto_employees e ON e.id=r.employee_id LEFT JOIN ponto_sites s ON s.id=e.site_id WHERE substr(r.recorded_at,1,10) BETWEEN ? AND ? ORDER BY r.recorded_at DESC LIMIT 10000"
      ).bind(recordsStartDate, recordsEndDate).all(),
      db.prepare(
        "SELECT j.*, e.name AS employee_name, re.name AS related_employee_name FROM ponto_justifications j JOIN ponto_employees e ON e.id=j.employee_id LEFT JOIN ponto_employees re ON re.id=j.related_employee_id WHERE (j.occurrence_date<=? AND coalesce(nullif(j.end_date,''),j.occurrence_date)>=?) OR j.status='pending' ORDER BY j.created_at DESC LIMIT 1000"
      ).bind(endDate, startDate).all(),
      db.prepare(
        "SELECT sc.*, e.name AS employee_name FROM ponto_schedules sc JOIN ponto_employees e ON e.id=sc.employee_id WHERE sc.work_date BETWEEN ? AND ? ORDER BY sc.work_date DESC, e.name LIMIT 5000"
      ).bind(startDate, endDate).all(),
      db.prepare("SELECT d.*, e.name AS employee_name, s.name AS site_name FROM ponto_documents d LEFT JOIN ponto_employees e ON e.id=d.employee_id LEFT JOIN ponto_sites s ON s.id=d.site_id WHERE d.competence=? ORDER BY d.created_at DESC LIMIT 500").bind(documentCompetence).all(),
      db.prepare("SELECT p.*, e.name AS employee_name, s.name AS site_name, c.id AS credential_id, c.must_change_password, c.last_login_at FROM ponto_access_profiles p LEFT JOIN ponto_employees e ON e.id=p.employee_id LEFT JOIN ponto_sites s ON s.id=p.site_id LEFT JOIN ponto_credentials c ON c.profile_id=p.id ORDER BY p.status, p.name, p.email").all(),
      db.prepare("SELECT a.*, e.name AS employee_name, s.name AS site_name FROM ponto_assets a LEFT JOIN ponto_employees e ON e.id=a.employee_id LEFT JOIN ponto_sites s ON s.id=a.site_id ORDER BY a.status, a.name").all(),
      db.prepare("SELECT * FROM ponto_occurrence_types ORDER BY status, sort_order, name").all(),
      db.prepare("SELECT * FROM ponto_audit_events ORDER BY created_at DESC LIMIT 500").all(),
      db.prepare("SELECT sg.*,e.name AS employee_name,e.site_id,s.name AS site_name FROM ponto_timesheet_signatures sg JOIN ponto_employees e ON e.id=sg.employee_id LEFT JOIN ponto_sites s ON s.id=e.site_id WHERE sg.start_date<=? AND sg.end_date>=? ORDER BY sg.signed_at DESC LIMIT 1000").bind(endDate, startDate).all()
    ]);
    const resultRows = (query) => query.results || [];
    const employeeRows = resultRows(employees);
    const visibleEmployees = role === "Colaborador" ? employeeRows.filter((item) => Number(item.id) === linkedEmployeeId) : role === "Cliente" ? employeeRows.filter((item) => Number(item.site_id) === linkedSiteId) : employeeRows;
    const visibleRecords = resultRows(records).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId : true);
    const visibleJustifications = resultRows(justifications).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleSchedules = resultRows(schedules).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleDocuments = resultRows(documents).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId || visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleSignatures = resultRows(signatures).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId : true);
    return Response.json({
      user,
      appUser,
      month,
      startDate,
      endDate,
      sites: role === "Cliente" ? resultRows(sites).filter((item) => Number(item.id) === linkedSiteId) : role === "Colaborador" ? resultRows(sites).filter((item) => visibleEmployees.some((employee) => Number(employee.site_id) === Number(item.id))) : resultRows(sites),
      employees: visibleEmployees,
      records: visibleRecords,
      justifications: visibleJustifications,
      schedules: visibleSchedules,
      documents: visibleDocuments,
      signatures: visibleSignatures,
      profiles: role === "Administrador" ? resultRows(profiles) : [],
      assets: role === "Administrador" ? resultRows(assets) : [],
      occurrenceTypes: resultRows(occurrenceTypes),
      auditEvents: ["Administrador", "Fiscal"].includes(role) ? resultRows(auditEvents) : []
    });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Falha ao carregar o Ponto Dimivig.",
      500
    );
  }
}
async function POST3(request) {
  try {
    const body = await request.json();
    const entity = clean(body.entity, 40);
    const user = await authorized(request);
    if (!user) return bad("Fa\xE7a login no Ponto Dimivig para continuar.", 401);
    const db = await database2();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const role = String(appUser?.role || "Colaborador");
    if (["site", "employee", "profile", "asset", "occurrenceType", "importBatch"].includes(entity) && role !== "Administrador") return bad("Apenas administradores podem realizar esta opera\xE7\xE3o.", 403);
    if (["schedule", "scheduleRange", "document"].includes(entity) && !["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gest\xE3o pode realizar esta opera\xE7\xE3o.", 403);
    if (entity === "record" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Voc\xEA s\xF3 pode registrar o pr\xF3prio ponto.", 403);
    if (entity === "justification" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Voc\xEA s\xF3 pode justificar o pr\xF3prio ponto.", 403);
    if (entity === "timesheetSignature" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Voc\xEA s\xF3 pode assinar a pr\xF3pria folha.", 403);
    if (["record", "justification", "timesheetSignature"].includes(entity) && role === "Cliente") return bad("Perfil de cliente possui acesso somente para consulta.", 403);
    if (entity === "site") {
      const name = clean(body.name);
      if (!name) return bad("Informe o nome do posto.");
      const result = await db.prepare(
        "INSERT INTO ponto_sites (name,contract,city,responsible,company,cnpj,site_type,phone,email,address,address_number,zip_code,rotating,require_photo,require_geo,notes,latitude,longitude,radius_meters,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        name,
        clean(body.contract),
        clean(body.city),
        clean(body.responsible),
        clean(body.company) || "Dimivig Seguran\xE7a",
        clean(body.cnpj, 30),
        clean(body.siteType, 60) || "Armado",
        clean(body.phone, 30),
        clean(body.email),
        clean(body.address),
        clean(body.addressNumber, 30),
        clean(body.zipCode, 20),
        body.rotating === true || body.rotating === "true" ? 1 : 0,
        body.requirePhoto === false || body.requirePhoto === "false" ? 0 : 1,
        body.requireGeo === false || body.requireGeo === "false" ? 0 : 1,
        clean(body.notes, 1e3),
        clean(body.latitude, 30),
        clean(body.longitude, 30),
        Math.max(50, Number(body.radiusMeters) || 300),
        clean(body.status, 20) || "active"
      ).run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 }
      );
    }
    if (entity === "employee") {
      const name = clean(body.name);
      const registration = clean(body.registration, 40);
      if (!name || !registration) return bad("Informe nome e matr\xEDcula.");
      const result = await db.prepare(
        "INSERT INTO ponto_employees (name,registration,cpf,job_title,site_id,schedule,admission_date,journey_start_date,ctps_number,ctps_series,pis_pasep,expected_start,expected_break_start,expected_break_end,expected_end,registers_point,email,phone,status,require_photo,require_geo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        name,
        registration,
        clean(body.cpf, 20),
        clean(body.jobTitle) || "Vigilante",
        Number(body.siteId) || null,
        clean(body.schedule, 30) || "12x36",
        clean(body.admissionDate, 10),
        clean(body.journeyStartDate, 10),
        clean(body.ctpsNumber, 40),
        clean(body.ctpsSeries, 30),
        clean(body.pisPasep, 30),
        clean(body.expectedStart, 5) || "06:00",
        clean(body.expectedBreakStart, 5) || "12:00",
        clean(body.expectedBreakEnd, 5) || "13:00",
        clean(body.expectedEnd, 5) || "18:00",
        body.registersPoint === false || body.registersPoint === "false" ? 0 : 1,
        clean(body.email),
        clean(body.phone, 30),
        "active",
        body.requirePhoto === "true" || body.requirePhoto === true ? 1 : 0,
        body.requireGeo === "true" || body.requireGeo === true ? 1 : 0
      ).run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 }
      );
    }
    if (entity === "profile") {
      const email = clean(body.email).toLowerCase();
      const name = clean(body.name);
      const profileRole = clean(body.role, 30) || "Colaborador";
      const password = String(body.password || "");
      if (!email || !email.includes("@")) return bad("Informe um e-mail v\xE1lido para o acesso.");
      if (!["Administrador", "Fiscal", "Colaborador", "Cliente"].includes(profileRole)) return bad("Perfil inv\xE1lido.");
      if (!password) return bad("Defina uma senha provis\xF3ria para o primeiro acesso.");
      const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,employee_id,site_id,status) VALUES (?,?,?,?,?,'active')").bind(email, name || email, profileRole, Number(body.employeeId) || null, Number(body.siteId) || null).run();
      const profileId = Number(result.meta?.last_row_id);
      await upsertCredential(db, profileId, email, password, true);
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('profile',?,'credential_create','',?,?)").bind(profileId, JSON.stringify({ email, role: profileRole, employeeId: Number(body.employeeId) || null }), user.email).run();
      return Response.json({ ok: true, id: profileId }, { status: 201 });
    }
    if (entity === "record") {
      const employeeId = Number(body.employeeId);
      const kind = clean(body.kind, 40);
      const manual = clean(body.source, 20) === "manual" && ["Administrador", "Fiscal"].includes(role);
      if (!employeeId || !recordKinds.has(kind))
        return bad("Registro de ponto inv\xE1lido.");
      const employee = await db.prepare("SELECT * FROM ponto_employees WHERE id=? AND status='active'").bind(employeeId).first();
      if (!employee) return bad("Colaborador n\xE3o encontrado ou inativo.", 404);
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!manual && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))
        return bad("Ative o GPS: a localiza\xE7\xE3o \xE9 obrigat\xF3ria para registrar o ponto.", 422);
      const photo = typeof body.photoDataUrl === "string" ? body.photoDataUrl : "";
      if (!manual && !photo.startsWith("data:image/"))
        return bad("A foto em tempo real \xE9 obrigat\xF3ria para registrar o ponto.", 422);
      if (!manual) {
        if (!employee.site_id) return bad("O colaborador precisa estar vinculado a um posto com geolocaliza\xE7\xE3o configurada.", 422);
        const site = await db.prepare("SELECT latitude,longitude,radius_meters FROM ponto_sites WHERE id=?").bind(employee.site_id).first();
        const siteLat = Number(site?.latitude);
        const siteLng = Number(site?.longitude);
        if (!Number.isFinite(siteLat) || !Number.isFinite(siteLng) || !siteLat && !siteLng) return bad("O posto ainda n\xE3o possui coordenadas para validar a cerca.", 422);
        const distance = distanceMeters(latitude, longitude, siteLat, siteLng);
        if (distance > Number(site?.radius_meters || 300)) return bad(`Registro fora da cerca permitida (${Math.round(distance)} m do posto).`, 422);
      }
      const last = await db.prepare(
        "SELECT kind, recorded_at FROM ponto_records WHERE employee_id=? AND date(recorded_at)=date(?) ORDER BY recorded_at DESC LIMIT 1"
      ).bind(employeeId, clean(body.recordedAt, 40)).first();
      const sequence = {
        entrada: null,
        saida_intervalo: "entrada",
        retorno_intervalo: "saida_intervalo",
        saida: "retorno_intervalo"
      };
      if (!manual && (sequence[kind] && last?.kind !== sequence[kind] || kind === "entrada" && last))
        return bad(
          "A sequ\xEAncia da jornada n\xE3o permite esse registro agora.",
          409
        );
      let photoKey = null;
      if (photo.startsWith("data:image/") && photo.includes(",")) {
        const base64 = photo.split(",")[1];
        if (base64.length > 3e6)
          return bad("A foto excede o limite permitido.", 413);
        const binary = atob(base64);
        const bytes2 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes2[i] = binary.charCodeAt(i);
        photoKey = `ponto/fotos/${employeeId}/${crypto.randomUUID()}.jpg`;
        await (await storage()).put(photoKey, bytes2, { httpMetadata: { contentType: "image/jpeg" } });
      }
      const recordedAt = clean(body.recordedAt, 40) || (/* @__PURE__ */ new Date()).toISOString();
      const result = await db.prepare(
        "INSERT INTO ponto_records (employee_id,kind,recorded_at,latitude,longitude,accuracy,photo_key,source,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        employeeId,
        kind,
        recordedAt,
        clean(body.latitude, 30),
        clean(body.longitude, 30),
        Math.round(Number(body.accuracy) || 0),
        photoKey,
        manual ? "manual" : "web",
        "valid",
        clean(body.notes, 500),
        user.email
      ).run();
      if (manual && result.meta?.last_row_id) {
        await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('record',?,'manual_create','',?,?)").bind(result.meta.last_row_id, JSON.stringify({ employeeId, kind, recordedAt, notes: clean(body.notes, 500) }), user.email).run();
      }
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 }
      );
    }
    if (entity === "justification") {
      const employeeId = Number(body.employeeId);
      const date = clean(body.occurrenceDate, 10);
      const reason = clean(body.reason, 1e3);
      if (!employeeId || !validDate(date) || !reason)
        return bad("Preencha colaborador, data e justificativa.");
      const kind = clean(body.kind, 100) || "Ajuste de ponto";
      const relatedEmployeeId = Number(body.relatedEmployeeId) || null;
      const relatedDate = clean(body.relatedDate, 10);
      if (relatedEmployeeId === employeeId) return bad("O substituto deve ser outro colaborador.");
      if (relatedEmployeeId && !validDate(relatedDate)) return bad("Informe a data correspondente da troca.");
      const attachment = decodeDataUrl(body.attachmentDataUrl, 8e6);
      if (kind.toLowerCase() === "permuta" && (!attachment || !attachment.contentType.startsWith("image/")))
        return bad("A foto do documento ou da escala \xE9 obrigat\xF3ria para lan\xE7ar uma permuta.", 422);
      let attachmentKey = null;
      const attachmentName = clean(body.attachmentName, 220);
      if (attachment) {
        if (!attachment.contentType.startsWith("image/") && attachment.contentType !== "application/pdf") return bad("Anexe uma imagem ou PDF v\xE1lido.", 422);
        attachmentKey = `ponto/justificativas/${employeeId}/${crypto.randomUUID()}`;
        await (await storage()).put(attachmentKey, attachment.bytes, { httpMetadata: { contentType: attachment.contentType } });
      }
      const result = await db.prepare(
        "INSERT INTO ponto_justifications (employee_id,occurrence_date,kind,reason,end_date,start_time,end_time,related_employee_id,related_date,attachment_key,attachment_name,attachment_content_type,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending')"
      ).bind(
        employeeId,
        date,
        kind,
        reason,
        validDate(clean(body.endDate, 10)) ? clean(body.endDate, 10) : "",
        clean(body.startTime, 5),
        clean(body.endTime, 5),
        relatedEmployeeId,
        validDate(relatedDate) ? relatedDate : "",
        attachmentKey,
        attachmentName,
        attachment?.contentType || ""
      ).run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 }
      );
    }
    if (entity === "timesheetSignature") {
      const employeeId = Number(body.employeeId);
      const startDate = clean(body.startDate, 10);
      const endDate = clean(body.endDate, 10);
      const signedName = clean(body.signedName, 160);
      const signature = decodeDataUrl(body.signatureDataUrl, 15e5);
      if (!employeeId || !validDate(startDate) || !validDate(endDate) || startDate > endDate || !signedName || !signature?.contentType.startsWith("image/")) return bad("Confira o per\xEDodo, o nome e a assinatura.");
      const employee = await db.prepare("SELECT id FROM ponto_employees WHERE id=?").bind(employeeId).first();
      if (!employee) return bad("Colaborador n\xE3o encontrado.", 404);
      const previous = await db.prepare("SELECT signature_key FROM ponto_timesheet_signatures WHERE employee_id=? AND start_date=? AND end_date=?").bind(employeeId, startDate, endDate).first();
      const signatureKey = `ponto/assinaturas/${employeeId}/${startDate}-${endDate}-${crypto.randomUUID()}.png`;
      await (await storage()).put(signatureKey, signature.bytes, { httpMetadata: { contentType: "image/png" } });
      await db.prepare("INSERT INTO ponto_timesheet_signatures (employee_id,start_date,end_date,signature_key,signed_name,signed_by,status) VALUES (?,?,?,?,?,?,'signed') ON CONFLICT(employee_id,start_date,end_date) DO UPDATE SET signature_key=excluded.signature_key,signed_name=excluded.signed_name,signed_by=excluded.signed_by,signed_at=CURRENT_TIMESTAMP,status='signed'").bind(employeeId, startDate, endDate, signatureKey, signedName, user.email).run();
      if (previous?.signature_key && previous.signature_key !== signatureKey) await (await storage()).delete(previous.signature_key);
      const saved = await db.prepare("SELECT id FROM ponto_timesheet_signatures WHERE employee_id=? AND start_date=? AND end_date=?").bind(employeeId, startDate, endDate).first();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('timesheet_signature',?,'sign','',?,?)").bind(saved?.id || employeeId, JSON.stringify({ employeeId, startDate, endDate, signedName }), user.email).run();
      return Response.json({ ok: true, id: saved?.id }, { status: 201 });
    }
    if (entity === "importBatch") {
      const siteRows = Array.isArray(body.sites) ? body.sites.slice(0, 500) : [];
      const employeeRows = Array.isArray(body.employees) ? body.employees.slice(0, 500) : [];
      const existingSites = await db.prepare("SELECT id,name,source_system,source_id FROM ponto_sites ORDER BY id").all();
      const siteMap = /* @__PURE__ */ new Map();
      const siteSourceMap = /* @__PURE__ */ new Map();
      for (const item of existingSites.results || []) {
        const nameKey = item.name.trim().toLowerCase();
        if (!siteMap.has(nameKey)) siteMap.set(nameKey, item.id);
        if (item.source_system && item.source_id) siteSourceMap.set(`${item.source_system}:${item.source_id}`, item.id);
      }
      let importedSites = 0;
      let updatedSites = 0;
      let importedEmployees = 0;
      let updatedEmployees = 0;
      let skipped = 0;
      for (const row of siteRows) {
        const name = clean(row.name);
        if (!name) {
          skipped++;
          continue;
        }
        const key = name.toLowerCase();
        const sourceSystem = clean(row.sourceSystem, 30) || null;
        const sourceId = clean(row.sourceId, 80) || null;
        const sourceKey = sourceSystem && sourceId ? `${sourceSystem}:${sourceId}` : "";
        const existingId = sourceKey ? siteSourceMap.get(sourceKey) : siteMap.get(key);
        const values = [name, clean(row.contract), clean(row.city), clean(row.responsible), clean(row.company) || "Dimivig Seguran\xE7a", clean(row.cnpj, 30), clean(row.siteType, 60) || "Armado", clean(row.phone, 30), clean(row.email), clean(row.address), clean(row.addressNumber, 30), clean(row.zipCode, 20), row.requirePhoto === false ? 0 : 1, row.requireGeo === false ? 0 : 1, clean(row.notes, 500), clean(row.latitude, 30), clean(row.longitude, 30), Math.max(50, Number(row.radiusMeters) || 300), clean(row.status, 20) === "inactive" ? "inactive" : "active"];
        if (existingId) {
          await db.prepare("UPDATE ponto_sites SET source_system=coalesce(?,source_system),source_id=coalesce(?,source_id),name=?,contract=?,city=?,responsible=?,company=?,cnpj=?,site_type=?,phone=?,email=?,address=?,address_number=?,zip_code=?,require_photo=?,require_geo=?,notes=?,latitude=?,longitude=?,radius_meters=?,status=? WHERE id=?").bind(sourceSystem, sourceId, ...values, existingId).run();
          if (sourceKey) siteSourceMap.set(sourceKey, existingId);
          updatedSites++;
        } else {
          const result = await db.prepare("INSERT INTO ponto_sites (source_system,source_id,name,contract,city,responsible,company,cnpj,site_type,phone,email,address,address_number,zip_code,require_photo,require_geo,notes,latitude,longitude,radius_meters,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(sourceSystem, sourceId, ...values).run();
          if (result.meta?.last_row_id) {
            if (!siteMap.has(key)) siteMap.set(key, result.meta.last_row_id);
            if (sourceKey) siteSourceMap.set(sourceKey, result.meta.last_row_id);
            importedSites++;
          }
        }
      }
      const existingEmployees = await db.prepare("SELECT id,registration,source_system,source_id FROM ponto_employees ORDER BY id").all();
      const employeeSourceMap = /* @__PURE__ */ new Map();
      const registrationMap = /* @__PURE__ */ new Map();
      for (const item of existingEmployees.results || []) {
        if (item.source_system && item.source_id) employeeSourceMap.set(`${item.source_system}:${item.source_id}`, item.id);
        const registrationKey = item.registration.trim().toLowerCase();
        if (!registrationMap.has(registrationKey)) registrationMap.set(registrationKey, item.id);
      }
      for (const row of employeeRows) {
        const name = clean(row.name);
        const registration = clean(row.registration, 40);
        if (!name || !registration) {
          skipped++;
          continue;
        }
        const sourceSystem = clean(row.sourceSystem, 30) || null;
        const sourceId = clean(row.sourceId, 80) || null;
        const sourceKey = sourceSystem && sourceId ? `${sourceSystem}:${sourceId}` : "";
        const siteName = clean(row.siteName);
        let siteId = Number(row.siteId) || siteMap.get(siteName.toLowerCase()) || null;
        if (!siteId && siteName && sourceSystem === "tirvu") {
          const fallbackSourceId = siteName.toLowerCase();
          const fallbackKey = `tirvu-lotacao:${fallbackSourceId}`;
          siteId = siteSourceMap.get(fallbackKey) || null;
          if (!siteId) {
            const fallback = await db.prepare("INSERT INTO ponto_sites (source_system,source_id,name,company,status) VALUES ('tirvu-lotacao',?,?,?,'active')").bind(fallbackSourceId, siteName, clean(row.company) || "Dimivig Seguran\xE7a").run();
            siteId = Number(fallback.meta?.last_row_id) || null;
            if (siteId) {
              siteSourceMap.set(fallbackKey, siteId);
              siteMap.set(siteName.toLowerCase(), siteId);
              importedSites++;
            }
          }
        }
        const existingId = sourceKey ? employeeSourceMap.get(sourceKey) : registrationMap.get(registration.toLowerCase());
        const values = [name, registration, clean(row.cpf, 20), clean(row.jobTitle) || "Vigilante", siteId, clean(row.schedule, 80) || "12x36", clean(row.admissionDate, 10), clean(row.journeyStartDate, 10), clean(row.expectedStart, 5) || "06:00", clean(row.expectedBreakStart, 5), clean(row.expectedBreakEnd, 5), clean(row.expectedEnd, 5) || "18:00", row.registersPoint === false ? 0 : 1, clean(row.email), clean(row.phone, 30), clean(row.status, 20) === "inactive" ? "inactive" : "active", row.requirePhoto === false ? 0 : 1, row.requireGeo === false ? 0 : 1];
        if (existingId) {
          await db.prepare("UPDATE ponto_employees SET source_system=coalesce(?,source_system),source_id=coalesce(?,source_id),name=?,registration=?,cpf=?,job_title=?,site_id=?,schedule=?,admission_date=?,journey_start_date=?,expected_start=?,expected_break_start=?,expected_break_end=?,expected_end=?,registers_point=?,email=?,phone=?,status=?,require_photo=?,require_geo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sourceSystem, sourceId, ...values, existingId).run();
          if (sourceKey) employeeSourceMap.set(sourceKey, existingId);
          updatedEmployees++;
        } else {
          const result = await db.prepare("INSERT INTO ponto_employees (source_system,source_id,name,registration,cpf,job_title,site_id,schedule,admission_date,journey_start_date,expected_start,expected_break_start,expected_break_end,expected_end,registers_point,email,phone,status,require_photo,require_geo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(sourceSystem, sourceId, ...values).run();
          if (result.meta?.last_row_id) {
            if (sourceKey) employeeSourceMap.set(sourceKey, result.meta.last_row_id);
            importedEmployees++;
          } else skipped++;
        }
      }
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('import',0,'batch_import','',?,?)").bind(JSON.stringify({ importedSites, updatedSites, importedEmployees, updatedEmployees, skipped }), user.email).run();
      return Response.json({ ok: true, importedSites, updatedSites, importedEmployees, updatedEmployees, skipped }, { status: 201 });
    }
    if (entity === "schedule") {
      const employeeId = Number(body.employeeId);
      const date = clean(body.workDate, 10);
      if (!employeeId || !validDate(date))
        return bad("Informe colaborador e data da escala.");
      await db.prepare(
        "INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes"
      ).bind(
        employeeId,
        date,
        clean(body.shift, 30) || "12x36",
        clean(body.expectedStart, 5) || "07:00",
        clean(body.expectedBreakStart, 5) || "12:00",
        clean(body.expectedBreakEnd, 5) || "13:00",
        clean(body.expectedEnd, 5) || "19:00",
        body.required === false || body.required === "false" ? 0 : 1,
        clean(body.notes, 500)
      ).run();
      return Response.json({ ok: true }, { status: 201 });
    }
    if (entity === "scheduleRange") {
      const employeeId = Number(body.employeeId);
      const startDate = clean(body.startDate, 10);
      const endDate = clean(body.endDate, 10);
      const anchorDate = validDate(clean(body.anchorDate, 10)) ? clean(body.anchorDate, 10) : startDate;
      const cycle = clean(body.cycle, 30) || "12x36";
      const workDays = Array.isArray(body.workDays) ? body.workDays.map(Number).filter((item) => item >= 0 && item <= 6) : [1, 2, 3, 4, 5];
      if (!employeeId || !validDate(startDate) || !validDate(endDate) || startDate > endDate) return bad("Informe colaborador e per\xEDodo v\xE1lidos.");
      const totalDays = Math.floor((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 864e5) + 1;
      if (totalDays < 1 || totalDays > 63) return bad("A escala pode abranger no m\xE1ximo 63 dias.");
      const employee = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(employeeId).first();
      if (!employee) return bad("Colaborador n\xE3o encontrado.", 404);
      const anchorTime = Date.parse(`${anchorDate}T12:00:00Z`);
      let saved = 0;
      for (let offset = 0; offset < totalDays; offset++) {
        const current2 = /* @__PURE__ */ new Date(`${startDate}T12:00:00Z`);
        current2.setUTCDate(current2.getUTCDate() + offset);
        const date = current2.toISOString().slice(0, 10);
        const distance = Math.round((Date.parse(`${date}T12:00:00Z`) - anchorTime) / 864e5);
        const weekday = current2.getUTCDay();
        let required = true;
        if (cycle === "12x36") required = Math.abs(distance) % 2 === 0;
        else if (cycle === "6x1") required = (distance % 7 + 7) % 7 !== 6;
        else if (["44h", "5x2", "semanal", "personalizada"].includes(cycle)) required = workDays.includes(weekday);
        await db.prepare("INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes").bind(employeeId, date, clean(body.shift, 40) || String(employee.schedule || cycle), clean(body.expectedStart, 5) || String(employee.expected_start || "06:00"), clean(body.expectedBreakStart, 5), clean(body.expectedBreakEnd, 5), clean(body.expectedEnd, 5) || String(employee.expected_end || "18:00"), required ? 1 : 0, required ? clean(body.notes, 500) : "FOLGA ESCALA").run();
        saved++;
      }
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('schedule',?,'range_apply','',?,?)").bind(employeeId, JSON.stringify({ startDate, endDate, cycle, workDays, saved }), user.email).run();
      return Response.json({ ok: true, saved }, { status: 201 });
    }
    if (entity === "occurrenceType") {
      const name = clean(body.name, 100);
      if (!name) return bad("Informe o nome do motivo.");
      const code = clean(body.code, 80) || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const result = await db.prepare("INSERT INTO ponto_occurrence_types (code,name,category,effect,requires_related_employee,status,sort_order) VALUES (?,?,?,?,?,'active',?)").bind(code, name, clean(body.category, 80) || "Outros", clean(body.effect, 40) || "informativo", body.requiresRelatedEmployee === true || body.requiresRelatedEmployee === "true" ? 1 : 0, Number(body.sortOrder) || 999).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    if (entity === "document") {
      const fileName = clean(body.fileName, 220);
      const contentType = clean(body.contentType, 120) || "application/octet-stream";
      const competence = clean(body.competence, 7);
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      if (!fileName || !/^\d{4}-\d{2}$/.test(competence) || !dataUrl.includes(",")) return bad("Selecione um arquivo e informe a compet\xEAncia.");
      const base64 = dataUrl.split(",")[1];
      if (base64.length > 16e6) return bad("O arquivo excede o limite de 12 MB.", 413);
      const binary = atob(base64);
      const bytes2 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes2[i] = binary.charCodeAt(i);
      const objectKey = `ponto/documentos/${competence}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await (await storage()).put(objectKey, bytes2, { httpMetadata: { contentType } });
      const result = await db.prepare("INSERT INTO ponto_documents (employee_id,site_id,kind,file_name,object_key,content_type,size,signed,signed_by,competence,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(Number(body.employeeId) || null, Number(body.siteId) || null, clean(body.kind, 80) || "Outro", fileName, objectKey, contentType, bytes2.length, body.signed === true || body.signed === "true" ? 1 : 0, clean(body.signedBy), competence, user.email).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    if (entity === "asset") {
      const code = clean(body.code, 60);
      const name = clean(body.name);
      if (!code || !name) return bad("Informe c\xF3digo e nome do patrim\xF4nio.");
      const result = await db.prepare("INSERT INTO ponto_assets (code,name,category,site_id,employee_id,quantity,status,notes) VALUES (?,?,?,?,?,?,?,?)").bind(code, name, clean(body.category, 80) || "Equipamento", Number(body.siteId) || null, Number(body.employeeId) || null, Math.max(1, Number(body.quantity) || 1), clean(body.status, 30) || "available", clean(body.notes, 500)).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    return bad("Opera\xE7\xE3o desconhecida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar.";
    return bad(
      message.includes("UNIQUE") ? "J\xE1 existe um cadastro com essa matr\xEDcula." : message,
      message.includes("UNIQUE") ? 409 : 500
    );
  }
}
async function PATCH2(request) {
  const user = await authorized(request);
  if (!user) return bad("Fa\xE7a login para continuar.", 401);
  try {
    const body = await request.json();
    const db = await database2();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const entity = clean(body.entity, 40);
    const role = String(appUser?.role || "Colaborador");
    if (["employee", "site", "profile", "asset", "occurrenceType"].includes(entity) && role !== "Administrador") return bad("Apenas administradores podem realizar esta opera\xE7\xE3o.", 403);
    if (["record", "justification"].includes(entity) && !["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gest\xE3o pode realizar esta opera\xE7\xE3o.", 403);
    const id = Number(body.id);
    if (!id) return bad("Registro inv\xE1lido.");
    if (entity === "justification") {
      const status = clean(body.status, 20);
      if (!(/* @__PURE__ */ new Set(["approved", "rejected", "pending"])).has(status))
        return bad("Status inv\xE1lido.");
      const before = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(id).first();
      await db.prepare(
        "UPDATE ponto_justifications SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(status, user.email, id).run();
      if (status === "approved") await applyApprovedPermuta(db, id, user.email);
      const after = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(id).first();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('justification',?,'status_update',?,?,?)").bind(id, JSON.stringify(before || {}), JSON.stringify(after || {}), user.email).run();
    } else if (entity === "employee") {
      await db.prepare(
        "UPDATE ponto_employees SET name=coalesce(nullif(?,''),name),registration=coalesce(nullif(?,''),registration),cpf=coalesce(?,cpf),job_title=coalesce(nullif(?,''),job_title),site_id=coalesce(?,site_id),schedule=coalesce(nullif(?,''),schedule),admission_date=coalesce(?,admission_date),journey_start_date=coalesce(?,journey_start_date),ctps_number=coalesce(?,ctps_number),ctps_series=coalesce(?,ctps_series),pis_pasep=coalesce(?,pis_pasep),expected_start=coalesce(nullif(?,''),expected_start),expected_break_start=coalesce(nullif(?,''),expected_break_start),expected_break_end=coalesce(nullif(?,''),expected_break_end),expected_end=coalesce(nullif(?,''),expected_end),registers_point=coalesce(?,registers_point),email=coalesce(?,email),phone=coalesce(?,phone),status=coalesce(?,status),require_photo=coalesce(?,require_photo),require_geo=coalesce(?,require_geo),updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(clean(body.name), clean(body.registration, 40), body.cpf === void 0 ? null : clean(body.cpf, 20), clean(body.jobTitle), Number(body.siteId) || null, clean(body.schedule, 30), body.admissionDate === void 0 ? null : clean(body.admissionDate, 10), body.journeyStartDate === void 0 ? null : clean(body.journeyStartDate, 10), body.ctpsNumber === void 0 ? null : clean(body.ctpsNumber, 40), body.ctpsSeries === void 0 ? null : clean(body.ctpsSeries, 30), body.pisPasep === void 0 ? null : clean(body.pisPasep, 30), clean(body.expectedStart, 5), clean(body.expectedBreakStart, 5), clean(body.expectedBreakEnd, 5), clean(body.expectedEnd, 5), body.registersPoint === void 0 ? null : body.registersPoint === false || body.registersPoint === "false" ? 0 : 1, body.email === void 0 ? null : clean(body.email), body.phone === void 0 ? null : clean(body.phone, 30), body.status === void 0 ? null : clean(body.status, 20) === "inactive" ? "inactive" : "active", body.requirePhoto === void 0 ? null : body.requirePhoto === false || body.requirePhoto === "false" ? 0 : 1, body.requireGeo === void 0 ? null : body.requireGeo === false || body.requireGeo === "false" ? 0 : 1, id).run();
    } else if (entity === "site") {
      await db.prepare("UPDATE ponto_sites SET status=? WHERE id=?").bind(clean(body.status, 20) === "inactive" ? "inactive" : "active", id).run();
    } else if (entity === "record") {
      const before = await db.prepare("SELECT * FROM ponto_records WHERE id=?").bind(id).first();
      await db.prepare("UPDATE ponto_records SET status=?,notes=?,recorded_at=coalesce(nullif(?,''),recorded_at) WHERE id=?").bind(clean(body.status, 20) || "valid", clean(body.notes, 500), clean(body.recordedAt, 40), id).run();
      const after = await db.prepare("SELECT * FROM ponto_records WHERE id=?").bind(id).first();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('record',?,'manual_update',?,?,?)").bind(id, JSON.stringify(before || {}), JSON.stringify(after || {}), user.email).run();
    } else if (entity === "profile") {
      const role2 = clean(body.role, 30);
      if (!(/* @__PURE__ */ new Set(["Administrador", "Fiscal", "Colaborador", "Cliente"])).has(role2)) return bad("Perfil inv\xE1lido.");
      await db.prepare("UPDATE ponto_access_profiles SET role=?,employee_id=?,site_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(role2, Number(body.employeeId) || null, Number(body.siteId) || null, clean(body.status, 20) === "inactive" ? "inactive" : "active", id).run();
      if (body.password !== void 0 && String(body.password || "")) {
        const profile2 = await db.prepare("SELECT email FROM ponto_access_profiles WHERE id=?").bind(id).first();
        if (!profile2) return bad("Perfil n\xE3o encontrado.", 404);
        await upsertCredential(db, id, profile2.email, String(body.password), true);
        await db.prepare("DELETE FROM ponto_sessions WHERE credential_id IN (SELECT id FROM ponto_credentials WHERE profile_id=?)").bind(id).run();
      }
    } else if (entity === "asset") {
      await db.prepare("UPDATE ponto_assets SET site_id=?,employee_id=?,quantity=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number(body.siteId) || null, Number(body.employeeId) || null, Math.max(1, Number(body.quantity) || 1), clean(body.status, 30) || "available", clean(body.notes, 500), id).run();
    } else if (entity === "occurrenceType") {
      await db.prepare("UPDATE ponto_occurrence_types SET name=coalesce(nullif(?,''),name),category=coalesce(nullif(?,''),category),effect=coalesce(nullif(?,''),effect),requires_related_employee=coalesce(?,requires_related_employee),status=coalesce(nullif(?,''),status),sort_order=coalesce(?,sort_order) WHERE id=?").bind(clean(body.name, 100), clean(body.category, 80), clean(body.effect, 40), body.requiresRelatedEmployee === void 0 ? null : body.requiresRelatedEmployee === true || body.requiresRelatedEmployee === "true" ? 1 : 0, clean(body.status, 20), body.sortOrder === void 0 ? null : Number(body.sortOrder), id).run();
    } else return bad("Opera\xE7\xE3o desconhecida.");
    return Response.json({ ok: true });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Falha ao atualizar.",
      500
    );
  }
}
async function DELETE3(request) {
  const user = await authorized(request);
  if (!user) return bad("Fa\xE7a login para continuar.", 401);
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") || "";
    const id = Number(url.searchParams.get("id"));
    if (!id) return bad("Registro inv\xE1lido.");
    const db = await database2();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const role = String(appUser?.role || "Colaborador");
    if (!["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gest\xE3o pode excluir registros.", 403);
    if (entity === "asset" && role !== "Administrador") return bad("Apenas administradores podem excluir patrim\xF4nios.", 403);
    const tables = {
      record: "ponto_records",
      schedule: "ponto_schedules",
      justification: "ponto_justifications",
      document: "ponto_documents",
      asset: "ponto_assets"
    };
    if (!tables[entity])
      return bad("Somente registros operacionais podem ser exclu\xEDdos.");
    if (entity === "document") {
      const row = await db.prepare("SELECT object_key FROM ponto_documents WHERE id=?").bind(id).first();
      if (row?.object_key) await (await storage()).delete(row.object_key);
    }
    if (entity === "justification") {
      const row = await db.prepare("SELECT attachment_key FROM ponto_justifications WHERE id=?").bind(id).first();
      if (row?.attachment_key) await (await storage()).delete(row.attachment_key);
    }
    await db.prepare(`DELETE FROM ${tables[entity]} WHERE id=?`).bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Falha ao excluir.",
      500
    );
  }
}

// source/app/api/ponto-auth/route.ts
var route_exports4 = {};
__export(route_exports4, {
  DELETE: () => DELETE4,
  GET: () => GET4,
  POST: () => POST4
});
async function database3() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.DB) throw new Error("Banco do Ponto DIMIVIG indispon\xEDvel.");
  return env2.DB;
}
var bad2 = (message, status = 400) => Response.json({ error: message }, { status });
var cleanEmail = (value) => String(value || "").trim().toLowerCase().slice(0, 180);
var ownerEmail = process.env.OWNER_EMAIL || "dimivigia@gmail.com";
async function profileForCredential(db, credentialId) {
  return db.prepare("SELECT p.*,c.must_change_password,c.last_login_at FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE c.id=?").bind(credentialId).first();
}
function sessionPayload(identity, profile2) {
  return {
    authenticated: true,
    user: { email: identity.email, fullName: profile2.name || identity.email },
    appUser: profile2,
    mustChangePassword: Boolean(profile2.must_change_password)
  };
}
async function GET4(request) {
  try {
    const db = await database3();
    const credential = await credentialIdentity(request, db);
    if (credential?.credentialId) {
      const profile2 = await profileForCredential(db, credential.credentialId);
      if (profile2) return Response.json(sessionPayload(credential, profile2));
    }
    const platformUser = await getChatGPTUser();
    let needsSetup = false;
    const canOwnerRecover = platformUser?.email.toLowerCase() === ownerEmail;
    if (canOwnerRecover) {
      const existing = await db.prepare("SELECT id FROM ponto_credentials WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      needsSetup = !existing;
    }
    return Response.json({
      authenticated: false,
      needsSetup,
      canBootstrap: needsSetup && canOwnerRecover,
      canOwnerRecover,
      ownerLogin: canOwnerRecover ? ownerEmail : null
    });
  } catch (error) {
    return bad2(error instanceof Error ? error.message : "Falha ao conferir o acesso.", 500);
  }
}
async function POST4(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "login");
    const db = await database3();
    if (action === "bootstrap") {
      const platformUser = await getChatGPTUser();
      if (!platformUser || platformUser.email.toLowerCase() !== ownerEmail) return bad2("Somente o propriet\xE1rio do portal pode ativar o primeiro acesso.", 403);
      const existingCredential = await db.prepare("SELECT id FROM ponto_credentials WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      if (existingCredential) return bad2("O acesso administrativo j\xE1 foi ativado.", 409);
      const password2 = String(body.password || "");
      await passwordMaterial(password2);
      let profile3 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      if (!profile3) {
        const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?, 'Administrador','active')").bind(ownerEmail, platformUser.fullName || platformUser.displayName || "Administra\xE7\xE3o DIMIVIG").run();
        profile3 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(result.meta?.last_row_id).first();
      } else {
        await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(profile3.id).run();
      }
      await upsertCredential(db, Number(profile3?.id), ownerEmail, password2, false);
      const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?").bind(profile3?.id).first();
      const session2 = await createPontoSession(db, Number(credential?.id), request, Boolean(body.remember));
      const savedProfile = await profileForCredential(db, Number(credential?.id));
      return Response.json(sessionPayload({ email: ownerEmail }, savedProfile || profile3 || {}), { headers: { "set-cookie": sessionCookie(session2.token, session2.maxAge) } });
    }
    if (action === "ownerReset") {
      const platformUser = await getChatGPTUser();
      if (!platformUser || platformUser.email.toLowerCase() !== ownerEmail) {
        return bad2("Somente o propriet\xE1rio do portal pode redefinir o acesso administrativo principal.", 403);
      }
      const password2 = String(body.password || "");
      await passwordMaterial(password2);
      let profile3 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      if (!profile3) {
        const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?, 'Administrador','active')").bind(ownerEmail, platformUser.fullName || platformUser.displayName || "Administra\xE7\xE3o DIMIVIG").run();
        profile3 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(result.meta?.last_row_id).first();
      } else {
        await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(profile3.id).run();
      }
      await upsertCredential(db, Number(profile3?.id), ownerEmail, password2, false);
      const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?").bind(profile3?.id).first();
      if (!credential?.id) return bad2("N\xE3o foi poss\xEDvel localizar o acesso principal.", 500);
      await db.prepare("DELETE FROM ponto_sessions WHERE credential_id=?").bind(credential.id).run();
      const session2 = await createPontoSession(db, credential.id, request, Boolean(body.remember));
      const savedProfile = await profileForCredential(db, credential.id);
      return Response.json(sessionPayload({ email: ownerEmail }, savedProfile || profile3 || {}), {
        headers: { "set-cookie": sessionCookie(session2.token, session2.maxAge) }
      });
    }
    if (action === "changePassword") {
      const identity = await credentialIdentity(request, db);
      if (!identity?.credentialId) return bad2("Sua sess\xE3o expirou. Entre novamente.", 401);
      const row2 = await db.prepare("SELECT * FROM ponto_credentials WHERE id=?").bind(identity.credentialId).first();
      if (!row2) return bad2("Acesso n\xE3o encontrado.", 404);
      const current2 = await passwordDigest(String(body.currentPassword || ""), String(row2.password_salt), Number(row2.iterations));
      if (!constantTimeEqual(current2, String(row2.password_hash))) return bad2("A senha atual n\xE3o confere.", 401);
      const material = await passwordMaterial(String(body.newPassword || ""));
      await db.prepare("UPDATE ponto_credentials SET password_hash=?,password_salt=?,iterations=?,must_change_password=0,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(material.hash, material.salt, material.iterations, identity.credentialId).run();
      return Response.json({ ok: true });
    }
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const accessType = String(body.accessType || "colaborador");
    if (!email || !password) return bad2("Informe e-mail ou CPF e a senha.");
    const row = await db.prepare("SELECT c.*,p.name,p.role,p.status,p.employee_id,p.site_id FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE lower(c.email)=lower(?)").bind(email).first();
    if (!row) return bad2("Login ou senha inv\xE1lidos.", 401);
    if (row.status === "inactive") return bad2("Este acesso est\xE1 inativo. Procure a administra\xE7\xE3o.", 403);
    if (row.locked_until && Date.parse(String(row.locked_until)) > Date.now()) return bad2("Acesso temporariamente bloqueado por tentativas inv\xE1lidas. Tente novamente em alguns minutos.", 429);
    const digest2 = await passwordDigest(password, String(row.password_salt), Number(row.iterations));
    if (!constantTimeEqual(digest2, String(row.password_hash))) {
      const attempts = Number(row.failed_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1e3).toISOString() : null;
      await db.prepare("UPDATE ponto_credentials SET failed_attempts=?,locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(attempts >= 5 ? 0 : attempts, lockedUntil, row.id).run();
      return bad2("Login ou senha inv\xE1lidos.", 401);
    }
    const administrative = ["Administrador", "Fiscal"].includes(String(row.role));
    if (accessType === "administrativo" && !administrative) return bad2("Este usu\xE1rio n\xE3o possui perfil administrativo.", 403);
    if (accessType === "colaborador" && String(row.role) !== "Colaborador") return bad2("Este usu\xE1rio n\xE3o est\xE1 vinculado a um perfil de colaborador.", 403);
    await db.prepare("UPDATE ponto_credentials SET failed_attempts=0,locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
    const session = await createPontoSession(db, Number(row.id), request, Boolean(body.remember));
    const profile2 = await profileForCredential(db, Number(row.id));
    return Response.json(sessionPayload({ email }, profile2 || row), { headers: { "set-cookie": sessionCookie(session.token, session.maxAge) } });
  } catch (error) {
    return bad2(error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel entrar.", 500);
  }
}
async function DELETE4(request) {
  try {
    const db = await database3();
    const token = cookieValue(request, PONTO_COOKIE);
    if (token) await db.prepare("DELETE FROM ponto_sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
  } catch {
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
  }
}

// source/app/api/planner/route.ts
var route_exports5 = {};
__export(route_exports5, {
  GET: () => GET5,
  POST: () => POST5
});

// source/app/planner-tasks.ts
function plannerRole(profile2) {
  if (profile2.role === "Administrador") return "administrador";
  return ["administrador", "gerente"].includes(profile2.planner_role) ? profile2.planner_role : "colaborador";
}
var mayDelegate = (user) => ["administrador", "gerente"].includes(plannerRole(user.profile));
async function visibleTasks(db, email) {
  return db.prepare("SELECT * FROM planner_tasks WHERE visibility='public' OR (visibility='assigned' AND assignee_email=?) OR (visibility='personal' AND owner_email=?) ORDER BY CASE status WHEN 'concluida' THEN 1 ELSE 0 END,due_date,due_time,id DESC").bind(email, email).all();
}
var bad3 = (message, status = 400) => Response.json({ error: message }, { status });
var text2 = (v, n = 4e3) => String(v || "").trim().slice(0, n);
async function taskAction(db, user, body) {
  const action = body.action;
  if (action === "planner.role.update") {
    if (plannerRole(user.profile) !== "administrador") return bad3("Somente administradores podem alterar perfis.", 403);
    const email = text2(body.email, 180).toLowerCase(), role = text2(body.role, 30);
    if (!["administrador", "gerente", "colaborador"].includes(role)) return bad3("Perfil inv\xE1lido.");
    const target = await db.prepare("SELECT email,role FROM ponto_access_profiles WHERE lower(email)=? AND status='active'").bind(email).first();
    if (!target) return bad3("Usu\xE1rio ativo n\xE3o encontrado.", 404);
    if (target.role === "Administrador") return bad3("O administrador principal mant\xE9m o acesso administrativo.", 409);
    if (email === user.email) return bad3("Voc\xEA n\xE3o pode alterar o pr\xF3prio perfil.", 409);
    await db.prepare("UPDATE ponto_access_profiles SET planner_role=?,updated_at=CURRENT_TIMESTAMP WHERE lower(email)=?").bind(role, email).run();
    return Response.json({ ok: true });
  }
  if (action === "task.create" || action === "task.update") {
    const existing = action === "task.update" ? await db.prepare("SELECT * FROM planner_tasks WHERE id=?").bind(Number(body.id)).first() : null;
    if (action === "task.update" && (!existing || existing.owner_email !== user.email || existing.visibility === "assigned" || existing.visibility === "public" && !mayDelegate(user))) return bad3("Voc\xEA n\xE3o pode editar esta tarefa.", 403);
    const visibility = existing?.visibility || text2(body.visibility, 20) || "personal";
    if (!["personal", "assigned", "public"].includes(visibility)) return bad3("Visibilidade inv\xE1lida.");
    if (visibility !== "personal" && !mayDelegate(user)) return bad3("Somente administradores e gerentes podem delegar tarefas.", 403);
    const title = text2(body.title, 220), dueDate = text2(body.dueDate, 10), dueTime = text2(body.dueTime, 5), priority = text2(body.priority, 20) || "media";
    if (!title) return bad3("Informe o t\xEDtulo da tarefa.");
    if (!["baixa", "media", "alta", "urgente"].includes(priority)) return bad3("Urg\xEAncia inv\xE1lida.");
    if (visibility !== "personal" && !dueDate || dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate && (!Number.isFinite(Date.parse(dueDate + "T12:00:00Z")) || (/* @__PURE__ */ new Date(dueDate + "T12:00:00Z")).toISOString().slice(0, 10) !== dueDate)) return bad3("Informe uma data v\xE1lida para o prazo.");
    if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return bad3("Hor\xE1rio inv\xE1lido.");
    const minutes = Number(body.estimatedMinutes || 0);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 100800) return bad3("Informe uma dura\xE7\xE3o estimada v\xE1lida em minutos.");
    let assigneeEmail = "", assigneeName = "";
    if (visibility === "assigned") {
      assigneeEmail = text2(body.assigneeEmail, 180).toLowerCase();
      const person = await db.prepare("SELECT email,name FROM ponto_access_profiles WHERE lower(email)=? AND status='active'").bind(assigneeEmail).first();
      if (!person) return bad3("Selecione um usu\xE1rio cadastrado e ativo.");
      assigneeName = person.name || person.email;
    }
    if (existing) {
      await db.prepare("UPDATE planner_tasks SET title=?,notes=?,due_date=?,due_time=?,priority=?,estimated_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?").bind(title, text2(body.notes), dueDate, dueTime, priority, minutes, existing.id, user.email).run();
      return Response.json({ ok: true });
    }
    const result = await db.prepare("INSERT INTO planner_tasks (owner_email,creator_name,title,notes,due_date,due_time,priority,estimated_minutes,visibility,assignee_email,assignee_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(user.email, user.name, title, text2(body.notes), dueDate, dueTime, priority, minutes, visibility, assigneeEmail, assigneeName).run();
    return Response.json({ ok: true, id: result.meta?.last_row_id });
  }
  if (action === "task.claim") {
    const won = await db.prepare("UPDATE planner_tasks SET assignee_email=?,assignee_name=?,claimed_at=CURRENT_TIMESTAMP,status='em_andamento',updated_at=CURRENT_TIMESTAMP WHERE id=? AND visibility='public' AND assignee_email='' AND status='pendente' RETURNING id").bind(user.email, user.name, Number(body.id)).first();
    if (!won) return bad3("Esta tarefa j\xE1 foi assumida ou n\xE3o est\xE1 dispon\xEDvel. Atualize a lista.", 409);
    return Response.json({ ok: true });
  }
  const task = await db.prepare("SELECT * FROM planner_tasks WHERE id=?").bind(Number(body.id)).first();
  const visible = task && (task.visibility === "public" || (task.visibility === "assigned" ? task.assignee_email === user.email : task.owner_email === user.email));
  if (!visible) return bad3("Tarefa n\xE3o encontrada.", 404);
  if (action === "task.delete") {
    if (task.owner_email !== user.email || task.visibility === "assigned" || task.visibility === "public" && !mayDelegate(user)) return bad3("Voc\xEA n\xE3o pode excluir esta tarefa.", 403);
    await db.prepare("DELETE FROM planner_tasks WHERE id=? AND owner_email=?").bind(task.id, user.email).run();
    return Response.json({ ok: true });
  }
  const executor = task.visibility === "personal" ? task.owner_email : task.assignee_email;
  if (executor !== user.email) return bad3("Somente o respons\xE1vel pode atualizar a execu\xE7\xE3o.", 403);
  const next = action === "task.toggle" ? task.status === "concluida" ? "pendente" : "concluida" : text2(body.status, 20);
  if (action !== "task.toggle" && action !== "task.status") return bad3("A\xE7\xE3o inv\xE1lida.");
  if (!["pendente", "em_andamento", "concluida"].includes(next)) return bad3("Status inv\xE1lido.");
  const updated = await db.prepare("UPDATE planner_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=? RETURNING id").bind(next, task.id, task.status).first();
  if (!updated) return bad3("A tarefa mudou. Atualize a lista.", 409);
  return Response.json({ ok: true });
}

// source/app/fashion-search.ts
var normalizeFashion = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
var groups = [
  ["camisa", /\bcamisas?\b/, /\b(camisas?|polo)\b/],
  ["camiseta", /\bcamisetas?\b/, /\bcamisetas?\b/],
  ["calca", /\bcalcas?\b/, /\bcalcas?\b/],
  ["vestido", /\bvestidos?\b/, /\bvestidos?\b/],
  ["blusa", /\bblusas?\b/, /\bblusas?\b/],
  ["saia", /\bsaias?\b/, /\bsaias?\b/],
  ["bermuda", /\b(bermudas?|shorts?)\b/, /\b(bermudas?|shorts?)\b/],
  ["polo", /\bpolos?\b/, /\bpolos?\b/],
  ["blazer", /\bblazers?\b/, /\bblazers?\b/],
  ["moletom", /\bmoletom\b/, /\bmoletom\b/],
  ["jaqueta", /\bjaquetas?\b/, /\bjaquetas?\b/],
  ["tenis", /\btenis\b/, /\btenis\b/],
  ["sapato", /\bsapatos?\b/, /\b(sapatos?|mocassim|loafer)\b/],
  ["sandalia", /\bsandalias?\b/, /\bsandalias?\b/],
  ["biquini", /\bbiquinis?\b/, /\bbiquinis?\b/],
  ["casaco", /\bcasacos?\b/, /\bcasacos?\b/],
  ["regata", /\bregatas?\b/, /\bregatas?\b/],
  ["sueter", /\b(sueter|cardigan)\b/, /\b(sueter|cardigan)\b/],
  ["pijama", /\bpijamas?\b/, /\bpijamas?\b/],
  ["legging", /\bleggings?\b/, /\bleggings?\b/],
  ["macacao", /\bmacacao\b/, /\bmacacao\b/],
  ["conjunto", /\bconjuntos?\b/, /\bconjuntos?\b/]
];
var styles = [
  { name: "Old money", query: /old[ -]?money|quiet luxury/, match: /old[ -]?money|linho|alfaiataria|trico|oxford|polo|mocassim/, reject: /gamer|esport|futebol|jersey|uniforme|patrocin|estampad|neon|fluorescente/ },
  { name: "Streetwear", query: /streetwear/, match: /streetwear|oversized|cargo|wide leg|baggy|boxy/, reject: /social slim/ },
  { name: "Oversized", query: /oversized|over size/, match: /oversized|over size|ampl[ao]|boxy/, reject: /slim fit|just[ao]/ },
  { name: "Alfaiataria", query: /alfaiataria/, match: /alfaiataria/, reject: /gamer|jersey|uniforme/ },
  { name: "Minimalista", query: /minimalista/, match: /minimalista|lis[ao]|basica|basico/, reject: /estampad|neon|gamer|jersey/ }
];
function fashionIntent(query) {
  const q = normalizeFashion(query);
  const group = groups.find(([, test]) => test.test(q));
  const style = styles.find((s) => s.query.test(q));
  const fashion = Boolean(group || style || /\b(roupas?|moda|look|casaco|sueter|cardigan|regata|macacao|lingerie|cueca|calcinha|pijama|fitness|legging)\b/.test(q));
  const gender = /\b(feminin[ao]|mulher)\b/.test(q) ? "feminino" : /\b(masculin[ao]|homem)\b/.test(q) ? "masculino" : "";
  const base = group?.[0] || (/\b(roupas?|moda|look)\b/.test(q) || style ? "roupa" : q);
  const raw = q.replace(/old[ -]?money|quiet luxury|streetwear|minimalista|\b(bonit[ao]s?|melhores?|na moda|da moda|roupas?|moda|look|quero|comprar|barat[ao]s?|de|do|da|e|para|com|um|uma)\b/g, " ").replace(/\s+/g, " ").trim();
  let queries = [raw || "roupa"];
  if (style?.name === "Old money") {
    const alternatives = base === "calca" || base === "bermuda" ? ["alfaiataria", "sarja"] : base === "sapato" ? ["mocassim", "loafer"] : ["linho", "trico"];
    queries = alternatives.map((term) => [base === "roupa" ? "camisa" : base, gender, term].filter(Boolean).join(" "));
  } else if (style?.name === "Streetwear") queries = [[base === "roupa" ? "camiseta" : base, gender, base === "calca" ? "cargo" : "oversized"].filter(Boolean).join(" "), raw];
  const constrained = style && style.name !== "Old money" ? raw.replace(style.query, "").trim() : raw;
  if (queries.length === 1 && gender) queries.push(queries[0].replace(/\b(masculin[ao]|feminin[ao]|homem|mulher)\b/g, "").replace(/\s+/g, " ").trim());
  const constraints = constrained.split(/\s+/).filter((t) => t.length > 1 && !/^(masculin[ao]|feminin[ao]|homem|mulher)$/.test(t) && t !== group?.[0] && t !== group?.[0] + "s");
  return { fashion, style, group, gender, queries: [...new Set(queries)].slice(0, 2), constraints: style?.name === "Old money" ? constraints.filter((t) => !["old", "money", "quiet", "luxury"].includes(t)) : constraints };
}
function safeUrl(value, host) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && (!host || u.hostname === host) ? u.toString() : "";
  } catch {
    return "";
  }
}
function parseFashionCatalog(data, store) {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 24).flatMap((p) => {
    const variants = [];
    for (const sku of p.items || []) for (const seller of sku.sellers || []) {
      const offer = seller.commertialOffer || {};
      if (!(Number(offer.Price) > 0) || !(Number(offer.AvailableQuantity) > 0) || offer.IsAvailable === false) continue;
      if (offer.PriceValidUntil && Date.parse(offer.PriceValidUntil) < Date.now()) continue;
      variants.push({ sku, seller, offer });
    }
    variants.sort((a, b) => Number(a.offer.Price) - Number(b.offer.Price));
    const best = variants[0];
    if (!best) return [];
    const link = safeUrl(p.link, store.host);
    const image = safeUrl(best.sku.images?.[0]?.imageUrl);
    if (!link || !image || !p.productName) return [];
    const spec = (keys) => keys.flatMap((key) => p[key] || []).map(String).join(", ");
    const sizes = [...new Set(variants.flatMap((v) => v.sku.Tamanho || []).map(String))];
    const composition = spec(["COMPOSI\xC7\xC3O", "Composi\xE7\xE3o", "Material"]);
    const gender = spec(["G\xEAnero", "G\xCANERO"]);
    const color = spec(["Cor", "COR"]);
    return [{
      id: store.name + "-" + p.productId,
      title: String(p.productName),
      link,
      image,
      store: store.name,
      price: Number(best.offer.Price),
      originalPrice: Number(best.offer.ListPrice || 0),
      currency: "BRL",
      condition: "Novo",
      brand: String(p.brand || ""),
      composition,
      gender,
      color,
      sizes,
      priceSize: (best.sku.Tamanho || []).join(", "),
      description: String(p.description || "").replace(/<[^>]*>/g, " ").slice(0, 3e3),
      rating: 0,
      reviewCount: 0,
      sellerStatus: String(best.seller.sellerName || ""),
      officialStore: best.seller.sellerId === "1",
      category: (p.categories || []).join(" "),
      pattern: spec(["Estampa"]),
      releaseDate: p.releaseDate || ""
    }];
  });
}
function rankFashionProducts(products, query) {
  const intent = fashionIntent(query);
  const unique = /* @__PURE__ */ new Map();
  for (const item of products) {
    if (!Number.isFinite(item.price) || item.price <= 0 || !safeUrl(item.link) || !safeUrl(item.image)) continue;
    const title = normalizeFashion(item.title);
    const facts = normalizeFashion([item.title, item.composition, item.color, item.pattern, item.gender].join(" "));
    if (intent.group && !intent.group[2].test(title)) continue;
    if (intent.gender && !facts.includes(intent.gender)) continue;
    if (intent.gender && !/infantil|crianca|menino|menina|bebe/.test(normalizeFashion(query)) && /infantil|bebe|menino|menina/.test(title)) continue;
    if (intent.style && (!intent.style.match.test(facts) || intent.style.reject.test(facts))) continue;
    if (!intent.constraints.every((term) => facts.includes(term))) continue;
    const key = item.store + ":" + item.id;
    const prev = unique.get(key);
    if (!prev || item.price < prev.price) unique.set(key, item);
  }
  const valid = [...unique.values()];
  const min = Math.min(...valid.map((x) => x.price), Infinity);
  return valid.map((item) => {
    const facts = normalizeFashion([item.title, item.composition, item.pattern, item.color].join(" "));
    const reasons = [];
    if (intent.style) reasons.push("Caracter\xEDsticas compat\xEDveis com " + intent.style.name);
    if (item.composition) reasons.push("Composi\xE7\xE3o informada pela loja");
    if (item.officialStore) reasons.push("Vendido pela pr\xF3pria loja");
    const neutral = /off white|bege|branco|preto|marinho|creme|cinza|kaki|caqui|marrom/.test(facts);
    const stylePoints = intent.style ? 40 + (intent.style.name === "Old money" && neutral ? 8 : 0) : 40;
    const score = Math.round(stylePoints + (item.composition ? 12 : 0) + (item.officialStore ? 12 : 0) + Math.min(8, item.sizes.length * 2) + (item.rating > 0 ? Math.min(10, item.rating * 2) : 0) + 10 * min / item.price);
    return {
      ...item,
      score,
      reasons,
      savingsPercent: item.originalPrice > item.price ? Math.round((1 - item.price / item.originalPrice) * 100) : 0,
      badge: intent.style ? "Combina com " + intent.style.name : "Sele\xE7\xE3o de moda"
    };
  }).sort((a, b) => b.score - a.score || a.price - b.price).slice(0, 48);
}
async function searchFashion(query, page = 0) {
  const intent = fashionIntent(query);
  const stores = [{ name: "C&A", host: "www.cea.com.br" }, { name: "Hering", host: "www.hering.com.br" }, { name: "Reserva", host: "www.usereserva.com" }];
  const batches = [];
  await Promise.all(intent.queries.map(async (term) => {
    const group = await Promise.all(stores.map(async (store) => {
      try {
        const response = await fetch("https://" + store.host + "/api/catalog_system/pub/products/search?ft=" + encodeURIComponent(term) + `&_from=${page * 24}&_to=${page * 24 + 23}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(18e3)
        });
        if (!response.ok) return { name: store.name, status: "Cat\xE1logo indispon\xEDvel", items: [] };
        const items = parseFashionCatalog(await response.json(), store);
        return { name: store.name, status: items.length ? "consultada" : "Sem estoque para esta busca", items };
      } catch {
        return { name: store.name, status: "Cat\xE1logo indispon\xEDvel", items: [] };
      }
    }));
    batches.push(...group);
  }));
  const raw = batches.flatMap((x) => x.items);
  const results = rankFashionProducts(raw, query);
  return {
    results,
    page,
    hasMore: page < 9 && batches.some((b) => b.items.length >= 20),
    mode: "fashion",
    style: intent.style?.name || "",
    queries: intent.queries,
    inspectedCount: new Set(raw.map((x) => x.id)).size,
    sources: stores.map((store) => ({
      name: store.name,
      found: results.filter((x) => x.store === store.name).length,
      status: results.some((x) => x.store === store.name) ? "consultada" : batches.some((b) => b.name === store.name && b.status === "consultada") ? "Sem pe\xE7as compat\xEDveis" : batches.find((b) => b.name === store.name)?.status
    })),
    retailers: stores.map((s) => ({ name: s.name, found: results.filter((x) => x.store === s.name).length })).filter((s) => s.found),
    criteria: ["Estilo solicitado", "Tipo de pe\xE7a", "Composi\xE7\xE3o informada", "Origem da oferta", "Estoque por tamanho", "Pre\xE7o"],
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// source/app/api/planner/route.ts
async function resources() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.DB || !env2.BUCKET) throw new Error("Os servi\xE7os do GWL Planner est\xE3o indispon\xEDveis.");
  return { db: env2.DB, bucket: env2.BUCKET };
}
var bad4 = (message, status = 400) => Response.json({ error: message }, { status });
var text3 = (value, size = 4e3) => String(value || "").trim().slice(0, size);
var cleanEmail2 = (value) => text3(value, 180).toLowerCase();
var messengerFileTypes = /* @__PURE__ */ new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
var messengerExtensions = /* @__PURE__ */ new Set(["pdf", "txt", "csv", "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
function allowedMessengerFile(file) {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  return file.type.startsWith("image/") && file.type !== "image/svg+xml" || messengerFileTypes.has(file.type) || messengerExtensions.has(extension);
}
async function current(request, db) {
  const identity = await credentialIdentity(request, db);
  if (!identity) return null;
  const profile2 = await db.prepare("SELECT id,email,name,role,planner_role,employee_id,site_id,status FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(identity.email).first();
  if (!profile2 || profile2.status === "inactive") return null;
  return { email: identity.email.toLowerCase(), name: String(profile2.name || identity.displayName || identity.email), profile: { ...profile2, planner_role: plannerRole(profile2) } };
}
async function ensureGeneral(db) {
  await db.prepare("INSERT OR IGNORE INTO planner_threads (id,title,kind,created_by) VALUES ('general','Equipe GWL','general','system')").run();
}
function xml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
var TRUSTED_NEWS = ["Ag\xEAncia Brasil", "G1", "BBC", "CNN", "Reuters", "Associated Press", "AP News", "Deutsche Welle", "DW", "France 24", "Euronews", "ONU News", "Valor Econ\xF4mico", "Estad\xE3o", "O Globo", "UOL", "Folha de S.Paulo", "C\xE2mara dos Deputados", "O Popular", "Mais Goi\xE1s", "Ag\xEAncia Cora", "Governo de Goi\xE1s", "Prefeitura de Goi\xE2nia", "Jornal Op\xE7\xE3o", "TV Anhanguera", "A Reda\xE7\xE3o"];
var IMPORTANT_NEWS = /urgente|alerta|emergência|emergencia|ataque|guerra|conflito|morte|mortes|desastre|enchente|incêndio|incendio|terremoto|furacão|acidente|crise|eleição|eleicao|presidente|governador|prefeito|congresso|supremo|stf|decisão|decisao|lei|economia|juros|inflação|inflacao|dólar|dolar|emprego|saúde|saude|vacina|epidemia|pandemia|segurança|seguranca|operação|operacao|prisão|prisao|goiânia|goiania|goiás|goias/i;
var HIGH_TRUST_NEWS = /reuters|associated press|ap news|bbc|agência brasil|agencia brasil|g1|onu news|deutsche welle|dw|france 24|euronews/i;
function tag(item, names) {
  for (const name of names) {
    const found = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (found?.[1]) return xml(found[1]);
  }
  return "";
}
function newsCategory(title) {
  const value = title.toLowerCase();
  if (/econom|mercado|emprego|infla|dólar|dolar|empresa|negócio/.test(value)) return "Economia";
  if (/tecnolog|inteligência artificial|software|digital|internet|celular/.test(value)) return "Tecnologia";
  if (/saúde|saude|vacina|hospital|doença/.test(value)) return "Sa\xFAde";
  if (/esporte|futebol|copa|campeonato|olimp/.test(value)) return "Esportes";
  if (/governo|congresso|senado|câmara|politic|eleiç/.test(value)) return "Brasil";
  return "Atualidade";
}
function parseFeed(source, defaultSource, fallbackLink, scope = "") {
  const blocks = [...source.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.slice(0, 20).map((match, index2) => {
    const item = match[1];
    let title = tag(item, ["title"]);
    let sourceName = tag(item, ["source"]) || defaultSource;
    if (defaultSource.startsWith("Google Not\xEDcias") && title.includes(" - ")) {
      const parts = title.split(" - ");
      const candidate = parts.pop()?.trim() || "";
      if (candidate) sourceName = candidate;
      title = parts.join(" - ").trim();
      if (!TRUSTED_NEWS.some((trusted) => sourceName.toLowerCase().includes(trusted.toLowerCase()))) return null;
    }
    const atomLink = item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    const link = tag(item, ["link", "guid"]) || atomLink || fallbackLink;
    const publishedAt = tag(item, ["pubDate", "published", "updated", "dc:date"]);
    if (!title || !/^https?:\/\//i.test(link)) return null;
    return { id: `${defaultSource}-${index2}-${title.slice(0, 30)}`, title, link, publishedAt, source: sourceName, category: scope || newsCategory(title) };
  }).filter((item) => Boolean(item));
}
function rankedNews(item, now) {
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published)) return null;
  const ageHours = (now - published) / 36e5;
  if (ageHours < -1 || ageHours > 24) return null;
  const important = IMPORTANT_NEWS.test(item.title);
  if (ageHours > 30 && !important) return null;
  const freshnessPoints = Math.max(0, 48 - ageHours) * 1.35;
  const sourcePoints = HIGH_TRUST_NEWS.test(item.source) ? 14 : 8;
  const impactPoints = important ? 18 : 0;
  const localPoints = item.category === "Goi\xE1s" ? 12 : item.category === "Mundo" ? 8 : 3;
  const importance = Math.round(Math.min(100, freshnessPoints + sourcePoints + impactPoints + localPoints));
  const freshness = ageHours <= 1 ? "Agora" : ageHours <= 6 ? "\xDAltimas horas" : ageHours <= 24 ? "Hoje" : `${Math.max(1, Math.round(ageHours))}h atr\xE1s`;
  return { ...item, publishedAt: new Date(published).toISOString(), importance, freshness };
}
async function latestNews() {
  const feeds = [
    { source: "G1 Goi\xE1s", url: "https://g1.globo.com/rss/g1/goias/", home: "https://g1.globo.com/go/goias/", scope: "Goi\xE1s" },
    { source: "Ag\xEAncia Cora", url: "https://agenciacoradenoticias.go.gov.br/feed/", home: "https://agenciacoradenoticias.go.gov.br/", scope: "Goi\xE1s" },
    { source: "Google Not\xEDcias \u2014 Goi\xE2nia", url: `https://news.google.com/rss/search?q=${encodeURIComponent("Goi\xE2nia OR Goi\xE1s when:1d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, home: "https://news.google.com/", scope: "Goi\xE1s" },
    { source: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", home: "https://www.bbc.com/portuguese", scope: "Mundo" },
    { source: "Google Not\xEDcias \u2014 Mundo", url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-419", home: "https://news.google.com/", scope: "Mundo" },
    { source: "Google Not\xEDcias \u2014 Internacional", url: `https://news.google.com/rss/search?q=${encodeURIComponent("mundo OR internacional when:1d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, home: "https://news.google.com/", scope: "Mundo" },
    { source: "Ag\xEAncia Brasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", home: "https://agenciabrasil.ebc.com.br/", scope: "Brasil" }
  ];
  const responses = await Promise.allSettled(feeds.map(async (feed) => {
    const response = await fetch(feed.url, { headers: { "user-agent": "GWL-Nexo/2.0 (+news-reader)" }, signal: AbortSignal.timeout(12e3) });
    if (!response.ok) throw new Error(`feed ${feed.source} unavailable`);
    return parseFeed(await response.text(), feed.source, feed.home, feed.scope);
  }));
  const now = Date.now();
  const seen = /* @__PURE__ */ new Set();
  const clean2 = responses.flatMap((result) => result.status === "fulfilled" ? result.value : []).map((item) => rankedNews(item, now)).filter((item) => Boolean(item)).filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç ]/gi, "").slice(0, 90);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.importance - a.importance || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const goias = clean2.filter((item) => item.category === "Goi\xE1s").slice(0, 8);
  const world = clean2.filter((item) => item.category === "Mundo").slice(0, 8);
  const brasil = clean2.filter((item) => item.category === "Brasil").slice(0, 4);
  return [...goias, ...world, ...brasil].sort((a, b) => (b.importance || 0) - (a.importance || 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 20);
}
function absoluteUrl(value, base) {
  try {
    return new URL(String(value || ""), base).toString();
  } catch {
    return "";
  }
}
function jsonLdProducts(html, base, store) {
  const results = [];
  for (const match of html.slice(0, 3e6).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1].replace(/&quot;/g, '"'));
      const queue = Array.isArray(data) ? [...data] : [data];
      while (queue.length && results.length < 30) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement.map((entry) => entry.item || entry));
        if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
        if (node["@type"] === "Product" || node.name && (node.offers || node.price)) {
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const price = Number(offers?.price || offers?.lowPrice || node.price || 0);
          const aggregate = node.aggregateRating;
          const rating = Number(aggregate?.ratingValue || 0);
          const reviewCount = Number(aggregate?.reviewCount || aggregate?.ratingCount || 0);
          const image = Array.isArray(node.image) ? node.image[0] : node.image;
          const link = absoluteUrl(node.url || offers?.url, base);
          if (node.name && link) results.push({ id: `${store}-${results.length}-${String(node.name).slice(0, 30)}`, title: node.name, price, currency: offers?.priceCurrency || "BRL", link, image: absoluteUrl(image, base), store, condition: "Novo", rating, reviewCount, sellerPositive: 0, soldQuantity: 0, freeShipping: false, relevance: Math.max(0.5, 1 - results.length / 36) });
        }
      }
    } catch {
    }
  }
  return results;
}
function magaluProducts(html, base) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const match = html.slice(0, 3e6).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root2 = JSON.parse(match[1]);
    const queue = [root2];
    while (queue.length && results.length < 40) {
      const value = queue.shift();
      if (Array.isArray(value)) {
        queue.push(...value);
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const node = value;
      if (node.type === "product" && node.title && node.path) {
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const fallbackOffer = Array.isArray(node.itemFallback?.offers) ? node.itemFallback.offers[0] : null;
        const selected = offer || fallbackOffer || {};
        const bestPrice = Number(selected.bestPrice?.totalAmount || selected.price || 0);
        const regularPrice = Number(selected.price || selected.listPrice || bestPrice || 0);
        const link = absoluteUrl(node.path, base);
        const key = `${node.id || link}`;
        if (link && !seen.has(key)) {
          seen.add(key);
          results.push({
            id: `magalu-${node.id || results.length}`,
            title: node.title,
            price: bestPrice || regularPrice,
            originalPrice: Number(selected.listPrice || regularPrice || 0),
            currency: selected.currency || "BRL",
            link,
            image: absoluteUrl(String(node.image || "").replace("{w}x{h}", "320x320"), base),
            store: "Magazine Luiza",
            condition: "Novo",
            rating: Number(node.reviewRating || 0),
            reviewCount: Number(node.reviewCount || 0),
            sellerPositive: 0,
            sellerStatus: node.tags?.includes?.("is_magalu_indica") ? "Magalu Indica" : "",
            soldQuantity: 0,
            freeShipping: Number(node.shippingTag?.cost) === 0,
            officialStore: false,
            relevance: Math.max(0.55, 1 - results.length / 55)
          });
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
  } catch {
  }
  return results;
}
function kabumProducts(html, base) {
  const results = [];
  const match = html.slice(0, 3e6).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root2 = JSON.parse(match[1]);
    const products = root2?.props?.pageProps?.data?.catalogServer?.data;
    if (!Array.isArray(products)) return results;
    for (const [index2, node] of products.slice(0, 60).entries()) {
      const price = Number(node.priceWithDiscount || node.price || 0);
      const link = absoluteUrl(`/produto/${node.code}/${node.friendlyName || "produto"}`, base);
      results.push({
        id: `kabum-${node.code || index2}`,
        title: node.name,
        price,
        originalPrice: Number(node.oldPrice || node.price || price || 0),
        currency: "BRL",
        link,
        image: absoluteUrl(node.image || node.images?.[0], base),
        store: "KaBuM!",
        condition: "Novo",
        rating: Number(node.rating || node.ratingValue || 0),
        reviewCount: Number(node.ratingCount || node.reviewCount || 0),
        sellerPositive: 0,
        sellerStatus: node.sellerName || "KaBuM!",
        soldQuantity: Number(node.quantitySold || 0),
        freeShipping: Boolean(node.freeShipping),
        officialStore: !node.sellerName,
        relevance: Math.max(0.5, 1 - index2 / 72)
      });
    }
  } catch {
  }
  return results;
}
function comparisonProducts(html, base, comparisonSource) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const match = html.slice(0, 3e6).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root2 = JSON.parse(match[1]);
    const queue = [root2];
    while (queue.length && results.length < 45) {
      const value = queue.shift();
      if (Array.isArray(value)) {
        queue.push(...value);
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const node = value;
      if (node.type === "product" && node.name && node.url && Number(node.price) > 0) {
        const key = String(node.objectId || node.sourceId || node.url);
        if (!seen.has(key)) {
          seen.add(key);
          const availableStores = Array.isArray(node.merchants) ? [...new Set(node.merchants.map((merchant) => String(merchant?.name || "")).filter(Boolean))] : [];
          const store = String(node.bestOffer?.merchantName || availableStores[0] || comparisonSource);
          results.push({
            id: `${comparisonSource.toLowerCase()}-${key}`,
            title: node.shortName || node.name,
            price: Number(node.price),
            originalPrice: 0,
            currency: "BRL",
            link: absoluteUrl(node.url, base),
            image: absoluteUrl(node.image, base),
            store,
            condition: "Novo",
            rating: Number(node.preciseRating || node.rating || 0),
            reviewCount: Number(node.countOfComments || node.ratingTotal || 0),
            sellerPositive: 0,
            sellerStatus: `${Number(node.storeCount || availableStores.length || 1)} loja(s) comparada(s)`,
            soldQuantity: Number(node.popularityScore || 0),
            freeShipping: false,
            officialStore: false,
            relevance: Math.max(0.5, 1 - Number(node.position || results.length) / 48),
            comparisonSource,
            availableStores
          });
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
  } catch {
  }
  return results;
}
async function storeProducts(url, store) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16e3);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        "cache-control": "no-cache"
      },
      signal: controller.signal
    });
    if (!response.ok) return { items: [], status: `HTTP ${response.status}` };
    const html = await response.text();
    const structured = jsonLdProducts(html, url, store);
    const catalog = store === "Magazine Luiza" ? magaluProducts(html, url) : store === "KaBuM!" ? kabumProducts(html, url) : store === "Buscap\xE9" || store === "Zoom" ? comparisonProducts(html, url, store) : [];
    const items = [...catalog, ...structured];
    return { items, status: items.length ? "ok" : "sem cat\xE1logo" };
  } catch (error) {
    return { items: [], status: error instanceof Error && error.name === "AbortError" ? "tempo esgotado" : "indispon\xEDvel" };
  } finally {
    clearTimeout(timeout);
  }
}
async function marketplaceJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);
  try {
    const response = await fetch(url, { headers: { "user-agent": "GWL-Nexo/2.0" }, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function marketplaceSignals(item, index2, total) {
  const sellerId = Number(item.seller?.id || item.seller_id || 0);
  const [reviews, seller] = await Promise.all([
    marketplaceJson(`https://api.mercadolibre.com/reviews/item/${encodeURIComponent(String(item.id || ""))}`),
    sellerId ? marketplaceJson(`https://api.mercadolibre.com/users/${sellerId}`) : Promise.resolve(null)
  ]);
  const reputation = seller?.seller_reputation || {};
  const ratings = reputation.transactions?.ratings || {};
  return {
    rating: Number(reviews?.rating_average || 0),
    reviewCount: Number(reviews?.paging?.total || 0),
    sellerPositive: Number(ratings.positive || 0),
    sellerStatus: reputation.power_seller_status || reputation.level_id || "",
    soldQuantity: Number(item.sold_quantity || 0),
    officialStore: Boolean(item.official_store_id),
    relevance: Math.max(0, 1 - index2 / Math.max(total, 1))
  };
}
function rankProducts(products, query) {
  const terms = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((term) => term.length > 2);
  const seen = /* @__PURE__ */ new Set();
  const valid = products.filter((item) => {
    if (!item.title || !item.link || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0 || !item.image) return false;
    const title = String(item.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const synonyms = { fone: /fone|headset|headphone|earbud/, computador: /computador|desktop|mini pc|pc gamer/, notebook: /notebook|laptop/, celular: /celular|smartphone|iphone/, geladeira: /geladeira|refrigerador/ };
    if (terms.length && !terms.filter((t) => !["para", "com", "sem", "melhor", "barato"].includes(t)).every((term) => synonyms[term] ? synonyms[term].test(title) : title.includes(term))) return false;
    if (/geladeira|refrigerador|lavadora|aspirador/.test(query.toLowerCase()) && !/peca|peça|motor|filtro|refil|acessorio|acessório|kit/.test(query.toLowerCase()) && /motoventilador|prateleira|refil|filtro|gaveta|borracha|puxador|placa |kit |peça|sensor|termostato|dobradiça/.test(title)) return false;
    if (title.trim() === query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() || title.length < 12) return false;
    try {
      const parsed = new URL(String(item.link));
      const direct = /mercadolivre\.com\.br\/.+-MLB-|magazineluiza\.com\.br\/.+\/p\/|kabum\.com\.br\/produto\/|buscape\.com\.br\/(?!search)|zoom\.com\.br\/(?!search)|shopee\.com\.br\/(?:product\/|.+-i\.\d+\.\d+)|shein\.com\/.+-p-\d+\.html|olx\.com\.br\/.+\/d\/anuncio\/|facebook\.com\/marketplace\/item\//i.test(parsed.toString());
      if (!direct && !["site.fastshop.com.br", "loja.electrolux.com.br"].includes(parsed.hostname)) return false;
    } catch {
      return false;
    }
    const key = item.comparisonSource ? "comparison:" + title.replace(/[^a-z0-9]/g, "") : String(item.store) + ":" + String(item.link).split("?")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const prices = valid.map((item) => Number(item.price)).filter(Boolean);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const minPrice = sortedPrices[0] || 0;
  const lowReference = sortedPrices[Math.floor((sortedPrices.length - 1) * 0.1)] || minPrice;
  const highReference = sortedPrices[Math.floor((sortedPrices.length - 1) * 0.9)] || lowReference || 1;
  const maxReviews = Math.max(...valid.map((item) => Number(item.reviewCount || 0)), 1);
  const maxSales = Math.max(...valid.map((item) => Number(item.soldQuantity || 0)), 1);
  const ranked = valid.map((item) => {
    const ratingScore = item.rating ? Number(item.rating) / 5 : 0;
    const reviewsScore = Math.log1p(Number(item.reviewCount || 0)) / Math.log1p(maxReviews);
    const sellerScore = Number(item.sellerPositive || 0);
    const price = Number(item.price);
    const priceScore = price ? 1 - Math.min(1, Math.max(0, (Math.log(price) - Math.log(Math.max(lowReference, 1))) / Math.max(Math.log(Math.max(highReference, 2)) - Math.log(Math.max(lowReference, 1)), 0.01))) : 0;
    const title = String(item.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const textScore = terms.length ? terms.filter((term) => title.includes(term)).length / terms.length : 0.5;
    const salesScore = Math.log1p(Number(item.soldQuantity || 0)) / Math.log1p(maxSales);
    const score = ratingScore * 24 + reviewsScore * 10 + sellerScore * 13 + Number(item.relevance || 0) * 11 + textScore * 17 + priceScore * 16 + salesScore * 3 + (item.freeShipping ? 3 : 0) + (item.officialStore ? 3 : 0);
    const savingsPercent = Number(item.originalPrice) > price ? Math.round((1 - price / Number(item.originalPrice)) * 100) : 0;
    return { ...item, score: Math.min(99, Math.round(score)), savingsPercent };
  }).sort((a, b) => b.score - a.score).slice(0, 60);
  const cheapestId = [...ranked].sort((a, b) => Number(a.price) - Number(b.price))[0]?.id;
  const bestRatedId = [...ranked].filter((item) => item.rating >= 4 && item.reviewCount >= 3).sort((a, b) => Number(b.rating) - Number(a.rating) || Number(b.reviewCount) - Number(a.reviewCount))[0]?.id;
  return ranked.map((item, index2) => ({ ...item, badge: index2 === 0 ? "Melhor custo-benef\xEDcio" : item.id === cheapestId ? "Menor pre\xE7o" : item.id === bestRatedId ? "Melhor avaliado" : item.savingsPercent >= 10 ? `${item.savingsPercent}% de desconto` : item.freeShipping ? "Frete gr\xE1tis" : "Oferta recomendada" }));
}
async function productSearch(query, page = 0) {
  if (fashionIntent(query).fashion) return searchFashion(query, page);
  const encoded = encodeURIComponent(query);
  const searchPages = [
    { name: "Buscap\xE9", url: `https://www.buscape.com.br/search?q=${encoded}&page=${page + 1}` },
    { name: "Zoom", url: `https://www.zoom.com.br/search?q=${encoded}&page=${page + 1}` },
    { name: "KaBuM!", url: `https://www.kabum.com.br/busca/${encoded}?page_number=${page + 1}&page_size=60` }
  ];
  const extraPending = Promise.all(searchPages.map((shop) => storeProducts(shop.url, shop.name)));
  const catalogStores = [{ name: "Fast Shop", host: "site.fastshop.com.br" }, { name: "Electrolux", host: "loja.electrolux.com.br" }];
  const directPending = Promise.all(catalogStores.map(async (store) => {
    try {
      const response = await fetch(`https://${store.host}/api/catalog_system/pub/products/search?ft=${encoded}&_from=${page * 24}&_to=${page * 24 + 23}`, { signal: AbortSignal.timeout(18e3), headers: { accept: "application/json" } });
      return { name: store.name, items: response.ok ? parseFashionCatalog(await response.json(), store) : [] };
    } catch {
      return { name: store.name, items: [] };
    }
  }));
  let results = [];
  try {
    const data = await marketplaceJson(`https://api.mercadolibre.com/sites/MLB/search?q=${encoded}&limit=18&offset=${page * 18}`);
    if (data) {
      const source = (data.results || []).slice(0, 18);
      const signals = await Promise.all(source.map((item, index2) => marketplaceSignals(item, index2, source.length)));
      results = source.map((item, index2) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency_id || "BRL",
        link: item.permalink,
        image: item.thumbnail,
        store: "Mercado Livre",
        condition: item.condition === "new" ? "Novo" : "Usado",
        originalPrice: item.original_price,
        freeShipping: item.shipping?.free_shipping || false,
        ...signals[index2]
      }));
    }
  } catch {
  }
  const marketplaceCount = results.length;
  const [extra, directCatalogs] = await Promise.all([extraPending, directPending]);
  const catalogItems = [...extra.flatMap((result) => result.items), ...directCatalogs.flatMap((result) => result.items)];
  const inspectedCount = results.length + catalogItems.length;
  results = rankProducts([...results, ...catalogItems], query);
  const sourceMap = /* @__PURE__ */ new Map();
  searchPages.forEach((shop, index2) => {
    const current2 = sourceMap.get(shop.name) || { name: shop.name, found: 0, status: "indispon\xEDvel" };
    current2.found += extra[index2].items.length;
    if (extra[index2].status === "ok") current2.status = "consultada";
    else if (current2.status !== "consultada") current2.status = extra[index2].status;
    sourceMap.set(shop.name, current2);
  });
  directCatalogs.forEach((shop) => sourceMap.set(shop.name, { name: shop.name, found: shop.items.length, status: shop.items.length ? "consultada" : "Cat\xE1logo indispon\xEDvel ou sem estoque" }));
  const mercadoSource = sourceMap.get("Mercado Livre") || { name: "Mercado Livre", found: 0, status: "indispon\xEDvel" };
  mercadoSource.found += marketplaceCount;
  if (marketplaceCount) mercadoSource.status = "consultada";
  sourceMap.set("Mercado Livre", mercadoSource);
  const retailerCounts = /* @__PURE__ */ new Map();
  for (const item of results) {
    const names = Array.isArray(item.availableStores) && item.availableStores.length ? item.availableStores : [item.store];
    for (const name of names) retailerCounts.set(String(name), (retailerCounts.get(String(name)) || 0) + 1);
  }
  if (marketplaceCount) retailerCounts.set("Mercado Livre", marketplaceCount);
  const retailers = [...retailerCounts.entries()].map(([name, found]) => ({ name, found })).sort((a, b) => b.found - a.found || a.name.localeCompare(b.name)).slice(0, 14);
  const stores = [
    { name: "Mercado Livre", url: `https://lista.mercadolivre.com.br/${encoded}`, color: "#ffe600" },
    { name: "Amazon Brasil", url: `https://www.amazon.com.br/s?k=${encoded}`, color: "#ff9900" },
    { name: "Magazine Luiza", url: `https://www.magazineluiza.com.br/busca/${encoded}/`, color: "#0086ff" },
    { name: "Casas Bahia", url: `https://www.casasbahia.com.br/${encoded}/b`, color: "#e31b36" },
    { name: "Shopee", url: `https://shopee.com.br/search?keyword=${encoded}`, color: "#ee4d2d" },
    { name: "SHEIN", url: `https://br.shein.com/pdsearch/${encoded}/`, color: "#111111" },
    { name: "OLX", url: `https://www.olx.com.br/brasil?q=${encoded}`, color: "#6e0ad6" },
    { name: "Facebook Marketplace", url: `https://www.facebook.com/marketplace/search/?query=${encoded}`, color: "#1877f2" }
  ];
  return {
    results,
    page,
    hasMore: page < 9 && results.length > 0,
    inspectedCount,
    sources: [...sourceMap.values()].map((source) => ({ ...source, found: results.filter((item) => item.store === source.name).length, status: source.found && !results.some((item) => item.store === source.name) ? "Sem an\xFAncios compat\xEDveis" : source.status })),
    retailers,
    criteria: ["Relev\xE2ncia", "Pre\xE7o", "Avalia\xE7\xE3o", "Reputa\xE7\xE3o do vendedor", "Volume de vendas", "Frete"],
    ads: stores.map((store) => ({ ...store, title: `Ofertas de ${query}`, subtitle: `Veja an\xFAncios e condi\xE7\xF5es atuais na ${store.name}` })),
    stores,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function publicContent(request, key, seconds, get) {
  let cache;
  let cacheKey;
  try {
    cache = globalThis.caches?.default;
    cacheKey = new Request(new URL("/__planner_public_cache/v75/" + encodeURIComponent(key), request.url));
    const cached = await cache?.match(cacheKey);
    if (cached?.ok) {
      const data2 = await cached.json();
      if (Array.isArray(data2?.news) || Array.isArray(data2?.results)) {
        return Response.json(data2, { headers: { "cache-control": "private, max-age=30" } });
      }
    }
  } catch {
    cache = void 0;
  }
  const data = await get();
  if ((data.news?.length || data.results?.length) && cache && cacheKey) {
    try {
      await cache.put(cacheKey, Response.json(data, { headers: { "cache-control": `public, max-age=${seconds}` } }));
    } catch {
    }
  }
  return Response.json(data, { headers: { "cache-control": "private, max-age=30" } });
}
async function GET5(request) {
  try {
    const { db, bucket: bucket2 } = await resources();
    const user = await current(request, db);
    if (!user) return bad4("Entre no GWL Planner para continuar.", 401);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "bootstrap";
    if (action === "news") return await publicContent(request, "news", 120, async () => ({ news: await latestNews(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }));
    if (action === "products") {
      const query = text3(url.searchParams.get("q"), 140);
      if (!query) return bad4("Digite o produto que deseja pesquisar.");
      const page = Math.max(0, Math.min(9, Number(url.searchParams.get("page")) || 0));
      return await publicContent(request, `products:${query.toLowerCase()}:${page}`, 180, () => productSearch(query, page));
    }
    if (action === "sync") {
      const [threads2, unread2, tasks2] = await Promise.all([
        db.prepare("SELECT DISTINCT t.* FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.kind='general' OR t.created_by=? OR m.member_email=? ORDER BY t.created_at DESC").bind(user.email, user.email).all(),
        db.prepare("SELECT t.id AS thread_id,COUNT(msg.id) AS unread_count FROM planner_threads t JOIN planner_messages msg ON msg.thread_id=t.id LEFT JOIN planner_thread_reads r ON r.thread_id=t.id AND r.member_email=? WHERE (t.kind='general' OR t.created_by=? OR EXISTS (SELECT 1 FROM planner_thread_members m WHERE m.thread_id=t.id AND m.member_email=?)) AND msg.id>COALESCE(r.last_read_message_id,0) AND msg.sender_email<>? GROUP BY t.id").bind(user.email, user.email, user.email, user.email).all(),
        visibleTasks(db, user.email)
      ]);
      return Response.json({ threads: threads2.results || [], unread: unread2.results || [], tasks: tasks2.results || [], user }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "messages") {
      const threadId = text3(url.searchParams.get("thread"), 80);
      const allowed = await db.prepare("SELECT t.id FROM planner_threads t WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR EXISTS (SELECT 1 FROM planner_thread_members m WHERE m.thread_id=t.id AND m.member_email=?))").bind(threadId, user.email, user.email).first();
      if (!allowed) return bad4("Voc\xEA n\xE3o participa desta conversa.", 403);
      const before = Math.max(0, Number(url.searchParams.get("before")) || 0);
      const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
      const rows = await db.prepare("SELECT * FROM planner_messages WHERE thread_id=? AND id>? AND id<? ORDER BY id " + (after ? "ASC" : "DESC") + " LIMIT 61").bind(threadId, after, before || Number.MAX_SAFE_INTEGER).all();
      const batch = (rows.results || []).slice(0, 60).sort((a, b) => a.id - b.id);
      const ids = batch.map((m) => Number(m.id));
      const attachments2 = await db.prepare("SELECT a.id,a.message_id,a.file_name,a.content_type,a.size FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id WHERE msg.thread_id=? AND (msg.id IN (SELECT id FROM planner_messages WHERE thread_id=? ORDER BY id DESC LIMIT 60)" + (ids.length ? " OR msg.id IN (" + ids.map(() => "?").join(",") + ")" : "") + ")").bind(threadId, threadId, ...ids).all();
      return Response.json({ messages: batch, attachments: attachments2.results || [], hasMore: (rows.results || []).length > 60 }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "document") {
      const id = Number(url.searchParams.get("id"));
      const doc = await db.prepare("SELECT * FROM planner_documents WHERE id=? AND owner_email=?").bind(id, user.email).first();
      if (!doc) return bad4("Documento n\xE3o encontrado.", 404);
      const object = await bucket2.get(String(doc.object_key));
      if (!object) return bad4("Arquivo n\xE3o encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": String(doc.content_type || object.httpMetadata?.contentType || "application/octet-stream"), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(doc.file_name))}` } });
    }
    if (action === "message.attachment") {
      const id = Number(url.searchParams.get("id"));
      const attachment = await db.prepare("SELECT a.* FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id JOIN planner_threads t ON t.id=msg.thread_id LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND m.member_email=? WHERE a.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1").bind(user.email, id, user.email, user.email).first();
      if (!attachment) return bad4("Anexo n\xE3o encontrado ou sem permiss\xE3o.", 404);
      const object = await bucket2.get(String(attachment.object_key));
      if (!object) return bad4("Arquivo n\xE3o encontrado.", 404);
      const contentType = String(attachment.content_type || object.httpMetadata?.contentType || "application/octet-stream");
      const disposition = contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment";
      return new Response(object.body, { headers: {
        "content-type": contentType,
        "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(String(attachment.file_name))}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff"
      } });
    }
    await ensureGeneral(db);
    const [profiles, tasks, events, threads, messages, attachments, documents, links, boards, unread] = await Promise.all([
      db.prepare("SELECT email,name,role,planner_role,employee_id,site_id FROM ponto_access_profiles WHERE status='active' ORDER BY name").all(),
      visibleTasks(db, user.email),
      db.prepare("SELECT * FROM planner_events WHERE owner_email=? ORDER BY event_date,event_time").bind(user.email).all(),
      db.prepare("SELECT DISTINCT t.* FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.kind='general' OR t.created_by=? OR m.member_email=? ORDER BY t.created_at DESC").bind(user.email, user.email).all(),
      db.prepare("SELECT * FROM planner_messages WHERE thread_id IN (SELECT id FROM planner_threads WHERE kind='general' OR created_by=? OR id IN (SELECT thread_id FROM planner_thread_members WHERE member_email=?)) ORDER BY id DESC LIMIT 40").bind(user.email, user.email).all(),
      db.prepare("SELECT a.* FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id WHERE msg.thread_id IN (SELECT id FROM planner_threads WHERE kind='general' OR created_by=? OR id IN (SELECT thread_id FROM planner_thread_members WHERE member_email=?)) ORDER BY a.id DESC LIMIT 40").bind(user.email, user.email).all(),
      db.prepare("SELECT * FROM planner_documents WHERE owner_email=? ORDER BY updated_at DESC").bind(user.email).all(),
      db.prepare("SELECT * FROM planner_links WHERE owner_email=? ORDER BY created_at DESC").bind(user.email).all(),
      db.prepare("SELECT * FROM planner_boards WHERE owner_email=? OR allowed_emails LIKE ? ORDER BY CASE WHEN owner_email=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 100").bind(user.email, `%"${user.email}"%`, user.email).all(),
      db.prepare("SELECT t.id AS thread_id,COUNT(msg.id) AS unread_count FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND lower(m.member_email)=lower(?) JOIN planner_messages msg ON msg.thread_id=t.id LEFT JOIN planner_thread_reads r ON r.thread_id=t.id AND lower(r.member_email)=lower(?) WHERE (t.kind='general' OR lower(t.created_by)=lower(?) OR m.member_email IS NOT NULL) AND msg.id>COALESCE(r.last_read_message_id,0) AND lower(msg.sender_email)<>lower(?) GROUP BY t.id").bind(user.email, user.email, user.email, user.email).all()
    ]);
    const visibleBoards = boards.results || [];
    return Response.json({ user, profiles: profiles.results || [], tasks: tasks.results || [], events: events.results || [], threads: threads.results || [], messages: (messages.results || []).reverse(), attachments: attachments.results || [], documents: documents.results || [], links: links.results || [], boards: visibleBoards, board: visibleBoards[0] || null, unread: unread.results || [] });
  } catch (error) {
    return bad4(error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel carregar o GWL Planner.", 500);
  }
}
async function POST5(request) {
  try {
    const { db, bucket: bucket2 } = await resources();
    const user = await current(request, db);
    if (!user) return bad4("Sua sess\xE3o expirou. Entre novamente.", 401);
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const formAction = String(form.get("action") || "");
      if (formAction === "message.send") {
        const threadId = text3(form.get("threadId"), 80);
        const message = text3(form.get("message"), 5e3);
        const files = form.getAll("files").filter((value) => value instanceof File && value.size > 0).slice(0, 5);
        if (!threadId || !message && !files.length) return bad4("Digite uma mensagem ou selecione um arquivo.");
        if (form.getAll("files").length > 5) return bad4("Envie no m\xE1ximo cinco arquivos por mensagem.");
        if (files.some((file2) => file2.size > 10 * 1024 * 1024)) return bad4("Cada arquivo deve ter no m\xE1ximo 10 MB.");
        if (files.reduce((sum, file2) => sum + file2.size, 0) > 25 * 1024 * 1024) return bad4("Os anexos da mensagem devem somar no m\xE1ximo 25 MB.");
        if (files.some((file2) => !allowedMessengerFile(file2))) return bad4("Formato n\xE3o permitido. Use imagens, PDF, texto, ZIP ou arquivos do Word, Excel e PowerPoint.");
        const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1").bind(threadId, user.email, user.email).first();
        if (!allowed) return bad4("Voc\xEA n\xE3o participa desta conversa.", 403);
        const result2 = await db.prepare("INSERT INTO planner_messages (thread_id,sender_email,sender_name,body) VALUES (?,?,?,?)").bind(threadId, user.email, user.name, message).run();
        const messageId = Number(result2.meta?.last_row_id);
        const uploaded = [];
        try {
          for (const file2 of files) {
            const key2 = `planner/messenger/${threadId}/${messageId}/${crypto.randomUUID()}`;
            await bucket2.put(key2, await file2.arrayBuffer(), { httpMetadata: { contentType: file2.type || "application/octet-stream" } });
            uploaded.push(key2);
            await db.prepare("INSERT INTO planner_message_attachments (message_id,file_name,object_key,content_type,size) VALUES (?,?,?,?,?)").bind(messageId, file2.name.slice(0, 240), key2, file2.type || "application/octet-stream", file2.size).run();
          }
        } catch (error) {
          await Promise.allSettled(uploaded.map((key2) => bucket2.delete(key2)));
          await db.prepare("DELETE FROM planner_messages WHERE id=? AND sender_email=?").bind(messageId, user.email).run();
          throw error;
        }
        return Response.json({ ok: true, id: messageId, attachments: files.length });
      }
      if (formAction !== "document.upload") return bad4("A\xE7\xE3o inv\xE1lida.");
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) return bad4("Selecione um arquivo.");
      if (file.size > 25 * 1024 * 1024) return bad4("O arquivo deve ter no m\xE1ximo 25 MB.");
      const key = `planner/${user.email}/${crypto.randomUUID()}`;
      await bucket2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      const result = await db.prepare("INSERT INTO planner_documents (owner_email,file_name,object_key,content_type,size) VALUES (?,?,?,?,?)").bind(user.email, file.name.slice(0, 240), key, file.type || "application/octet-stream", file.size).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    const body = await request.json();
    const action = text3(body.action, 60);
    if (action.startsWith("task.") || action === "planner.role.update") return await taskAction(db, user, body);
    if (action === "event.create") {
      const title = text3(body.title, 220), date = text3(body.eventDate, 20);
      if (!title || !date) return bad4("Informe o evento e a data.");
      const result = await db.prepare("INSERT INTO planner_events (owner_email,title,event_date,event_time,emoji,color,notes) VALUES (?,?,?,?,?,?,?)").bind(user.email, title, date, text3(body.eventTime, 10), text3(body.emoji, 12) || "\u{1F4CC}", text3(body.color, 20) || "#4f7cff", text3(body.notes)).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "event.delete") {
      await db.prepare("DELETE FROM planner_events WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run();
      return Response.json({ ok: true });
    }
    if (action === "group.create") {
      const title = text3(body.title, 120);
      if (!title) return bad4("Informe o nome do grupo.");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO planner_threads (id,title,kind,created_by) VALUES (?,?, 'group',?)").bind(id, title, user.email).run();
      const members = Array.isArray(body.members) ? body.members.map(cleanEmail2).filter(Boolean).slice(0, 100) : [];
      await db.prepare("INSERT OR IGNORE INTO planner_thread_members (thread_id,member_email) VALUES (?,?)").bind(id, user.email).run();
      for (const member of members) await db.prepare("INSERT OR IGNORE INTO planner_thread_members (thread_id,member_email) VALUES (?,?)").bind(id, member).run();
      return Response.json({ ok: true, id });
    }
    if (action === "message.send") {
      const threadId = text3(body.threadId, 80), message = text3(body.message, 5e3);
      if (!threadId || !message) return bad4("Digite uma mensagem.");
      const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1").bind(threadId, user.email, user.email).first();
      if (!allowed) return bad4("Voc\xEA n\xE3o participa desta conversa.", 403);
      const result = await db.prepare("INSERT INTO planner_messages (thread_id,sender_email,sender_name,body) VALUES (?,?,?,?)").bind(threadId, user.email, user.name, message).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "message.read") {
      const threadId = text3(body.threadId, 80);
      const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND lower(m.member_email)=lower(?) WHERE t.id=? AND (t.kind='general' OR lower(t.created_by)=lower(?) OR m.member_email IS NOT NULL) LIMIT 1").bind(user.email, threadId, user.email).first();
      if (!allowed) return bad4("Voc\xEA n\xE3o participa desta conversa.", 403);
      const last = await db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM planner_messages WHERE thread_id=? AND id<=?").bind(threadId, Math.max(0, Number(body.lastId) || 0)).first();
      await db.prepare("INSERT INTO planner_thread_reads (thread_id,member_email,last_read_message_id,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(thread_id,member_email) DO UPDATE SET last_read_message_id=MAX(planner_thread_reads.last_read_message_id,excluded.last_read_message_id),updated_at=CURRENT_TIMESTAMP").bind(threadId, user.email, Number(last?.id || 0)).run();
      return Response.json({ ok: true });
    }
    if (action === "document.rename") {
      const name = text3(body.fileName, 240);
      if (!name) return bad4("Informe o novo nome.");
      await db.prepare("UPDATE planner_documents SET file_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?").bind(name, Number(body.id), user.email).run();
      return Response.json({ ok: true });
    }
    if (action === "document.delete") {
      const doc = await db.prepare("SELECT object_key FROM planner_documents WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).first();
      if (doc) {
        await bucket2.delete(String(doc.object_key));
        await db.prepare("DELETE FROM planner_documents WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run();
      }
      return Response.json({ ok: true });
    }
    if (action === "board.save") {
      const allowed = Array.isArray(body.allowedEmails) ? body.allowedEmails.map(cleanEmail2).filter(Boolean).slice(0, 200) : [];
      const boardId = text3(body.boardId, 80) || crypto.randomUUID();
      const existing = await db.prepare("SELECT owner_email,allowed_emails FROM planner_boards WHERE id=?").bind(boardId).first();
      let existingAllowed = [];
      try {
        existingAllowed = JSON.parse(String(existing?.allowed_emails || "[]"));
      } catch {
        existingAllowed = [];
      }
      if (existing && existing.owner_email !== user.email && !existingAllowed.includes(user.email)) return bad4("Voc\xEA n\xE3o pode alterar esta lousa.", 403);
      if (!existing) {
        await db.prepare("INSERT INTO planner_boards (id,title,owner_email,allowed_emails,payload,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)").bind(boardId, text3(body.title, 120) || "Minha lousa", user.email, JSON.stringify(allowed), text3(body.payload, 25e4) || "[]").run();
      } else if (existing.owner_email === user.email) {
        await db.prepare("UPDATE planner_boards SET title=?,allowed_emails=?,payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?").bind(text3(body.title, 120) || "Minha lousa", JSON.stringify(allowed), text3(body.payload, 25e4) || "[]", boardId, user.email).run();
      } else {
        await db.prepare("UPDATE planner_boards SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text3(body.payload, 25e4) || "[]", boardId).run();
      }
      return Response.json({ ok: true, id: boardId });
    }
    if (action === "board.delete") {
      const boardId = text3(body.boardId, 80);
      await db.prepare("DELETE FROM planner_boards WHERE id=? AND owner_email=?").bind(boardId, user.email).run();
      return Response.json({ ok: true });
    }
    if (action === "link.create") {
      const title = text3(body.title, 120), url = text3(body.url, 900);
      if (!title || !/^https?:\/\//i.test(url)) return bad4("Informe um nome e um link v\xE1lido come\xE7ando com http.");
      const result = await db.prepare("INSERT INTO planner_links (owner_email,title,url,kind,color) VALUES (?,?,?,?,?)").bind(user.email, title, url, text3(body.kind, 20) || "site", text3(body.color, 20) || "#4f7cff").run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "link.delete") {
      await db.prepare("DELETE FROM planner_links WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run();
      return Response.json({ ok: true });
    }
    return bad4("A\xE7\xE3o n\xE3o reconhecida.");
  } catch (error) {
    return bad4(error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel concluir a opera\xE7\xE3o.", 500);
  }
}

// source/app/api/planner-register/route.ts
var route_exports6 = {};
__export(route_exports6, {
  GET: () => GET6,
  POST: () => POST6
});
async function database4() {
  const { env: env2 } = await Promise.resolve().then(() => (init_mysql_platform(), mysql_platform_exports));
  if (!env2.DB) throw new Error("Banco do GWL Planner indispon\xEDvel.");
  return env2.DB;
}
var bad5 = (message, status = 400) => Response.json({ error: message }, { status });
var cleanEmail3 = (value) => String(value || "").trim().toLowerCase().slice(0, 180);
var CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function randomInt(max) {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return value % max;
}
function captchaCode() {
  return Array.from({ length: 5 }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join("");
}
function captchaSvg(code) {
  const letters = code.split("").map((letter, index2) => {
    const x = 31 + index2 * 34;
    const y = 49 + (randomInt(9) - 4);
    const rotation = randomInt(17) - 8;
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})">${letter}</text>`;
  }).join("");
  const lines = Array.from({ length: 5 }, () => {
    const x1 = randomInt(200);
    const y1 = randomInt(68);
    const x2 = randomInt(200);
    const y2 = randomInt(68);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
  const dots = Array.from(
    { length: 26 },
    () => `<circle cx="${randomInt(200)}" cy="${randomInt(68)}" r="${1 + randomInt(2)}"/>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="68" viewBox="0 0 200 68"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#eef5ff"/><stop offset="1" stop-color="#f7f1ff"/></linearGradient></defs><rect width="200" height="68" rx="12" fill="url(#bg)"/><g stroke="#7389b8" stroke-width="1.3" opacity=".26">${lines}</g><g fill="#4967a5" opacity=".2">${dots}</g><g fill="#15366f" font-family="Arial,sans-serif" font-size="31" font-weight="800" letter-spacing="5">${letters}</g></svg>`;
}
async function requesterHash(request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  const agent = (request.headers.get("user-agent") || "unknown").slice(0, 160);
  return sha256(`${ip}|${agent}`);
}
async function GET6(request) {
  try {
    const user = await getChatGPTUser();
    if (!user?.email) return bad5("Verifique seu e-mail antes de continuar.", 401);
    const db = await database4();
    const owner = await requesterHash(request);
    await db.prepare("DELETE FROM planner_captcha_challenges WHERE expires_at<=CURRENT_TIMESTAMP OR (used=1 AND created_at<datetime('now','-10 minutes'))").run();
    const recent = await db.prepare("SELECT COUNT(*) AS total FROM planner_captcha_challenges WHERE requester_hash=? AND created_at>datetime('now','-10 minutes')").bind(owner).first();
    if (Number(recent?.total || 0) >= 12) return bad5("Muitas atualiza\xE7\xF5es do CAPTCHA. Aguarde alguns minutos.", 429);
    const code = captchaCode();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1e3).toISOString();
    await db.prepare("INSERT INTO planner_captcha_challenges (id,answer_hash,requester_hash,expires_at,used) VALUES (?,?,?,?,0)").bind(id, await sha256(code), owner, expiresAt).run();
    return Response.json(
      { challengeId: id, image: `data:image/svg+xml;base64,${btoa(captchaSvg(code))}`, expiresAt },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return bad5(error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel gerar o CAPTCHA.", 500);
  }
}
async function POST6(request) {
  try {
    const user = await getChatGPTUser();
    if (!user?.email) return bad5("Verifique seu e-mail antes de criar a conta.", 401);
    const body = await request.json();
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const email = cleanEmail3(body.email);
    const verifiedEmail2 = cleanEmail3(user.email);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 30);
    const password = String(body.password || "");
    const confirmation = String(body.confirmPassword || "");
    const challengeId = String(body.challengeId || "").trim();
    const captcha = String(body.captcha || "").trim().toUpperCase();
    const ownerCreatingAccount = verifiedEmail2 === PLATFORM_OWNER_EMAIL;
    if (rawEmail.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return bad5("Informe um endere\xE7o de e-mail v\xE1lido.");
    if (email !== verifiedEmail2 && !ownerCreatingAccount) return bad5("Somente o administrador principal pode cadastrar uma conta para outro e-mail.", 403);
    if (name.length < 3) return bad5("Informe seu nome completo.");
    if (password.length < 10 || password.length > 128) return bad5("A senha deve ter entre 10 e 128 caracteres.");
    if (password !== confirmation) return bad5("A confirma\xE7\xE3o da senha n\xE3o confere.");
    if (phone && !/^\+?[0-9 ()-]{8,24}$/.test(phone)) return bad5("Informe um telefone v\xE1lido ou deixe o campo vazio.");
    if (!challengeId || !captcha) return bad5("Resolva o CAPTCHA para continuar.");
    const db = await database4();
    const challenge = await db.prepare("SELECT * FROM planner_captcha_challenges WHERE id=?").bind(challengeId).first();
    if (!challenge || challenge.used || Date.parse(String(challenge.expires_at)) <= Date.now()) {
      return bad5("O CAPTCHA expirou. Gere uma nova imagem e tente outra vez.");
    }
    await db.prepare("UPDATE planner_captcha_challenges SET used=1 WHERE id=?").bind(challengeId).run();
    const submittedHash = await sha256(captcha);
    if (!constantTimeEqual(submittedHash, String(challenge.answer_hash))) return bad5("O c\xF3digo do CAPTCHA est\xE1 incorreto.");
    const credentialExists = await db.prepare("SELECT c.id FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE lower(c.email)=lower(?) OR lower(p.email)=lower(?)").bind(email, email).first();
    if (credentialExists) return bad5("J\xE1 existe uma conta com este e-mail. Entre com sua senha.", 409);
    let profile2 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(email).first();
    if (!profile2) {
      const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,phone,role,status) VALUES (?,?,?,'Planner','active')").bind(email, name, phone).run();
      profile2 = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(result.meta?.last_row_id).first();
    } else {
      if (profile2.status === "inactive") return bad5("Este perfil est\xE1 inativo. Procure a administra\xE7\xE3o.", 403);
      await db.prepare("UPDATE ponto_access_profiles SET name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, phone, profile2.id).run();
    }
    if (!profile2?.id) return bad5("N\xE3o foi poss\xEDvel criar o perfil.", 500);
    await upsertCredential(db, Number(profile2.id), email, password, false);
    const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?").bind(profile2.id).first();
    if (!credential?.id) return bad5("N\xE3o foi poss\xEDvel criar o acesso.", 500);
    const session = await createPontoSession(db, credential.id, request, false);
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(session.token, session.maxAge) } });
  } catch (error) {
    return bad5(error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel criar a conta.", 500);
  }
}

// runtime/server-entry.mjs
var root = dirname(fileURLToPath(import.meta.url));
var publicDir = resolve(root, "public");
var api = { "/api/contracts": route_exports, "/api/results": route_exports2, "/api/ponto": route_exports3, "/api/ponto-auth": route_exports4, "/api/planner": route_exports5, "/api/planner-register": route_exports6 };
var ownerEmail2 = (process.env.OWNER_EMAIL || "dimivigia@gmail.com").trim().toLowerCase();
var json = (data, status = 200, headers2) => Response.json(data, { status, headers: headers2 });
var publicError = (message, status = 400) => json({ error: message }, status);
var mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".pdf": "application/pdf", ".ico": "image/x-icon", ".wasm": "application/wasm" };
async function profile(identity) {
  if (!identity) return null;
  return env.DB.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?) AND status='active'").bind(identity.email).first();
}
async function installed() {
  const row = await env.DB.prepare("SELECT installed FROM hostinger_install_state WHERE id=1").first();
  return Boolean(row?.installed);
}
async function setup(request) {
  if (!process.env.INSTALL_TOKEN || process.env.INSTALL_TOKEN.length < 32) return publicError("Configure INSTALL_TOKEN com pelo menos 32 caracteres no painel da hospedagem.", 503);
  const body = await request.json();
  if (!constantTimeEqual(String(body.token || ""), process.env.INSTALL_TOKEN)) return publicError("C\xF3digo de instala\xE7\xE3o inv\xE1lido.", 403);
  if (body.password !== body.confirmPassword) return publicError("A confirma\xE7\xE3o da senha n\xE3o confere.");
  const name = String(body.name || "").trim().slice(0, 120);
  if (name.length < 3) return publicError("Informe o nome do administrador.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[state]] = await connection.query("SELECT installed FROM hostinger_install_state WHERE id=1 FOR UPDATE");
    if (!state || state.installed) {
      await connection.rollback();
      return publicError("O primeiro acesso j\xE1 foi configurado.", 409);
    }
    const db = database(connection);
    let saved = await db.prepare("SELECT id FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(ownerEmail2).first();
    if (!saved) {
      const result = await db.prepare("INSERT INTO ponto_access_profiles(email,name,role,planner_role,status) VALUES (?,?,'Administrador','administrador','active')").bind(ownerEmail2, name).run();
      saved = { id: result.meta.last_row_id };
    } else await db.prepare("UPDATE ponto_access_profiles SET name=?,role='Administrador',planner_role='administrador',status='active' WHERE id=?").bind(name, saved.id).run();
    await upsertCredential(db, Number(saved.id), ownerEmail2, String(body.password || ""), false);
    await db.prepare("UPDATE hostinger_install_state SET installed=1 WHERE id=1").run();
    await connection.commit();
    return json({ ok: true, email: ownerEmail2 });
  } catch (error) {
    await connection.rollback();
    return publicError(/senha/i.test(error.message) ? error.message : "N\xE3o foi poss\xEDvel configurar o acesso. Confira o banco de dados.", 400);
  } finally {
    connection.release();
  }
}
var verificationCookie = (token) => `gwl_email_verified=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`;
async function verifiedEmail(request) {
  const token = cookieValue(request, "gwl_email_verified");
  if (!token) return null;
  return env.DB.prepare("SELECT * FROM hostinger_email_verifications WHERE token_hash=? AND confirmed=1 AND used=0 AND expires_at>CURRENT_TIMESTAMP").bind(await sha256(token)).first();
}
async function emailLink(request) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return publicError("O envio de e-mail ainda n\xE3o foi configurado. Procure a administra\xE7\xE3o para cadastrar seu acesso.", 503);
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) return publicError("Informe um e-mail v\xE1lido.");
  const recent = await env.DB.prepare("SELECT count(*) AS total FROM hostinger_email_verifications WHERE email=? AND created_at>DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)").bind(email).first();
  if (Number(recent.total) >= 3) return publicError("Aguarde alguns minutos antes de solicitar outro e-mail.", 429);
  const token = randomBytes(32).toString("hex"), tokenHash = await sha256(token);
  await env.DB.prepare("INSERT INTO hostinger_email_verifications(token_hash,email,expires_at) VALUES (?,?,?)").bind(tokenHash, email, new Date(Date.now() + 30 * 60 * 1e3).toISOString()).run();
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : void 0 });
  const link = new URL("/verificar-email", process.env.APP_URL);
  link.searchParams.set("token", token);
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM, to: email, subject: "Confirme seu e-mail \u2014 GWL NEXO", text: `Acesse este link para confirmar seu e-mail e concluir o cadastro no GWL Planner:

${link.href}

O link expira em 30 minutos.` });
  } catch {
    await env.DB.prepare("DELETE FROM hostinger_email_verifications WHERE token_hash=?").bind(tokenHash).run();
    return publicError("N\xE3o foi poss\xEDvel enviar o e-mail. Confira a configura\xE7\xE3o SMTP.", 503);
  }
  return json({ ok: true });
}
async function handleRequest(request) {
  const url = new URL(request.url);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_URL || request.url).origin) return publicError("Origem da solicita\xE7\xE3o inv\xE1lida.", 403);
  }
  if (url.pathname === "/api/hostinger-status") {
    try {
      return json({ installed: await installed(), ownerEmail: ownerEmail2 });
    } catch {
      return publicError("Configure as vari\xE1veis do banco e importe o arquivo SQL antes do primeiro acesso.", 503);
    }
  }
  if (url.pathname === "/api/hostinger-setup") return request.method === "POST" ? setup(request) : publicError("M\xE9todo n\xE3o permitido.", 405);
  if (url.pathname === "/api/hostinger-email") return request.method === "POST" ? emailLink(request) : publicError("M\xE9todo n\xE3o permitido.", 405);
  if (url.pathname === "/api/hostinger-verification") {
    const verification = await verifiedEmail(request);
    return json({ email: verification?.email || "", ownerEmail: ownerEmail2 });
  }
  if (url.pathname === "/verificar-email") {
    const token = url.searchParams.get("token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return publicError("Link de confirma\xE7\xE3o inv\xE1lido.", 400);
    const result = await env.DB.prepare("UPDATE hostinger_email_verifications SET confirmed=1 WHERE token_hash=? AND used=0 AND expires_at>CURRENT_TIMESTAMP").bind(await sha256(token)).run();
    if (!result.meta.changes) return publicError("Este link expirou ou j\xE1 foi utilizado. Solicite outro e-mail.", 400);
    return new Response(null, { status: 303, headers: { location: "/planner/cadastro", "set-cookie": verificationCookie(token) } });
  }
  if (url.pathname === "/signout-with-chatgpt") {
    await DELETE4(request);
    return new Response(null, { status: 303, headers: { location: "/", "set-cookie": "ponto_dimivig_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } });
  }
  if (url.pathname === "/signin-with-chatgpt") return new Response(null, { status: 303, headers: { location: "/gwl" } });
  const handlers = api[url.pathname];
  if (handlers) {
    const requestHeaders = new Headers(request.headers);
    for (const name of [...requestHeaders.keys()]) if (name.startsWith("oai-")) requestHeaders.delete(name);
    const identity = await credentialIdentity(request, env.DB);
    const userProfile = await profile(identity);
    if (["/api/contracts", "/api/results"].includes(url.pathname) && (!identity || identity.email.toLowerCase() !== ownerEmail2)) return publicError("Entre com o usu\xE1rio administrativo do GWL Flow.", 401);
    const verification = url.pathname === "/api/planner-register" ? await verifiedEmail(request) : null;
    const trustedEmail = identity?.email || verification?.email;
    if (trustedEmail) {
      requestHeaders.set("oai-authenticated-user-email", trustedEmail);
      requestHeaders.set("oai-authenticated-user-full-name", encodeURIComponent(identity?.fullName || trustedEmail));
      requestHeaders.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
    }
    const trustedRequest = new Request(request, { headers: requestHeaders });
    return withRequest(trustedRequest, async () => {
      if (url.pathname === "/api/ponto-auth" && request.method === "POST") {
        const body = await trustedRequest.clone().json();
        if (["bootstrap", "ownerReset"].includes(body.action) && (!identity || identity.email.toLowerCase() !== ownerEmail2)) return publicError("Use a configura\xE7\xE3o de primeiro acesso para ativar o administrador.", 403);
      }
      const handler = handlers[request.method];
      if (!handler) return publicError("M\xE9todo n\xE3o permitido.", 405);
      const response = await handler(trustedRequest);
      if (verification && request.method === "POST" && response.ok) await env.DB.prepare("UPDATE hostinger_email_verifications SET used=1 WHERE token_hash=?").bind(verification.token_hash).run();
      return response;
    });
  }
  if (url.pathname.startsWith("/api/")) return publicError("Recurso n\xE3o encontrado.", 404);
  let file = resolve(publicDir, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(publicDir + "/") && file !== publicDir) return new Response("Not found", { status: 404 });
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    await stat(file);
  } catch {
    file = resolve(publicDir, "index.html");
  }
  const contentType = mime[extname(file)] || "application/octet-stream";
  const immutable = /\/assets\//.test(file) && !file.includes("/ponto-dimivig/");
  return new Response(await readFile(file), { headers: { "content-type": contentType, "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache", "x-content-type-options": "nosniff" } });
}
function createApplication() {
  return http.createServer(async (incoming, outgoing) => {
    try {
      const base = process.env.APP_URL || "http://localhost:3000";
      if (Number(incoming.headers["content-length"] || 0) > 150 * 1024 * 1024) {
        outgoing.writeHead(413, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: "O arquivo excede o limite de 150 MB." }));
        return;
      }
      const init = { method: incoming.method, headers: incoming.headers };
      if (!["GET", "HEAD"].includes(incoming.method)) {
        init.body = Readable.toWeb(incoming);
        init.duplex = "half";
      }
      const response = await handleRequest(new Request(new URL(incoming.url, base), init));
      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) if (name !== "set-cookie") outgoing.setHeader(name, value);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      if (incoming.method === "HEAD" || !response.body) outgoing.end();
      else Readable.fromWeb(response.body).on("error", () => outgoing.destroy()).pipe(outgoing);
    } catch (error) {
      console.error("Falha ao atender solicita\xE7\xE3o:", error.code || error.name);
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: "N\xE3o foi poss\xEDvel concluir a opera\xE7\xE3o. Confira a configura\xE7\xE3o da hospedagem." }));
      } else outgoing.destroy();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.APP_URL) {
    console.error("Configure DB_HOST, DB_NAME, DB_USER, DB_PASSWORD e APP_URL nas vari\xE1veis da aplica\xE7\xE3o.");
    process.exit(1);
  }
  createApplication().listen(Number(process.env.PORT || 3e3), "0.0.0.0", () => console.log("GWL NEXO iniciado."));
}
export {
  createApplication,
  handleRequest,
  pool
};
