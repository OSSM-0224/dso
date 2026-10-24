export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function toWebResponse(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof Error) {
    return { status: (err as { status?: number }).status || 500, message: err.message || 'An internal server error occurred' };
  }
  return { status: 500, message: 'An internal server error occurred' };
}
