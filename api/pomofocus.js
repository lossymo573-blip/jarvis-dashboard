/**
 * Pomofocus webhook endpoint
 * ---------------------------
 * Receives webhook POSTs from Pomofocus (https://pomofocus.io) and writes
 * completed pomodoro sessions into the Supabase `pomodoro_log` table.
 *
 * Only "pomodoro" rounds (focused work, not breaks) are recorded, and only
 * `finish` / `pause` events. Rows are UPSERTed on `session_start_ms` so a later
 * `finish` event overwrites an earlier `pause` for the same session — meaning a
 * single focus session is never double-counted.
 *
 * Configure Pomofocus to POST to this URL (the secret guards the endpoint):
 *   https://jarvis-dashboard-tau-ten.vercel.app/api/pomofocus?secret=pf_3kZ9mNvR2hPzQ7sLwYbC8gKx7vN
 *
 * Runs on the default Vercel Node runtime.
 */

const SUPABASE_URL = 'https://pupgpyhvwqlaogfpupoz.supabase.co';
const SUPABASE_KEY = 'sb_publishable__mfDd-My4PNl8DRBEX__sw_VK0Q7Ejm';
const SECRET = 'pf_3kZ9mNvR2hPzQ7sLwYbC8gKx7vN';

export default async function handler(req, res) {
  // 1. POST only.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Shared-secret check.
  if (req.query.secret !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 3. Vercel auto-parses application/json bodies into req.body.
  const body = req.body || {};

  // 4. Ignore breaks — only "pomodoro" rounds are focused work.
  if (body.round !== 'pomodoro') {
    return res.status(200).json({ ignored: 'not a pomodoro round' });
  }

  // 5. Only record finish / pause events.
  if (body.type !== 'finish' && body.type !== 'pause') {
    return res.status(200).json({ ignored: `event type ${body.type}` });
  }

  // 6. UPSERT into pomodoro_log, conflict on session_start_ms so a later
  //    finish overwrites an earlier pause for the same session.
  const row = {
    session_start_ms: body.session_start,
    ended_at: new Date(body.session_end).toISOString(),
    duration_seconds: body.seconds || 0,
    task: body.task || '',
    project: body.project || '',
    event_type: body.type,
  };

  const supaRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pomodoro_log?on_conflict=session_start_ms`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    }
  );

  // 8. Surface Supabase errors so we can debug.
  if (!supaRes.ok) {
    const errorText = await supaRes.text();
    return res.status(500).json({ error: errorText });
  }

  return res.status(200).json({ ok: true });
}
