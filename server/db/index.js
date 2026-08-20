/**
 * server/db/index.js — Turso (libSQL) Database Connection & Async Query Wrapper.
 * Uses @libsql/client for edge-distributed, cloud-hosted SQLite (Turso).
 *
 * Environment variables:
 *   TURSO_DATABASE_URL  — libSQL URL, e.g. libsql://your-db.turso.io
 *                         Falls back to file:./data/menuscan.db for local dev.
 *   TURSO_AUTH_TOKEN    — Auth token from `turso db tokens create <db>`
 *                         Leave blank for local file-based usage.
 */

const { createClient } = require('@libsql/client');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();

// ── Connection Setup ─────────────────────────────────────────────

// Ensure local data dir exists (used when falling back to local file)
const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_URL = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'menuscan.db')}`;
const DB_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

// Legacy export kept for callers that import DB_PATH (e.g. old tests)
const DB_PATH = path.join(DATA_DIR, 'menuscan.db');

let _client = null;

/**
 * Returns the singleton @libsql/client instance.
 * Lazily initialized on first call.
 */
function getDB() {
  if (!_client) {
    _client = createClient({
      url: DB_URL,
      authToken: DB_AUTH_TOKEN
    });
  }
  return _client;
}

// ── Async Query Helpers ──────────────────────────────────────────

/**
 * Execute a query and return the first row, or null.
 * @param {string} sql
 * @param {any[]} params
 */
async function queryOne(sql, params = []) {
  const client = getDB();
  const result = await client.execute({ sql, args: params });
  if (!result.rows || result.rows.length === 0) return null;
  return _rowToObject(result.columns, result.rows[0]);
}

/**
 * Execute a query and return all rows as plain objects.
 * @param {string} sql
 * @param {any[]} params
 */
async function queryAll(sql, params = []) {
  const client = getDB();
  const result = await client.execute({ sql, args: params });
  if (!result.rows) return [];
  return result.rows.map(row => _rowToObject(result.columns, row));
}

/**
 * Execute a mutating statement (INSERT / UPDATE / DELETE).
 * Returns the libSQL ResultSet (includes .rowsAffected, .lastInsertRowid).
 * @param {string} sql
 * @param {any[]} params
 */
async function execute(sql, params = []) {
  const client = getDB();
  return client.execute({ sql, args: params });
}

/**
 * Execute multiple SQL statements in sequence (for schema init).
 * Splits on ';' and runs each non-empty statement individually.
 * @param {string} sqlScript
 */
async function execScript(sqlScript) {
  const client = getDB();
  const statements = sqlScript
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    await client.execute({ sql: stmt, args: [] });
  }
}

// ── Internal Helpers ─────────────────────────────────────────────

/**
 * Convert a libSQL row (array) + columns array into a plain JS object.
 * Turso rows are array-like — we need to map column names to values.
 */
function _rowToObject(columns, row) {
  const obj = {};
  columns.forEach((col, i) => {
    const val = row[i];
    // Convert BigInt (lastInsertRowid, COUNT) to Number for compatibility
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  });
  return obj;
}

module.exports = {
  getDB,
  queryOne,
  queryAll,
  execute,
  execScript,
  DB_PATH  // kept for backward-compat
};
