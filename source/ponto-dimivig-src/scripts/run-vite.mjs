import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
const root = process.cwd();
const viteBinJs = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const run = (command, commandArgs = []) => {
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    cwd: root,
    shell: false,
  });

  child.on('error', (error) => {
    console.error('[setup] falha ao iniciar vite:', error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
};

if (existsSync(viteBinJs)) {
  run(process.execPath, [viteBinJs, ...args]);
} else {
  console.warn('[setup] vite local não encontrado em node_modules; usando fallback com npx.');
  run(isWin ? 'npx.cmd' : 'npx', ['--yes', 'vite', ...args]);
}
