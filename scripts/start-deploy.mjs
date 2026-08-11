import { spawn, spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const migration = spawnSync(npx, ['prisma', 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'inherit',
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status || 1);

const seed = spawnSync(process.execPath, ['dist/prisma/seed.js'], {
  env: process.env,
  stdio: 'inherit',
});

if (seed.error) throw seed.error;
if (seed.status !== 0) process.exit(seed.status || 1);

const server = spawn(process.execPath, ['dist/src/main.js'], {
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}

server.on('error', (error) => {
  console.error('Não foi possível iniciar a API.', error);
  process.exit(1);
});
server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code || 0);
});
