import type { Night } from '../digest/types.js';

const dash = (v: string | null) => (v === null || v === '' ? '—' : v);

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      {night.badLines > 0 && (
        <p class="warn">
          {night.badLines} bad {night.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      )}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>first at</th>
              <th>last at</th>
              <th>last error</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((r) => {
              const warn = r.retries >= 3 || r.lastStatus === 'fail';
              return (
                <tr class={warn ? 'warn' : undefined}>
                  <td>{r.job}</td>
                  <td>{dash(r.owner)}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{dash(r.firstAt)}</td>
                  <td>{dash(r.lastAt)}</td>
                  <td>{dash(r.lastError)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
