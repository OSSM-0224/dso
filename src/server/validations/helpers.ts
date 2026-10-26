import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

import { ApiError, toWebResponse } from '../apiError.ts';
import type { ServerTiming } from '../http/serverTiming.ts';

export type RouteJson = NextResponse;

/** Mirrors the old `validateBody` middleware: zod parse or a 400 with the
 * joined zod issues formatted exactly like Express did. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    const issueList = (err as { issues?: Array<{ path: (string | number | symbol)[]; message: string }> }).issues;
    if (Array.isArray(issueList)) {
      const errorMessages = issueList.map((e) => `${e.path.map(String).join('.')}: ${e.message}`);
      throw new ApiError(400, `Validation error: ${errorMessages.join('; ')}`);
    }
    throw new ApiError(400, 'Invalid input payload');
  }
}

export async function parseJsonRequest<T>(schema: ZodType<T>, req: Request): Promise<T> {
  let body: unknown = undefined;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return parseBody(schema, body);
}

/** Central error handler equivalent of the Express `errorHandler` middleware. */
export function errorResponse(err: unknown): NextResponse {
  const { status, message } = toWebResponse(err);
  if (status >= 500) {
    console.error('[API Error]:', err);
  }
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Wraps a handler body with the same try/catch shape as the Express
 * try/catch(async, next(err)) chains in every route file. */
export async function handler(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}

export function ok(
  data: unknown,
  status: number = 200,
  timing?: ServerTiming
): NextResponse {
  const response = NextResponse.json({ success: true, data }, { status });
  if (timing) response.headers.set('Server-Timing', timing.header());
  return response;
}

export function okMessage(message: string, data: unknown): NextResponse {
  return NextResponse.json({ success: true, message, data }, { status: 200 });
}
