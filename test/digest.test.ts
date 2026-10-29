import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps last status, last error and offsets', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const job = (j: string) => rows.find((r) => r.job === j);
    expect(job('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(job('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastAt: '2026-10-29T05:00:04+01:00' });
    expect(job('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(job('rig/rotate-logs')).toMatchObject({ lastError: null, firstAt: '2026-10-28T23:00:02+01:00' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('returns null when the night has no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('an empty file is a night where nothing ran', () => {
    const dir = tempRuns({ '2026-11-01.jsonl': '' });
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('counts lines with the wrong shape as bad, skips blank lines', () => {
    const dir = tempRuns({
      '2026-11-02.jsonl': [
        '{"at":"2026-11-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '',
        '{"at":"2026-11-02T01:01:00+01:00","job":"a","status":"maybe","owner":"x"}',
        '{"job":"b","status":"ok","owner":"x"}',
        '[1,2]',
        'not json',
        '',
      ].join('\n'),
    });
    const night = readNight(dir, '2026-11-02')!;
    expect(night.badLines).toBe(4);
    expect(night.rows).toHaveLength(1);
  });
});
