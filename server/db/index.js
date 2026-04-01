"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbPath = exports.db = void 0;
exports.query = query;
exports.queryOne = queryOne;
exports.run = run;
exports.transaction = transaction;
const node_sqlite_1 = require("node:sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let dbPath;
if (process.env.NODE_ENV === 'production') {
    const electronApp = require('electron').app;
    const userDataPath = electronApp.getPath('userData');
    exports.dbPath = dbPath = path_1.default.join(userDataPath, 'voter-service.db');
}
else {
    const dataDir = path_1.default.join(process.cwd(), 'data');
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    exports.dbPath = dbPath = path_1.default.join(dataDir, 'voter-service.db');
}
exports.db = new node_sqlite_1.DatabaseSync(dbPath);
// 啟用 WAL 模式（多讀者支援）
exports.db.exec("PRAGMA journal_mode = WAL");
exports.db.exec("PRAGMA foreign_keys = ON");
// 簡易查詢輔助函式
function query(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    return stmt.all(...params);
}
function queryOne(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    return stmt.get(...params);
}
function run(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
}
function transaction(fn) {
    // node:sqlite 不直接支援 transaction helper，手動實作
    exports.db.exec('BEGIN');
    try {
        const result = fn();
        exports.db.exec('COMMIT');
        return result;
    }
    catch (e) {
        exports.db.exec('ROLLBACK');
        throw e;
    }
}
