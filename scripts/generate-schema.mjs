import { z } from 'zod';
import { format } from 'prettier';
import { writeFile, mkdir } from 'node:fs/promises';
import { programSchema } from '../src/lib/import.ts';
const schema = z.toJSONSchema(programSchema, { target: 'draft-2020-12' });
await mkdir('public/examples', { recursive: true });
await writeFile(
  'public/examples/program.schema.json',
  await format(JSON.stringify({ ...schema, title: 'PRGRS program import v1' }), {
    parser: 'json',
    printWidth: 100,
  }),
);
console.log('Generated public/examples/program.schema.json from the authoritative Zod schema.');
