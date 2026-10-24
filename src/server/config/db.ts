import mongoose from 'mongoose';

interface GlobalDbState {
  __dsoMongoConnected?: boolean;
  __dsoMongoFailed?: boolean;
}

const globalRef = globalThis as unknown as GlobalDbState;

export async function connectDatabase(): Promise<boolean> {
  if (globalRef.__dsoMongoConnected) return true;
  if (globalRef.__dsoMongoFailed) return false;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[Database]: No MONGODB_URI detected; running with high-performance in-memory persistence store.');
    globalRef.__dsoMongoFailed = true;
    return false;
  }
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(uri);
    }
    console.log('[Database]: Connected to MongoDB successfully.');
    globalRef.__dsoMongoConnected = true;
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Database]: MongoDB connection failed, continuing with in-memory store:', message);
    globalRef.__dsoMongoFailed = true;
    return false;
  }
}
