import { createServer } from 'node:http';
import app from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { seedGapAnalysisDemoDataset } from '../seed/gapAnalysisDemoDataset.js';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The Gap Analysis demonstration preview refuses to run with NODE_ENV=production.');
  }

  await connectDb(true);
  const fixture = await seedGapAnalysisDemoDataset();
  // This app-local switch is set only by this isolated preview entrypoint; no
  // request parameter or production environment setting can enable demo data.
  app.locals.allowSyntheticGapAnalysisDemo = true;
  const port = Number(process.env.RDMT_GAP_DEMO_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('RDMT_GAP_DEMO_PORT must be a valid TCP port.');
  }

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Isolated synthetic Gap Analysis preview ready at http://127.0.0.1:${port}`);
  console.log(`Panchayats: ${Object.keys(fixture.panchayatIds).join(', ')}; workbook identity rows: ${fixture.sourceIdentityRecordCount}; coverage schools: ${fixture.syntheticCoverageSchoolCount}; coverage roads: ${fixture.syntheticCoverageRoadCount}`);
  console.log('Every displayed synthetic location is DEMO_ONLY and is not an official Panchayat boundary or verified facility location.');
  console.log('Data is held only in MongoMemoryServer and is discarded when this process exits.');

  const shutdown = () => {
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('Gap Analysis preview failed:', error instanceof Error ? error.message : 'unknown error');
  await disconnectDb();
  process.exitCode = 1;
});
