// Seeds Lincoln's system-of-record table (enrollment, plans, accumulators, claim history, providers) from the demo
// members. Usage (from infra/): AWS_PROFILE=ting-aws AWS_REGION=us-west-2 npx tsx scripts/seed-carrier.mts
import { readFileSync } from 'node:fs';

const { Ting: out } = JSON.parse(readFileSync(new URL('../outputs.json', import.meta.url), 'utf8'));
process.env.CARRIER_TABLE = out.CarrierTable;
const { seedCarrier } = await import('../../backend/src/lib/carrier');
console.log(await seedCarrier(new Date().toISOString().slice(0, 10)));
