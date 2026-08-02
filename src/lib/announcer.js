// Smart Court Dispatch — Voice Announcements. Thin, browser-only wrapper
// around the native SpeechSynthesis API — no external service required.
// buildAnnouncementText is pure/testable; speakAnnouncement and
// emitDispatchEvent are the only two places in the app that touch
// window.speechSynthesis / window.dispatchEvent, so every caller
// (automatic dispatch, Repeat Announcement) produces an identical
// announcement the same way.
export function buildAnnouncementText(courtNumber, teamANames, teamBNames) {
  const [a, b] = teamANames || [];
  const [c, d] = teamBNames || [];
  return `Court ${courtNumber}. ${a} and ${b}, versus ${c} and ${d}. Please proceed to Court ${courtNumber}.`;
}

// Fires `onDone(result)` exactly once — "completed" (speech finished
// normally), "muted" (voiceEnabled is off), or "skipped" (voice is
// enabled, but this browser doesn't support/couldn't use SpeechSynthesis).
// Dispatch (court assignment) NEVER depends on this succeeding — by the
// time this is ever called, the court has already been assigned and
// saved (see PickleballOpenPlay.jsx's save()); this only decides what to
// log and, if Auto Start Match is on, when the court is allowed to move
// from "dispatching" to "live".
export function speakAnnouncement(text, { voiceEnabled = true, volume = 1, rate = 1, voiceURI } = {}, onDone) {
  if (!voiceEnabled) {
    onDone?.("muted");
    return;
  }
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    onDone?.("skipped");
    return;
  }
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume;
    utterance.rate = rate;
    if (voiceURI) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => onDone?.("completed");
    utterance.onerror = () => onDone?.("skipped");
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    onDone?.("skipped");
  }
}

// TV Mode Integration — see PROJECT.md/FEATURES.md. Plain browser
// CustomEvents so TV Mode (or anything else) can subscribe later without
// this module knowing anything about TV Mode's rendering. No animation or
// visual behavior is implemented by this sprint — this only fires the
// events; nothing currently listens.
export const DISPATCH_EVENTS = {
  COURT_ASSIGNED: "courtDispatch:CourtAssigned",
  ANNOUNCEMENT_STARTED: "courtDispatch:AnnouncementStarted",
  ANNOUNCEMENT_COMPLETED: "courtDispatch:AnnouncementCompleted",
};

export function emitDispatchEvent(name, detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
