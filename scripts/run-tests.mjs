import { readdir } from 'node:fs/promises';

// Register every existing node:test case in this process. Using the tsx loader
// directly avoids the CLI's extra IPC server, which restricted cloud shells deny.
const directory = new URL('../tests/', import.meta.url);
for (const file of (await readdir(directory)).filter((name) => name.endsWith('.test.ts')).sort()) {
  await import(new URL(file, directory).href);
}
