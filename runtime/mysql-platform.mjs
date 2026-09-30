import mysql from 'mysql2/promise';
import { createHash, randomUUID } from 'node:crypto';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4', dateStrings: true,
  timezone: 'Z', supportBigNumbers: true, bigNumberStrings: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});
pool.on('connection', connection => connection.query("SET time_zone = '+00:00'"));

export function mysqlSQL(sql) {
  return sql.replace(/"([a-zA-Z_][a-zA-Z_0-9]*)"/g, '`$1`')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO')
    .replace(/datetime\(\s*'now'\s*,\s*'-([0-9]+) minutes'\s*\)/gi, 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL $1 MINUTE)')
    .replace(/MAX\(planner_thread_reads\.last_read_message_id,excluded\.last_read_message_id\)/gi, 'GREATEST(planner_thread_reads.last_read_message_id,excluded.last_read_message_id)')
    .replace(/\s+ON\s+CONFLICT\s*(?:\([^)]*\))?\s+DO\s+NOTHING\s*$/gi, '')
    .replace(/\s+ON\s+CONFLICT\s*\([^)]*\)\s+DO\s+UPDATE\s+SET\s+/gi, ' ON DUPLICATE KEY UPDATE ')
    .replace(/excluded\.(?:`([a-zA-Z_0-9]+)`|([a-zA-Z_0-9]+))/gi, (_, a, b) => `VALUES(\`${a || b}\`)`);
}

function param(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return value.replace('T', ' ').slice(0, -1);
  return value;
}
function normalizeRow(row, fields) {
  const dateFields = new Set(['recorded_at', 'expires_at', 'locked_until', 'claimed_at', 'starts_at', 'ends_at']);
  if (Array.isArray(row)) return row.map((value, i) => normalizeValue(value, fields[i]?.name));
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, normalizeValue(value, name)]));
  function normalizeValue(value, name) {
    if (typeof value === 'string' && dateFields.has(name) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) return value.replace(' ', 'T') + 'Z';
    return value;
  }
}
export function database(executor = pool) {
  return {
    prepare(original) {
      let values = [];
      return {
        bind(...args) { values = args.map(param); return this; },
        async execute(arrayMode = false) {
          let sql = mysqlSQL(original);
          if (/ON\s+CONFLICT\s*(?:\([^)]*\))?\s+DO\s+NOTHING/gi.test(original)) sql = sql.replace(/^insert into/i, 'INSERT IGNORE INTO');
          const returning = sql.match(/\s+returning\s+([\s\S]+)$/i);
          if (returning) sql = sql.slice(0, returning.index);
          const connection = typeof executor.getConnection === 'function' ? await executor.getConnection() : executor;
          try {
            const [result, fields] = await connection.query({ sql, rowsAsArray: arrayMode }, values);
            if (returning) {
              const table = sql.match(/^insert\s+(?:ignore\s+)?into\s+(`?[a-z_0-9]+`?)/i)?.[1];
              if (!table || !result.insertId) throw new Error('Não foi possível recuperar o registro salvo.');
              const [rows, returnedFields] = await connection.query({ sql: `SELECT ${returning[1]} FROM ${table} WHERE id=?`, rowsAsArray: arrayMode }, [result.insertId]);
              return { rows: rows.map(row => normalizeRow(row, returnedFields)), meta: { changes: result.affectedRows, last_row_id: result.insertId } };
            }
            if (Array.isArray(result)) return { rows: result.map(row => normalizeRow(row, fields)), meta: {} };
            return { rows: [], meta: { changes: result.affectedRows, last_row_id: result.insertId } };
          } finally { if (connection !== executor) connection.release(); }
        },
        async all() { const result = await this.execute(); return { success: true, results: result.rows, meta: result.meta }; },
        async raw() { return (await this.execute(true)).rows; },
        async first(column) { const first = (await this.execute()).rows[0] || null; return column && first ? first[column] : first; },
        async run() { return { success: true, meta: (await this.execute()).meta }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.all())); },
  };
}

const digest = value => createHash('sha256').update(value).digest('hex');
async function * bytes(value) {
  if (value instanceof ReadableStream) { const reader = value.getReader(); try { while (true) { const item = await reader.read(); if (item.done) break; yield Buffer.from(item.value); } } finally { reader.releaseLock(); } }
  else if (value instanceof Blob) yield * bytes(value.stream());
  else if (value instanceof ArrayBuffer) yield Buffer.from(value);
  else if (ArrayBuffer.isView(value)) yield Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else if (typeof value === 'string') yield Buffer.from(value);
  else if (value?.[Symbol.asyncIterator]) for await (const chunk of value) yield Buffer.from(chunk);
  else throw new Error('Formato de arquivo inválido.');
}

export const BUCKET = {
  async put(key, value, options = {}) {
    const id = digest(key), version = randomUUID(); let index = 0, size = 0;
    const hash = createHash('sha256');
    try {
      for await (const chunk of bytes(value)) {
        hash.update(chunk); size += chunk.length;
        if (size > 150 * 1024 * 1024) throw new Error('O arquivo excede o limite de 150 MB.');
        for (let offset = 0; offset < chunk.length; offset += 512 * 1024) {
          await pool.execute('INSERT INTO hostinger_object_chunks (version_id,chunk_index,data) VALUES (?,?,?)', [version, index++, chunk.subarray(offset, offset + 512 * 1024)]);
        }
      }
      const [old] = await pool.execute('SELECT version_id FROM hostinger_objects WHERE id=?', [id]);
      await pool.execute('INSERT INTO hostinger_objects(id,object_key,version_id,size,etag,http_metadata) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version_id=VALUES(version_id),size=VALUES(size),etag=VALUES(etag),http_metadata=VALUES(http_metadata)', [id, key, version, size, hash.digest('hex'), JSON.stringify(options.httpMetadata || {})]);
      if (old[0]) await pool.execute('DELETE FROM hostinger_object_chunks WHERE version_id=?', [old[0].version_id]);
      return this.head(key);
    } catch (error) { await pool.execute('DELETE FROM hostinger_object_chunks WHERE version_id=?', [version]).catch(() => {}); throw error; }
  },
  async head(key) {
    const [rows] = await pool.execute('SELECT * FROM hostinger_objects WHERE id=?', [digest(key)]);
    if (!rows[0]) return null;
    const row = rows[0]; return { key, size: Number(row.size), etag: row.etag, version: row.version_id, httpMetadata: JSON.parse(row.http_metadata || '{}') };
  },
  async get(key) {
    const metadata = await this.head(key); if (!metadata) return null;
    let index = 0;
    const body = new ReadableStream({ async pull(controller) {
      try { const [rows] = await pool.execute('SELECT data FROM hostinger_object_chunks WHERE version_id=? AND chunk_index=?', [metadata.version, index++]); if (!rows.length) controller.close(); else controller.enqueue(new Uint8Array(rows[0].data)); }
      catch (error) { controller.error(error); }
    } });
    return { ...metadata, body, async arrayBuffer() { return new Response(body).arrayBuffer(); } };
  },
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const meta = await this.head(key); if (!meta) continue;
      await pool.execute('DELETE FROM hostinger_objects WHERE id=?', [digest(key)]);
      await pool.execute('DELETE FROM hostinger_object_chunks WHERE version_id=?', [meta.version]);
    }
  },
};

export const env = { DB: database(), BUCKET };
