// CheckInScannerModal's Camera Scanner acquisition lifecycle — a small,
// explicit state machine kept separate from React so its transitions can
// be tested headlessly. This governs ONLY "is the camera being
// requested/running," never the outcome of a completed scan (see
// CheckInScannerModal.jsx's `result` state for that) and never anything
// about USB mode (which never touches this machine at all).
//
// idle:     camera not requested, nothing running — the modal's default
//           on open and whenever Camera Scanner mode is (re)entered.
// starting: "Start Scanning"/"Try Again" was pressed — challenge mint and
//           getUserMedia() are in flight.
// active:   stream acquired, video playing, tick() polling for a QR code.
// error:    challenge mint or getUserMedia failed — `error` holds the
//           message to display.
//
// The one hard rule this file exists to make testable: nothing but a
// START_SCANNING action can ever lead toward `active` — mounting the
// modal, or switching modes, only ever dispatches RESET.
export const CAMERA_IDLE = "idle";
export const CAMERA_STARTING = "starting";
export const CAMERA_ACTIVE = "active";
export const CAMERA_ERROR = "error";

export function initialCameraLifecycle() {
  return { state: CAMERA_IDLE, error: "" };
}

export function cameraLifecycleReducer(current, action) {
  switch (action.type) {
    case "START_SCANNING":
      return { state: CAMERA_STARTING, error: "" };
    case "STREAM_ACQUIRED":
      return { state: CAMERA_ACTIVE, error: "" };
    case "FAILED":
      return { state: CAMERA_ERROR, error: action.message || "Couldn't access the camera. Check your browser's camera permission." };
    case "RESET":
      return { state: CAMERA_IDLE, error: "" };
    default:
      return current;
  }
}

// Camera Preview Regression fix — see CheckInScannerModal.jsx's
// startCameraStream. Pure mapping from a getUserMedia() rejection's
// standard DOMException `.name` (see MDN's MediaDevices.getUserMedia()
// exceptions list) to a clear, human-readable message — kept separate
// from the component so it's directly unit-testable without a real
// browser/camera. An unrecognized/missing name falls back to the same
// generic message this app has always shown, never a raw technical error
// string.
export function mapCameraError(error) {
  const name = error?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device. Use USB QR Scanner instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera couldn't be started — it may already be in use by another app.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This device's camera doesn't support the requested settings.";
  }
  return "Couldn't access the camera. Check your browser's camera permission.";
}

// Upfront support check — true only when this browser exposes the real
// getUserMedia API at all (some older/non-HTTPS contexts don't expose
// `navigator.mediaDevices`, or expose it without getUserMedia). Checked
// BEFORE ever attempting to request the camera, so an unsupported
// browser gets a clear, specific message instead of whatever generic
// exception calling a missing function happens to throw.
export function isCameraSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices) && typeof navigator.mediaDevices.getUserMedia === "function";
}
