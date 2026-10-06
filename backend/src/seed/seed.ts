import { seedDemoDataset } from './demoDataset.js';

/**
 * Demo fixtures are only run by an explicit seed command. Environment variables
 * cannot enable database writes through ordinary server startup.
 */
export async function runSeed(options: {
  forceDemo?: boolean;
  seedDemoDataset?: () => Promise<void>;
} = {}): Promise<void> {
  if (!options.forceDemo) {
    console.log('Skipping development/demo seed; use the explicit backend seed command to run it.');
    return;
  }
  await (options.seedDemoDataset ?? seedDemoDataset)();
}
