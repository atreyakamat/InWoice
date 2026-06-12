import { spawn } from 'node:child_process';
import { join } from 'node:path';

const vitestBin = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');

const child = spawn(process.execPath, [vitestBin, 'run', '--coverage'], {
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});