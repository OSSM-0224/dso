import 'server-only';
import mongoose from 'mongoose';

interface GlobalDbState {
  __dsoMongoConnected?: boolean;
  __dsoMongoConnectPromise?: Promise<boolean>;
  __dsoMongoLastFailureAt?: number;
  __dsoNoUriLogged?: boolean;
}

const globalRef = globalThis as unknown as GlobalDbState;

const RETRY_WINDOW_MS = 30_000;

export async function connectDatabase(): Promise<boolean> {
  if (globalRef.__dsoMongoConnected) return true;
  if (globalRef.__dsoMongoConnectPromise) return globalRef.__dsoMongoConnectPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    if (!globalRef.__dsoNoUriLogged) {
      console.log(
        '[Database]: No MONGODB_URI detected; running with in-memory persistence store.'
      );
      globalRef.__dsoNoUriLogged = true;
    }
    return false;
  }

  if (
    globalRef.__dsoMongoLastFailureAt &&
    Date.now() - globalRef.__dsoMongoLastFailureAt < RETRY_WINDOW_MS
  ) {
    return false;
  }

  globalRef.__dsoMongoConnectPromise = (async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      }
      console.log('[Database]: Connected to MongoDB successfully.');
      globalRef.__dsoMongoConnected = true;
      globalRef.__dsoMongoLastFailureAt = undefined;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        '[Database]: MongoDB connection failed, continuing with in-memory store:',
        message
      );
      globalRef.__dsoMongoLastFailureAt = Date.now();
      return false;
    } finally {
      globalRef.__dsoMongoConnectPromise = undefined;
    }
  })();

  return globalRef.__dsoMongoConnectPromise;
}
