export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { connectDatabase } = await import('./server/config/db.ts');
    await connectDatabase();
  }
}
