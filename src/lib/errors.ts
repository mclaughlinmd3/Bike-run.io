// Supabase (PostgREST/GoTrue) errors are plain objects with a `message`
// field, not real Error instances, so `err instanceof Error` misses them
// and `String(err)` degrades to "[object Object]". This reads the message
// out of either shape.
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(err);
}
