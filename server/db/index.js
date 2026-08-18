/**
 * server/db/index.js — SQLite Database Connection & Query Wrapper.
 * Uses native Node.js 24 SQLite engine (node:sqlite) for high performance & zero external binary dependencies.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'menuscan.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let dbInstance = null;

function getDB() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    // Execute schema migrations on connection
    if (fs.existsSync(SCHEMA_PATH)) {
      const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
      dbInstance.exec(schemaSql);
    }
  }
  return dbInstance;
}

// ── Query Helpers ────────────────────────────────────────────────

function queryOne(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return rows.length > 0 ? rows[0] : null;
}

function queryAll(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function execute(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

function execScript(sqlScript) {
  const db = getDB();
  db.exec(sqlScript);
}

module.exports = {
  getDB,
  queryOne,
  queryAll,
  execute,
  execScript,
  DB_PATH
};
