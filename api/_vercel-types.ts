import type { IncomingMessage, ServerResponse } from 'node:http';

// Hand-rolled subset of @vercel/node's request/response shape — avoids
// pulling in that package (and its dev-tooling-only transitive CVEs) just
// for two small functions.
export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: unknown;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  send(body: string): void;
  redirect(statusOrUrl: number | string, url?: string): void;
}
