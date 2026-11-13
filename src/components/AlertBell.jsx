import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Check, X } from "lucide-react";
import { styles } from "../styles.js";
import { computeAlerts, unseenAlerts, ALERT_KINDS } from "../lib/alerts.js";
import { useNow } from "../lib/useNow.js";

// Organizer Alerts — the notification bell in the Scorer tab's Session
// Information header. See lib/alerts.js for WHAT is alerted (pure,
// tested); this component only decides how to show it:
//
//   - red badge = number of alerts the organizer hasn't opened yet;
//   - a short two-tone chime when a NEW alert id appears (Web Audio, no
//     asset file, created lazily on first use so browsers that require a
//     user gesture for audio get one — the Scorer is tapping all session);
//   - mute toggle (per device, localStorage) and "Mark all read";
//   - "seen" ids are remembered per device + session (localStorage) so a
//     page refresh doesn't ring every existing alert again.
//
// Alerts are derived, never stored in the session record, and the clock
// ticks every 30 s (lib/useNow.js) so the "waited 15 min" alert fires on
// time even between session events.

const SOUND_KEY = "opl-alert-sound";
const seenKey = (code) => `opl-alert-seen-${code || "session"}`;

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the bell still works, it just forgets on refresh */
  }
}

// Two-tone chime, ~0.35 s. Returns false when audio isn't available so the
// caller can ignore it quietly.
export function playChime(ctxRef) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.16]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.24);
    });
    return true;
  } catch {
    return false;
  }
}

export default function AlertBell({ state }) {
  const now = useNow(30000);
  const alerts = useMemo(() => computeAlerts(state, now), [state, now]);
  // The session record carries no code; sessionStartedAt is unique per
  // session and is enough to scope the per-device "seen" memory.
  const code = state?.sessionCode || state?.sessionStartedAt || "";
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => (typeof window === "undefined" ? true : readJson(SOUND_KEY, true)));
  const [seenIds, setSeenIds] = useState(() => (typeof window === "undefined" ? [] : readJson(seenKey(code), [])));
  const rungRef = useRef(null); // ids we've already chimed for this page load
  const ctxRef = useRef(null);
  const wrapRef = useRef(null);

  const unseen = unseenAlerts(alerts, seenIds);

  // Chime once per NEW alert id (not on first paint — those are "existing").
  useEffect(() => {
    const ids = alerts.map((a) => a.id);
    if (rungRef.current === null) {
      rungRef.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !rungRef.current.has(id));
    ids.forEach((id) => rungRef.current.add(id));
    if (fresh.length > 0 && soundOn) playChime(ctxRef);
  }, [alerts, soundOn]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const markAllRead = () => {
    const ids = alerts.map((a) => a.id);
    setSeenIds(ids);
    writeJson(seenKey(code), ids);
  };
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    writeJson(SOUND_KEY, next);
    if (next) playChime(ctxRef); // audible confirmation + unlocks audio on this gesture
  };

  return (
    <div style={styles.alertBellWrap} ref={wrapRef} data-testid="alert-bell">
      <button
        style={styles.alertBellBtn(unseen.length > 0)}
        onClick={toggleOpen}
        title={alerts.length === 0 ? "No alerts" : `${alerts.length} alert${alerts.length === 1 ? "" : "s"}${unseen.length ? ` (${unseen.length} new)` : ""}`}
        aria-label="Alerts"
      >
        <Bell size={16} strokeWidth={2.5} />
        {unseen.length > 0 && (
          <span style={styles.alertBadge} data-testid="alert-badge">
            {unseen.length > 9 ? "9+" : unseen.length}
          </span>
        )}
      </button>
      {open && (
        <div style={styles.alertPanel} role="dialog" aria-label="Alerts">
          <div style={styles.alertPanelHead}>
            <span style={styles.alertPanelTitle}>Alerts</span>
            <span style={styles.alertPanelActions}>
              <button style={styles.alertIconBtn} onClick={toggleSound} title={soundOn ? "Sound on — click to mute" : "Muted — click to turn sound on"}>
                {soundOn ? <Bell size={13} strokeWidth={2.5} /> : <BellOff size={13} strokeWidth={2.5} />}
                {soundOn ? "Sound on" : "Muted"}
              </button>
              <button style={styles.alertIconBtn} onClick={() => setOpen(false)} aria-label="Close alerts">
                <X size={13} strokeWidth={3} />
              </button>
            </span>
          </div>
          {alerts.length === 0 ? (
            <div style={styles.alertEmpty}>
              <Check size={14} strokeWidth={3} /> All clear — no waits over 15 min, no repeat foursomes, fixed pairs together, nobody 2+ games behind.
            </div>
          ) : (
            <ul style={styles.alertList}>
              {alerts.map((a) => (
                <li key={a.id} style={styles.alertItem(a.severity)} data-kind={a.kind}>
                  <span style={styles.alertKind(a.severity)}>{ALERT_KINDS[a.kind]?.label || a.kind}</span>
                  <span style={styles.alertTitle}>{a.title}</span>
                  {a.detail && <span style={styles.alertDetail}>{a.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <div style={styles.alertFoot}>
            Checks every 30 s: waits of 15+ min · same four queued again · fixed pair split · a waiting player 2+ games behind someone on court or queued.
          </div>
        </div>
      )}
    </div>
  );
}
