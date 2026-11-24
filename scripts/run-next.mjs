import { spawn } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const extraArgs = process.argv.slice(3);

let port = process.env.PORT || '3000';
let host = '0.0.0.0';

for (let i = 0; i < extraArgs.length; i += 1) {
  const arg = extraArgs[i];
  if (arg === '--port' || arg === '-p') {
    if (extraArgs[i + 1]) port = extraArgs[i + 1];
    i += 1;
  } else if (arg.startsWith('--port=')) {
    port = arg.slice('--port='.length);
  } else if (arg === '--host' || arg === '-H') {
    if (extraArgs[i + 1]) host = extraArgs[i + 1];
    i += 1;
  } else if (arg.startsWith('--host=')) {
    host = arg.slice('--host='.length);
  }
}

const nextBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'next');
const child = spawn(nextBin, [mode, '-p', String(port), '-H', host], {
  stdio: 'inherit',
  env: process.env,
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) {
      child.kill(sig);
    }
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
