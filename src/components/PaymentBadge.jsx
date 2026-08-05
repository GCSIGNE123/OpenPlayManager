import { styles } from "../styles.js";

// Player Payment Tracking — see PROJECT.md/FEATURES.md. Session-scoped
// only (never the Player Database): shows a compact "UP" (unpaid) or
// "P-C"/"P-GC" (paid, method) tag beside a checked-in player's name.
// `onSetPayment` omitted -> read-only compact tag (Standings, Court cards,
// Session Analytics player list — anywhere the screen isn't meant to
// mutate state, or space is tight). When provided: an unpaid player gets
// two one-click buttons (Cash/GCash) to mark them paid; an already-paid
// player's tag itself becomes a one-click toggle to correct a mistaken
// method (Cash <-> GCash) — the same `onSetPayment(id, method)` handler
// either way (see lib/queueManagement.js's setPlayerPayment).
export default function PaymentBadge({ player, onSetPayment }) {
  if (!player) return null;
  const paid = player.paymentStatus === "paid";
  const tagLabel = paid ? (player.paymentMethod === "gcash" ? "P-GC" : "P-C") : "UP";

  if (!onSetPayment) {
    return <span style={styles.paymentTag(paid)}>{tagLabel}</span>;
  }

  if (paid) {
    const otherMethod = player.paymentMethod === "gcash" ? "cash" : "gcash";
    return (
      <button
        style={styles.paymentTagButton(true)}
        onClick={() => onSetPayment(player.id, otherMethod)}
        title={`Tap to correct to ${otherMethod === "gcash" ? "GCash" : "Cash"}`}
      >
        {tagLabel}
      </button>
    );
  }

  return (
    <span style={styles.paymentButtonGroup}>
      <span style={styles.paymentTag(false)}>UP</span>
      <button
        style={styles.paymentQuickBtn}
        onClick={() => onSetPayment(player.id, "cash")}
        title={`Mark ${player.name} Paid (Cash)`}
      >
        Cash
      </button>
      <button
        style={styles.paymentQuickBtn}
        onClick={() => onSetPayment(player.id, "gcash")}
        title={`Mark ${player.name} Paid (GCash)`}
      >
        GCash
      </button>
    </span>
  );
}
