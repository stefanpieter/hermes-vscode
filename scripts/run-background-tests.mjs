import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function collectTestFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

const testDirectory = fileURLToPath(new URL('../src/test/', import.meta.url));
const testFiles = collectTestFiles(testDirectory).sort();

if (testFiles.length === 0) {
  console.error(`No background test files found in ${testDirectory}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...testFiles],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.signal) {
  console.error(`Background tests terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
