// The night's run log, read into one row per job. Implementation: `readNight` in ./read.ts.

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null here; views render it as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` seen for this job, null if none
  firstAt: string; // `at` as written in the log, offset kept
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; [] = the file exists but nothing ran
  badLines: number; // lines that did not parse; counted, never thrown
};

// null = no file for that night (or not a YYYY-MM-DD night): the page answers 404.
export type ReadNight = (runsDir: string, night: string) => Night | null;
