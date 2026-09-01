import { describe, expect, it } from 'vitest';
import type { ConsoleEntry } from '@/types';
import { mergeConsoleEntries } from './consoleEntries';

function entry(id: string, source: ConsoleEntry['source']): ConsoleEntry {
  return { id, timestamp: '2026-09-02T00:00:00.000Z', severity: 'INFO', message: id, source };
}

describe('console history merging', () => {
  it('does not duplicate a live line also returned by persisted history', () => {
    const live = entry('stable-id', 'LIVE');
    const persisted = entry('stable-id', 'HISTORY');
    expect(mergeConsoleEntries([persisted], [live])).toEqual([live]);
  });

  it('keeps lines received while persisted history is loading', () => {
    expect(mergeConsoleEntries([entry('older', 'HISTORY')], [entry('new', 'LIVE')]).map((value) => value.id))
      .toEqual(['older', 'new']);
  });
});
