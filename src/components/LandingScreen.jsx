import { LogIn, Plus } from "lucide-react";
import { styles } from "../styles.js";
import { APP_NAME, TAGLINE, FOOTER_TEXT } from "../lib/brand.js";

export default function LandingScreen({ onCreate, onAdmin, onDeveloper, onTemplates, onPlayerPortal, onLeagues, onMembership, onRatings, joinCode, setJoinCode, handleJoin, joinError, joining }) {
  return (
    <div style={styles.landingWrap}>
      <div style={styles.landingHero}>
        <div style={styles.kicker}>ORMOC CITY, LEYTE</div>
        <h1 style={styles.landingTitle}>{APP_NAME}</h1>
        <p style={styles.landingSub}>{TAGLINE}</p>
      </div>
      <div style={styles.landingCards}>
        <div style={styles.landingCard}>
          <h2 style={styles.landingCardTitle}>Start a new session</h2>
          <p style={styles.landingCardText}>
            You'll need an access code from your organizer to set one up.
          </p>
          <button style={styles.primaryBtn} onClick={onCreate}>
            <Plus size={16} strokeWidth={2.5} />
            Create session
          </button>
        </div>
        <div style={styles.landingCard}>
          <h2 style={styles.landingCardTitle}>Join a session</h2>
          <p style={styles.landingCardText}>Enter the 6-character code shared by your session organizer.</p>
          <div style={styles.checkinRow}>
            <input
              style={{ ...styles.input, ...styles.codeInput }}
              placeholder="ABC123"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              style={{ ...styles.primaryBtn, ...(joining ? styles.btnDisabled : {}) }}
              onClick={handleJoin}
              disabled={joining}
            >
              <LogIn size={16} strokeWidth={2.5} />
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {joinError && <div style={styles.pinError}>{joinError}</div>}
        </div>
      </div>
      <button style={styles.adminLink} onClick={onAdmin}>
        Organizer? Manage access codes →
      </button>
      <button style={styles.adminLink} onClick={onTemplates}>
        Manage tournament templates →
      </button>
      <button style={styles.adminLink} onClick={onPlayerPortal}>
        Player Portal? Look up your matches →
      </button>
      <button style={styles.adminLink} onClick={onLeagues}>
        Manage leagues →
      </button>
      <button style={styles.adminLink} onClick={onMembership}>
        Manage memberships →
      </button>
      <button style={styles.adminLink} onClick={onRatings}>
        View club rankings →
      </button>
      <button style={styles.adminLink} onClick={onDeveloper}>
        Developer? Run the rotation simulator →
      </button>
      <footer style={styles.footer}>{FOOTER_TEXT}</footer>
    </div>
  );
}
