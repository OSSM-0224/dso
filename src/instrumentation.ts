export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { connectDatabase } = await import('./server/config/db.ts');
    if (await connectDatabase()) {
      const { ensureDatabaseIndexes } = await import('./server/db/indexes.ts');
      await ensureDatabaseIndexes();
    }
  }
}
