import 'dotenv/config';
import mariadb from 'mariadb';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não foi configurada.');

const url = new URL(databaseUrl);
const database = url.pathname.replace(/^\//, '');

if (!/^[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error('O nome do banco informado na DATABASE_URL é inválido.');
}

async function main() {
  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectionLimit: 1,
    ...(url.hostname.endsWith('.tidbcloud.com')
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  });

  try {
    await pool.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`Banco ${database} disponível.`);
  } finally {
    await pool.end();
  }
}

void main();
