import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectModIssue, ModIssueStore } from './modIssues.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('mod issue diagnostics', () => {
  it('associates strong logger, dependency and recommendation evidence', () => {
    const ids = new Set(['example']);
    expect(detectModIssue('[example/ERROR] Failed to load example:textures/block.png', ids)).toMatchObject({ modId: 'example', severity: 'Error', affectedResource: 'example:textures/block.png' });
    expect(detectModIssue("Mod 'Example' (example) requires version 2.0 of helper", ids)).toMatchObject({ modId: 'example', severity: 'Dependency' });
    expect(detectModIssue("Mod 'Example' (example) recommends version 12 of modmenu", ids)).toMatchObject({ modId: 'example', severity: 'Recommendation' });
  });

  it('does not attach generic server failures without reliable mod evidence', () => {
    const ids = new Set(['example']);
    expect(detectModIssue('[Server thread/ERROR] Failed to bind to port 25565', ids)).toBeNull();
    expect(detectModIssue('java.lang.OutOfMemoryError: Java heap space', ids)).toBeNull();
    expect(detectModIssue('[unknownlogger/ERROR] Failed to initialize renderer', ids)).toBeNull();
    expect(detectModIssue("Error while handling mod 'not-installed'", ids)).toBeNull();
    expect(detectModIssue('[looks_like_a_mod/WARN] Something unexpected happened', new Set())).toBeNull();
    expect(detectModIssue("ERROR Mod 'Pretend Mod' (not_installed) crashed", new Set())).toBeNull();
  });

  it('accepts explicit Fabric dependency evidence even before the affected mod loads', () => {
    expect(detectModIssue("Mod 'Broken Example' (broken_example) requires version 2.0 of helper", new Set()))
      .toMatchObject({ modId: 'broken_example', severity: 'Dependency' });
  });

  it('persists occurrences and marks older issues not-seen rather than resolved after startup', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-issues-'));
    temporary.push(directory);
    const detected = detectModIssue('[example/ERROR] Failed to load example:item', new Set(['example']))!;
    const first = new ModIssueStore();
    await first.beginRun(directory, 'run-1');
    await first.record(directory, detected, 'run-1', new Date('2026-09-01T00:00:00Z'));
    await first.record(directory, detected, 'run-1', new Date('2026-09-01T00:01:00Z'));

    const restarted = new ModIssueStore();
    expect(await restarted.list(directory)).toEqual([expect.objectContaining({ modId: 'example', occurrenceCount: 2, status: 'active' })]);
    await restarted.beginRun(directory, 'run-2');
    await restarted.markNotSeenAfterStartup(directory, new Set(['example']), 'run-2');
    const historical = await restarted.list(directory);
    expect(historical).toEqual([expect.objectContaining({ status: 'not-seen' })]);
    expect(historical[0]).not.toHaveProperty('resolvedAt');
    await restarted.record(directory, detected, 'run-2', new Date('2026-09-02T00:01:00Z'));
    expect(await restarted.list(directory)).toEqual([expect.objectContaining({ status: 'active', occurrenceCount: 3 })]);
  });
});
