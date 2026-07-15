import { styles } from "../styles.js";
import CourtCard from "./CourtCard.jsx";
import QueueList from "./QueueList.jsx";
import SectionLabel from "./SectionLabel.jsx";

export default function BoardView({ state }) {
  return (
    <div>
      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard key={i} court={court} players={state.players} readOnly />
        ))}
      </div>
      <SectionLabel>Waiting queue</SectionLabel>
      <QueueList queueIds={state.queueIds} players={state.players} nextMatchups={state.nextMatchups || []} />
    </div>
  );
}
