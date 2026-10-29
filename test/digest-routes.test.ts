import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null = 'rook') =>
  JSON.stringify({ at, job, status, owner });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  // Jobs deliberately out of order in the file: both routes must sort by job.
  writeFileSync(
    join(dir, '2026-03-01.jsonl'),
    [
      line('2026-03-01T23:00:00+01:00', 'zeta/job', 'ok'),
      line('2026-03-01T23:05:00+01:00', 'alpha/job', 'retry'),
      line('2026-03-01T23:10:00+01:00', 'alpha/job', 'ok'),
      line('2026-03-01T23:15:00+01:00', 'mid/job', 'fail', null),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-03-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-03-03.jsonl'),
    [
      line('2026-03-03T23:00:00+01:00', 'beta/job', 'ok'),
      'this is not json',
      '{"at":"2026-03-03T23:01:00+01:00","job":"x","status":"nope","owner":null}',
      line('2026-03-03T23:02:00+01:00', 'alpha/job', 'ok'),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const json = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};

// First cell of each table row = the job, in page order.
const pageJobs = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night', () => {
  it('renders a night as an HTML table', async () => {
    const res = await app.request('/digest/2026-03-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('digest 2026-03-01');
    expect(pageJobs(html)).toEqual(['alpha/job', 'mid/job', 'zeta/job']);
    expect(html).not.toContain('bad line');
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/digest/2000-01-01')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-03-02');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('shows the bad-line count', async () => {
    const res = await app.request('/digest/2026-03-03');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('2 bad lines skipped');
    expect(pageJobs(html)).toEqual(['alpha/job', 'beta/job']);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON, rows sorted by job', async () => {
    const { res, body } = await json('2026-03-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(body.night).toBe('2026-03-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'mid/job', 'zeta/job']);
    expect(body.rows[0]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok' });
    expect(body.rows[1]).toMatchObject({ owner: null, lastStatus: 'fail' });
  });

  it('404s with a JSON body for a night with no file', async () => {
    const res = await app.request('/api/digest/2000-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });

  it('has empty rows for an empty night', async () => {
    const { res, body } = await json('2026-03-02');
    expect(res.status).toBe(200);
    expect(body).toEqual({ night: '2026-03-02', rows: [], badLines: 0 });
  });

  it('reports badLines', async () => {
    const { res, body } = await json('2026-03-03');
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'beta/job']);
  });

  it('404s a malformed night id on both routes', async () => {
    expect((await app.request('/api/digest/not-a-night')).status).toBe(404);
    expect((await app.request('/digest/not-a-night')).status).toBe(404);
  });
});

describe('page and JSON agree (ADR 0001)', () => {
  it.each(['2026-03-01', '2026-03-02', '2026-03-03'])('same jobs in the same order for %s', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const { body } = await json(night);
    expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
    const m = html.match(/(\d+) bad lines? skipped/);
    expect(m ? Number(m[1]) : 0).toBe(body.badLines);
  });
});
