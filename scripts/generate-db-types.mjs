// Generate client types from the actual migration in disposable PostgreSQL.
import { createTestDatabase } from './test-database.mjs';
import { format } from 'prettier';
import { writeFile } from 'node:fs/promises';
const db = await createTestDatabase();
try {
  const columns = (
    await db.query(
      `select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
    )
  ).rows;
  const keys = (
    await db.query(
      `select c.conname as name,cl.relname as source,fr.relname as target,array(select a.attname from unnest(c.conkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.i) as columns,array(select a.attname from unnest(c.confkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.i) as referenced from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_class fr on fr.oid=c.confrelid join pg_namespace ns on ns.oid=cl.relnamespace where c.contype='f' and ns.nspname='public'`,
    )
  ).rows;
  const type = (udt) =>
    ({
      int4: 'number',
      int8: 'number',
      bool: 'boolean',
      uuid: 'string',
      text: 'string',
      timestamptz: 'string',
      date: 'string',
      jsonb: 'Json',
      _text: 'string[]',
      void: 'null',
    })[udt] || 'unknown';
  let out = `/* Generated from the migration. Run npm run db:types after schema changes. */\nexport type Json = string | number | boolean | null | {[key: string]: Json | undefined} | Json[];\nexport type Database = {public: {Tables: {\n`;
  for (const table of [...new Set(columns.map((c) => c.table_name))]) {
    const cols = columns.filter((c) => c.table_name === table);
    out += `${table}: {Row: {${cols.map((c) => `${c.column_name}: ${type(c.udt_name)}${c.is_nullable === 'YES' ? ' | null' : ''}`).join(';')}};\nInsert: {${cols.map((c) => `${c.column_name}${c.is_nullable === 'YES' || c.column_default ? '?' : ''}: ${type(c.udt_name)}${c.is_nullable === 'YES' ? ' | null' : ''}`).join(';')}};\nUpdate: {${cols.map((c) => `${c.column_name}?: ${type(c.udt_name)}${c.is_nullable === 'YES' ? ' | null' : ''}`).join(';')}};\nRelationships: [${keys
      .filter((k) => k.source === table && k.target !== 'users')
      .map(
        (k) =>
          `{foreignKeyName:${JSON.stringify(k.name)};columns:${JSON.stringify(k.columns)};isOneToOne:false;referencedRelation:${JSON.stringify(k.target)};referencedColumns:${JSON.stringify(k.referenced)}}`,
      )
      .join(',')}]};\n`;
  }
  const functions = (
    await db.query(
      `select proname,proargnames,array(select typname from unnest(proargtypes) with ordinality a(t,i) join pg_type pt on pt.oid=a.t order by i) as types,pronargdefaults,(select typname from pg_type where oid=prorettype) as returns from pg_proc where pronamespace='public'::regnamespace and proname not in ('handle_signup','validate_timezone','validate_program') order by proname`,
    )
  ).rows;
  out += '}; Views: {[key in never]:never}; Functions: {';
  for (const fn of functions)
    out += `${fn.proname}:{Args:{${(fn.proargnames || []).map((arg, i) => `${arg}${i >= fn.types.length - fn.pronargdefaults ? '?' : ''}: ${type(fn.types[i])}${i >= fn.types.length - fn.pronargdefaults ? ' | null' : ''}`).join(';')}};Returns:${type(fn.returns)}};\n`;
  out += '}; Enums:{[key in never]:never}; CompositeTypes:{[key in never]:never}}};\n';
  await writeFile(
    'src/lib/database.types.ts',
    await format(out.replaceAll('Args:{}', 'Args:Record<string, never>'), {
      parser: 'typescript',
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    }),
  );
  console.log('Generated database types from PostgreSQL schema.');
} finally {
  await db.close();
}
