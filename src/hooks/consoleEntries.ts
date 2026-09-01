import type { ConsoleEntry } from '@/types';

export function mergeConsoleEntries(
  existing: ConsoleEntry[],
  incoming: ConsoleEntry[],
  limit = 5000,
): ConsoleEntry[] {
  const entries = new Map<string, ConsoleEntry>();
  for (const entry of [...existing, ...incoming]) entries.set(entry.id, entry);
  return [...entries.values()].slice(-limit);
}
