import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function migrationSQL(directory = new URL('../migrations/', import.meta.url)) {
 const files = (await readdir(directory)).filter(f => /^\d+_[a-z_]+\.sql$/.test(f)).sort();
 let body = `PERFORM pg_advisory_xact_lock(71421953);\nCREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n`;
 for (const name of files) {
  const source = await readFile(new URL(name, directory), 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  // Each migration is executed inside this single PostgreSQL transaction. No client-side decisions or session locks.
  if (/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(source)) throw new Error('Migration must not control transactions');
  const literal = "'" + source.replaceAll("'", "''") + "'";
  body += `IF EXISTS (SELECT 1 FROM app_migrations WHERE name='${name}' AND checksum<>'${hash}') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;\nIF NOT EXISTS (SELECT 1 FROM app_migrations WHERE name='${name}') THEN EXECUTE ${literal}; INSERT INTO app_migrations(name,checksum) VALUES ('${name}','${hash}'); END IF;\n`;
 }
 return `DO $migration$ BEGIN\n${body}END $migration$;`;
}
export async function migrate(url) {
 if (!url) throw new Error('DATABASE_URL_UNPOOLED is required');
 if (new URL(url).hostname.includes('-pooler')) throw new Error('Migrations require an unpooled URL');
 const sql = neon(url); await sql.query(await migrationSQL(), []);
 console.log('Application migrations verified/applied');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 try { await migrate(process.env.DATABASE_URL_UNPOOLED); } catch { console.error('Migration failed; check connectivity/configuration (credentials suppressed)'); process.exitCode=1; }
}
