import { styles } from "../styles.js";
import PaymentBadge from "./PaymentBadge.jsx";
import SectionLabel from "./SectionLabel.jsx";

// Dedicated Payment tab — see PROJECT.md/FEATURES.md. ALL payment
// management now lives here instead of the Scorer tab: every checked-in
// player (regardless of queue status — waiting, upcoming, playing, held, or
// already checked out; payment is independent of match participation),
// alphabetical, each with the exact same PaymentBadge (`Cash`/`GCash`/
// `Undo`) the Scorer tab used to render inline — same component, same
// `setPlayerPayment` handler, so behavior is byte-for-byte identical, only
// its location moved. Read-only stats (Total Players/Paid/Unpaid/Cash/
// GCash) reuse `derivePaymentStats` exactly as the old Scorer stats panel
// and the Session Analytics Payment Summary already do — this view adds no
// new calculation.
export default function PaymentView({ players, onSetPayment, paymentStats }) {
  const checkedIn = Object.values(players || {})
    .filter((p) => p.checkedIn)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <SectionLabel>Payment</SectionLabel>
      {checkedIn.length === 0 ? (
        <p style={styles.editWarning}>No players checked in yet.</p>
      ) : (
        <ul style={styles.rosterList}>
          {checkedIn.map((p, i) => (
            <li key={p.id} style={styles.rosterItem}>
              <span style={styles.playerChipIndex}>{i + 1}</span>
              <span style={{ ...styles.queueName, ...styles.teamNameProminent }}>{p.name}</span>
              <PaymentBadge player={p} onSetPayment={onSetPayment} />
            </li>
          ))}
        </ul>
      )}

      {paymentStats && (
        <div style={styles.paymentStatsPanel}>
          <span style={styles.paymentStatsItem}>
            Total Players: <strong>{paymentStats.totalPlayers}</strong>
          </span>
          <span style={styles.paymentStatsItem}>
            Paid: <strong>{paymentStats.paid}</strong>
          </span>
          <span style={styles.paymentStatsItem}>
            Unpaid: <strong>{paymentStats.unpaid}</strong>
          </span>
          <span style={styles.paymentStatsItem}>
            Cash: <strong>{paymentStats.cash}</strong>
          </span>
          <span style={styles.paymentStatsItem}>
            GCash: <strong>{paymentStats.gcash}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
