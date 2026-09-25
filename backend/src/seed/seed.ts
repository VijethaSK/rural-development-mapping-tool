import { seedDemoDataset } from './demoDataset.js';

/**
 * Demo fixtures are opt-in at startup in every environment. The standalone seed
 * command is explicit and may still force a seed after an operator chooses it.
 */
export async function runSeed(options: { forceDemo?: boolean } = {}): Promise<void> {
  if (!options.forceDemo && process.env.SEED_DEMO_DATA !== 'true') {
    console.log('Skipping development/demo seed; set SEED_DEMO_DATA=true to opt in.');
    return;
  }
  await seedDemoDataset();
}
