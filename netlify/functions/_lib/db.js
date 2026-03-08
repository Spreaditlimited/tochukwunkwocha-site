const mysql = require("mysql2/promise");

let pool;

function required(name) {
  const value = process.env[name] && String(process.env[name]).trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: required("DB_HOST"),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: "utf8mb4",
  });
  return pool;
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

module.exports = { getPool, nowSql };
