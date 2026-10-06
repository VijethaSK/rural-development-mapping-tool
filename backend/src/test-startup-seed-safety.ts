import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSeed } from './seed/seed.js';
import { startBackend } from './startup.js';

const serverSource = await readFile(new URL('./server.ts', import.meta.url), 'utf8');
const startupSource = await readFile(new URL('./startup.ts', import.meta.url), 'utf8');
const seedCommandSource = await readFile(new URL('./seed/seed-run.ts', import.meta.url), 'utf8');
const backendPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> };
const rootPackage = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> };

assert.doesNotMatch(serverSource, /runSeed|seedDemoDataset|\.\/seed\//);
assert.doesNotMatch(startupSource, /runSeed|seedDemoDataset|\.\/seed\//);
assert.match(seedCommandSource, /runSeed\(\{\s*forceDemo:\s*true\s*\}\)/);
assert.match(backendPackage.scripts?.seed ?? '', /src\/seed\/seed-run\.ts/);
assert.equal(backendPackage.scripts?.start, 'node dist/server.js');
assert.match(backendPackage.scripts?.dev ?? '', /node --watch dist\/server\.js/);
assert.match(rootPackage.scripts?.start ?? '', /backend run dev/);

const priorSeedFlag = process.env.SEED_DEMO_DATA;
process.env.SEED_DEMO_DATA = 'true';
try {
  const startupEvents: string[] = [];
  await startBackend({
    connectDb: async () => { startupEvents.push('connect'); },
    listen: (_port, callback) => { startupEvents.push('listen'); callback(); },
    port: 4000,
    production: true
  });
  assert.deepEqual(startupEvents, ['connect', 'listen'], 'ordinary production startup only connects and listens even when SEED_DEMO_DATA=true');

  let seedCalls = 0;
  await runSeed({ seedDemoDataset: async () => { seedCalls += 1; } });
  assert.equal(seedCalls, 0, 'SEED_DEMO_DATA=true alone does not run the seed wrapper');

  await runSeed({ forceDemo: true, seedDemoDataset: async () => { seedCalls += 1; } });
  assert.equal(seedCalls, 1, 'the explicit seed command path can invoke demo seeding');
} finally {
  if (priorSeedFlag === undefined) delete process.env.SEED_DEMO_DATA;
  else process.env.SEED_DEMO_DATA = priorSeedFlag;
}

console.log('Startup and explicit seed safety tests passed.');
