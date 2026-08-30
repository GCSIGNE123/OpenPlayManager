// 24-Hour Inactivity Auto-Close + existing 3-Day Max Age — the REAL
// automatic sweep. Runs on a schedule (see ../../sweep-cron-setup.sql),
// independently of anyone opening Pro's UI — closing the gap the on-demand
// All Sessions screen sweep (src/lib/sessionIndexModel.js's
// sweepAgedSessions, still unchanged and still runs client-side too) can't
// close on its own.
//
// Deliberately reuses, rather than reimplements, Pro's own decision logic:
//   - expirationReason()              from src/lib/openPlaySessionLifecycle.js
//   - computeSessionAnalyticsReport()  from src/lib/sessionAnalytics.js
//   - uid()                            from src/lib/random.js
//   - the SESSION_*_PREFIX / SESSION_*_AGE_MS constants from src/lib/constants.js
// via plain relative ESM imports — all four modules are pure (no `window`,
// no browser API, confirmed by scripts/run-acceptance-test.mjs already
// importing several of them directly under plain Node) and each is
// deployed inline with this function by the Supabase CLI's bundler (which
// resolves and bundles local relative imports, not just files inside this
// functions/ directory).
//
// What IS reimplemented here, necessarily: the opl_kv read/write glue
// itself. src/lib/sessionIndexModel.js and src/lib/sessionReportModel.js
// both go through window.storage (src/storage.js's browser-only wrapper
// around the anon-key Supabase client) — there is no `window` in a Deno
// Edge Function, and this function deliberately uses the SERVICE ROLE key
// (see the auth check below), not the anon key, since it must run
// unattended with no facilitator/browser present. This file's opl_kv
// get/set/delete calls are a direct, intentionally-thin mirror of what
// storage.js already does against the exact same table/columns — not a
// second implementation of the END-SESSION DECISION, only of the
// transport underneath it.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  SESSION_AUTO_END_AGE_MS,
  SESSION_INACTIVITY_AGE_MS,
  STORAGE_PREFIX,
  SESSION_INDEX_PREFIX,
  SESSION_REPORT_PREFIX,
} from "../../../src/lib/constants.js";
import { expirationReason } from "../../../src/lib/openPlaySessionLifecycle.js";
import { computeSessionAnalyticsReport } from "../../../src/lib/sessionAnalytics.js";
import { uid } from "../../../src/lib/random.js";

async function readKv(supabase, key) {
  const { data, error } = await supabase.from("opl_kv").select("value").eq("key", key).eq("shared", true).maybeSingle();
  if (error) throw error;
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}

async function endExpiredSession(supabase, entry, liveState, endReasonText) {
  // Save the final report FIRST, exactly like sweepAgedSessions — best
  // effort: a report failure must never block the session from actually
  // closing (an organizer manually ending a session has the same
  // tolerance).
  try {
    const report = computeSessionAnalyticsReport(liveState);
    const stamped = { id: uid(), sessionCode: entry.sessionCode, savedAt: Date.now(), ...report };
    const { error } = await supabase
      .from("opl_kv")
      .upsert({ key: `${SESSION_REPORT_PREFIX}${stamped.id}`, shared: true, value: JSON.stringify(stamped) }, { onConflict: "key,shared" });
    if (error) console.error(`report save failed for ${entry.sessionCode}:`, error.message);
  } catch (e) {
    console.error(`report computation failed for ${entry.sessionCode}:`, e?.message ?? e);
  }

  const { error: deleteErr } = await supabase.from("opl_kv").delete().eq("key", `${STORAGE_PREFIX}${entry.sessionCode}`).eq("shared", true);
  if (deleteErr) console.error(`live row delete failed for ${entry.sessionCode}:`, deleteErr.message);

  const nextIndexEntry = { ...entry, endedAt: Date.now(), status: "ended", endReason: endReasonText };
  const { error: indexErr } = await supabase
    .from("opl_kv")
    .update({ value: JSON.stringify(nextIndexEntry) })
    .eq("key", `${SESSION_INDEX_PREFIX}${entry.sessionCode}`)
    .eq("shared", true);
  if (indexErr) console.error(`index update failed for ${entry.sessionCode}:`, indexErr.message);
}

Deno.serve(async (req) => {
  // This function performs privileged, unattended writes (deleting live
  // session rows, ending sessions) and must NEVER be callable by anon. Only
  // a caller presenting the project's own service-role key is accepted —
  // the scheduled cron job configured in ../../sweep-cron-setup.sql sends
  // exactly that. A public/anon request is rejected outright.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL"), serviceKey);

  const { data: indexRows, error: indexErr } = await supabase
    .from("opl_kv")
    .select("key, value")
    .eq("shared", true)
    .like("key", `${SESSION_INDEX_PREFIX}%`);
  if (indexErr) {
    return new Response(JSON.stringify({ error: indexErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const activeEntries = [];
  for (const row of indexRows ?? []) {
    try {
      const entry = JSON.parse(row.value);
      if (entry?.status === "active" && entry?.sessionCode) activeEntries.push(entry);
    } catch {
      // unparseable index row — skip, never guessed active
    }
  }

  const endedCodes = [];
  const skipped = [];
  for (const entry of activeEntries) {
    const liveKey = `${STORAGE_PREFIX}${entry.sessionCode}`;
    let liveState;
    try {
      liveState = await readKv(supabase, liveKey);
    } catch (e) {
      // a transient read error must never end a session it couldn't verify
      skipped.push(entry.sessionCode);
      continue;
    }

    if (!liveState) {
      // orphaned index entry — the live session is already gone some other
      // way (e.g. a manual End Session or the client-side sweep beat this
      // run to it) — mark it ended so it isn't reprocessed forever.
      await endIndexOnly(supabase, entry, "Session data no longer available");
      endedCodes.push(entry.sessionCode);
      continue;
    }

    const firstReason = expirationReason(liveState, Date.now(), {
      maxAgeMs: SESSION_AUTO_END_AGE_MS,
      maxInactivityMs: SESSION_INACTIVITY_AGE_MS,
    });
    if (!firstReason || firstReason === "missing-session-data") continue; // current, or malformed — never guessed expired

    // Idempotency / Race Safety — the requirement most critical to this
    // scheduled (unattended) sweep: re-read the live row a SECOND time,
    // immediately before actually ending it, rather than trusting the read
    // from moments earlier in this same loop iteration. If a facilitator's
    // score submission, check-in, or a concurrently-running sweep landed in
    // between, that fresh read's lastActivityAt already reflects it, and
    // the session is correctly left alone — never incorrectly ended out
    // from under someone actively using it.
    let recheckState;
    try {
      recheckState = await readKv(supabase, liveKey);
    } catch (e) {
      skipped.push(entry.sessionCode);
      continue;
    }
    if (!recheckState) {
      // it was ended (by a manual End Session or a parallel sweep run)
      // between the two reads — nothing left to do here.
      continue;
    }
    const recheckReason = expirationReason(recheckState, Date.now(), {
      maxAgeMs: SESSION_AUTO_END_AGE_MS,
      maxInactivityMs: SESSION_INACTIVITY_AGE_MS,
    });
    if (!recheckReason || recheckReason === "missing-session-data") continue; // activity landed between reads — do NOT end it

    const endReasonText = recheckReason === "age" ? "Auto-ended — inactive 3+ days" : "Auto-ended — inactive 24h";
    await endExpiredSession(supabase, entry, recheckState, endReasonText);
    endedCodes.push(entry.sessionCode);
  }

  return new Response(JSON.stringify({ checked: activeEntries.length, ended: endedCodes, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function endIndexOnly(supabase, entry, endReasonText) {
  const nextIndexEntry = { ...entry, endedAt: Date.now(), status: "ended", endReason: endReasonText };
  const { error } = await supabase
    .from("opl_kv")
    .update({ value: JSON.stringify(nextIndexEntry) })
    .eq("key", `${SESSION_INDEX_PREFIX}${entry.sessionCode}`)
    .eq("shared", true);
  if (error) console.error(`index update failed for ${entry.sessionCode}:`, error.message);
}
