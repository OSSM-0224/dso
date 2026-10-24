// TEMP-LOGIN: remove later
//
// CLI entrypoint for seeding / removing temporary developer login accounts.
// The runtime logic lives in src/server/dev/temp-logins/seedRuntime.ts so it
// can also be invoked from the /api/dev route handlers in non-production.
import dotenv from 'dotenv';

dotenv.config();

import { runTempLoginSeed } from '../src/server/dev/temp-logins/seedRuntime';

const isRemoveMode = process.argv.includes('--remove') || process.argv.includes('remove');

runTempLoginSeed({ remove: isRemoveMode })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[TEMP-LOGIN: ERROR]:', err);
    process.exit(1);
  });
