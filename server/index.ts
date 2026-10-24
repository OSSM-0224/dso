import dotenv from 'dotenv';
dotenv.config();

import net from 'net';
import { createApp } from './app.ts';
import { connectDatabase } from './config/db.ts';

const BASE_HMR_PORT = 24678;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '0.0.0.0');
  });
}

async function findFreePort(startPort: number, maxAttempts = 5): Promise<number | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    if (await isPortFree(port)) return port;
    console.warn(`[Server]: Port ${port} is already in use (another instance running?), trying ${port + 1}...`);
  }
  return null;
}

async function main() {
  await connectDatabase();

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const freePort = await findFreePort(PORT);
  if (!freePort) {
    throw new Error(`Could not find a free port between ${PORT} and ${PORT + 4}. Stop the other "npm run dev" instance(s) first.`);
  }
  if (freePort !== PORT) {
    console.warn(`[Server]: Port ${PORT} is busy, running on ${freePort} instead.`);
  }

  const app = await createApp(BASE_HMR_PORT + (freePort - PORT));

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(freePort, '0.0.0.0', () => {
      console.log(`[DSO Navi Mumbai Platform]: Server listening on http://0.0.0.0:${freePort}`);
      resolve();
    });
    server.on('error', reject);
  });
}

main().catch((err) => {
  console.error('[Server Fatal Error]:', err);
  process.exit(1);
});
