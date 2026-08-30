import { styles } from "../styles.js";

// Player Payment Tracking — see PROJECT.md/FEATURES.md. Session-scoped
// only (never the Player Database): shows a compact "UP" (unpaid) or
// "P-C"/"P-GC"/"P-OR" (paid, method) tag beside a checked-in player's name.
// `onSetPayment` omitted -> read-only compact tag (Standings, Court cards,
// Session Analytics player list — anywhere the screen isn't meant to
// mutate state, or space is tight). When provided: an unpaid player gets
// three one-click buttons (Cash/GCash/Organizer) to mark them paid; an
// already-paid player's tag itself cycles to the next method (Cash -> GCash
// -> Organizer -> Cash) to correct a mistaken method, plus a small "Unpaid"
// button to revert the whole payment for a mis-click — the same
// `onSetPayment(id, method)` handler for all of these, method being
// "cash"/"gcash"/"organizer"/"unpaid" (see lib/queueManagement.js's
// setPlayerPayment). Organizer means the organizer covered this player's
// Open Play participation — it's tracked as a paid method, same as
// Cash/GCash, per the approved decision; it introduces no separate
// liability/receivable accounting.
const METHOD_TAGS = { cash: "P-C", gcash: "P-GC", organizer: "P-OR" };
const NEXT_METHOD = { cash: "gcash", gcash: "organizer", organizer: "cash" };
const METHOD_NAMES = { cash: "Cash", gcash: "GCash", organizer: "Organizer" };

export default function PaymentBadge({ player, onSetPayment }) {
  if (!player) return null;
  const paid = player.paymentStatus === "paid";
  const tagLabel = paid ? METHOD_TAGS[player.paymentMethod] || "P-C" : "UP";

  if (!onSetPayment) {
    return <span style={styles.paymentTag(paid)}>{tagLabel}</span>;
  }

  if (paid) {
    const otherMethod = NEXT_METHOD[player.paymentMethod] || "cash";
    return (
      <span style={styles.paymentButtonGroup}>
        <button
          style={styles.paymentTagButton(true)}
          onClick={() => onSetPayment(player.id, otherMethod)}
          title={`Tap to correct to ${METHOD_NAMES[otherMethod]}`}
        >
          {tagLabel}
        </button>
        <button
          style={styles.paymentQuickBtn}
          onClick={() => onSetPayment(player.id, "unpaid")}
          title={`Undo — revert ${player.name} to Unpaid (mis-clicked payment)`}
        >
          Undo
        </button>
      </span>
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
      <button
        style={styles.paymentQuickBtn}
        onClick={() => onSetPayment(player.id, "organizer")}
        title={`Mark ${player.name} Paid (Organizer)`}
      >
        Organizer
      </button>
    </span>
  );
}
