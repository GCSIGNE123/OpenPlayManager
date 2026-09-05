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
