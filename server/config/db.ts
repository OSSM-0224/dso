import mongoose from 'mongoose';

export async function connectDatabase(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[Database]: No MONGODB_URI detected; running with high-performance in-memory persistence store.');
    return false;
  }
  try {
    await mongoose.connect(uri);
    console.log('[Database]: Connected to MongoDB successfully.');
    return true;
  } catch (err: any) {
    console.warn('[Database]: MongoDB connection failed, continuing with in-memory store:', err.message);
    return false;
  }
}
