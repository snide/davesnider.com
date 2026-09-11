// Every message down an error's `cause` chain, outermost first. Drizzle wraps
// libsql failures in DrizzleQueryError ("Failed query: …") whose `cause` holds
// the real libsql message — and console.error(error) on prod printed only the
// outer one, which is how a broken replica went unnamed in the logs
// (2026-09-11). Log the chain, match on the chain.
export const errorMessages = (error: unknown): string[] => {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    const message =
      typeof current === 'object' && 'message' in current
        ? String((current as { message: unknown }).message)
        : String(current);
    messages.push(message);
    current = typeof current === 'object' && 'cause' in current ? (current as { cause: unknown }).cause : undefined;
  }
  return messages;
};

export const errorMatches = (error: unknown, pattern: RegExp): boolean =>
  errorMessages(error).some((message) => pattern.test(message));
