import { useEffect, useState } from "react";
import { Lock, Pencil, Save, X } from "lucide-react";
import { styles } from "../styles.js";
import { TournamentRulesService } from "../engines/TournamentRulesService.js";
import { deriveSettingsView, MATCH_FORMATS, PLAYOFF_STAGES, SEEDING_METHODS, QUALIFICATION_METHODS, WILD_CARD_COUNTS, PLACEMENT_MATCHES_METHODS } from "../engines/TournamentSettings.js";
import { BUILT_IN_MEMBERSHIP_PLANS } from "../lib/membershipPlans.js";
import SectionLabel from "./SectionLabel.jsx";

const rulesService = new TournamentRulesService();

const ASSIGNMENT_METHODS = [{ value: "random", label: "Random" }]; // implemented; Manual/Snake Seeding are placeholders below

const PHASE_LABELS = {
  notStarted: "Not started — every setting is editable.",
  poolPlayStarted: "Pool play has started — Tournament Format, Number of Pools, and Pool Assignment Method are locked.",
  playoffsStarted: "Playoffs have started — all structural settings are locked. Only Tournament Name and Court Names remain editable.",
};

// A single field's chrome: label + either the editable control (children)
// or, when locked, a disabled-looking readout with a lock icon and the
// reason. Locking is never a separate flag to keep in sync — it's just
// `locked.has(fieldKey)`, recomputed fresh from the tournament's own
// pool/bracket status every render (see TournamentRulesService.getPhase).
function SettingRow({ label, fieldKey, locked, hint, children }) {
  return (
    <label style={styles.settingsField}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        {locked.has(fieldKey) && <Lock size={11} strokeWidth={2.5} color="var(--color-text-faint)" />}
      </span>
      {children}
      {hint && <span style={styles.editHint}>{hint}</span>}
    </label>
  );
}

function CourtNameRow({ court, locked, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(court.name);
  if (locked) {
    return (
      <div style={styles.queueListItem}>
        <span>
          <Lock size={11} strokeWidth={2.5} style={{ marginRight: 5, verticalAlign: "text-bottom" }} />
          {court.name}
        </span>
      </div>
    );
  }
  return (
    <div style={styles.queueListItem}>
      {editing ? (
        <>
          <input style={{ ...styles.input, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" style={styles.secondaryBtn} onClick={() => setEditing(false)}>
              <X size={13} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => {
                onRename(court.id, name.trim() || court.name);
                setEditing(false);
              }}
            >
              <Save size={13} strokeWidth={2.5} />
            </button>
          </span>
        </>
      ) : (
        <>
          <span>{court.name}</span>
          <button type="button" style={styles.secondaryBtn} onClick={() => setEditing(true)}>
            <Pencil size={13} strokeWidth={2.5} />
          </button>
        </>
      )}
    </div>
  );
}

// Tournament Settings — see PROJECT.md's Tournament Settings section. A
// consolidated place to view/edit configuration a tournament was created
// with, without the heavy-handed "Regenerate schedule" the Schedule tab
// otherwise requires for any change. Every field maps directly onto the
// tournament record's own existing top-level fields (see
// TournamentSettings.js's header comment) — this view never introduces a
// parallel settings copy that could drift out of sync.
export default function TournamentSettingsView({ tournament, loading, settingsError, onSave, onRenameCourt }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (tournament) setDraft(deriveSettingsView(tournament));
  }, [tournament?.id, tournament?.updatedAt]);

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament || !draft) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to manage settings here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Settings aren't available for this tournament format yet.</div>;
  }

  const locked = rulesService.getLockedFields(tournament);
  const phase = rulesService.getPhase(tournament);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setScoring = (key, value) => setDraft((d) => ({ ...d, matchScoringRules: { ...d.matchScoringRules, [key]: value } }));
  const setEligibility = (key, value) => setDraft((d) => ({ ...d, eligibilityRequirements: { ...d.eligibilityRequirements, [key]: value } }));

  const save = () => {
    const changes = {};
    if (draft.name !== tournament.name) changes.name = draft.name;
    if (!locked.has("mode") && draft.mode !== tournament.mode) changes.mode = draft.mode;
    if (!locked.has("format") && draft.format !== tournament.format) changes.format = draft.format;
    if (!locked.has("poolCount") && draft.poolCount !== tournament.poolCount) changes.poolCount = draft.poolCount;
    if (!locked.has("assignmentMethod") && draft.assignmentMethod !== tournament.assignmentMethod) changes.assignmentMethod = draft.assignmentMethod;
    if (!locked.has("advancesPerPool") && draft.advancesPerPool !== tournament.advancesPerPool) changes.advancesPerPool = draft.advancesPerPool;
    if (!locked.has("playoffEnabled") && draft.playoffEnabled !== (tournament.playoffEnabled ?? true)) changes.playoffEnabled = draft.playoffEnabled;
    if (!locked.has("autoDetectPlayoffStage") && draft.autoDetectPlayoffStage !== (tournament.autoDetectPlayoffStage ?? true))
      changes.autoDetectPlayoffStage = draft.autoDetectPlayoffStage;
    if (!locked.has("manualPlayoffStage") && draft.manualPlayoffStage !== (tournament.manualPlayoffStage ?? null))
      changes.manualPlayoffStage = draft.manualPlayoffStage;
    if (!locked.has("bronzeMatchEnabled") && draft.bronzeMatchEnabled !== (tournament.bronzeMatchEnabled ?? false))
      changes.bronzeMatchEnabled = draft.bronzeMatchEnabled;
    if (!locked.has("placementMatches") && draft.placementMatches !== (tournament.placementMatches ?? "disabled"))
      changes.placementMatches = draft.placementMatches;
    if (!locked.has("seedingMethod") && draft.seedingMethod !== (tournament.seedingMethod ?? "standardCrossPool"))
      changes.seedingMethod = draft.seedingMethod;
    if (!locked.has("qualificationMethod") && draft.qualificationMethod !== (tournament.qualificationMethod ?? "standard"))
      changes.qualificationMethod = draft.qualificationMethod;
    if (!locked.has("wildCardCount") && draft.wildCardCount !== (tournament.wildCardCount ?? 1)) changes.wildCardCount = draft.wildCardCount;
    if (!locked.has("bestThirdPlaceCount") && draft.bestThirdPlaceCount !== (tournament.bestThirdPlaceCount ?? 1))
      changes.bestThirdPlaceCount = draft.bestThirdPlaceCount;
    if (!locked.has("allowManualQualificationOverride") && draft.allowManualQualificationOverride !== (tournament.allowManualQualificationOverride ?? false))
      changes.allowManualQualificationOverride = draft.allowManualQualificationOverride;
    if (!locked.has("matchScoringRules") && JSON.stringify(draft.matchScoringRules) !== JSON.stringify(tournament.matchScoringRules)) {
      changes.matchScoringRules = draft.matchScoringRules;
    }
    if (JSON.stringify(draft.eligibilityRequirements) !== JSON.stringify(tournament.eligibilityRequirements)) {
      changes.eligibilityRequirements = draft.eligibilityRequirements;
    }
    if (Object.keys(changes).length > 0) onSave(changes);
  };

  return (
    <div>
      <SectionLabel>Tournament Settings</SectionLabel>
      <p style={styles.editHint}>{PHASE_LABELS[phase]}</p>
      {settingsError && <p style={styles.editWarning}>{settingsError}</p>}

      <h3 style={styles.poolHeading}>General Settings</h3>
      <div style={styles.settingsPanel}>
        <SettingRow label="Tournament name" fieldKey="name" locked={locked}>
          <input style={styles.input} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </SettingRow>
        <SettingRow label="Event type" fieldKey="mode" locked={locked}>
          <div style={styles.skillToggle}>
            <button type="button" disabled={locked.has("mode")} style={styles.skillToggleBtn(draft.mode === "singles")} onClick={() => set("mode", "singles")}>
              Singles
            </button>
            <button type="button" disabled={locked.has("mode")} style={styles.skillToggleBtn(draft.mode === "doubles")} onClick={() => set("mode", "doubles")}>
              Doubles
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Tournament format" fieldKey="format" locked={locked}>
          <select style={styles.rotationSelect} disabled={locked.has("format")} value={draft.format} onChange={(e) => set("format", e.target.value)}>
            <option value="roundRobin">Round Robin</option>
            <option value="singleElimination">Single Elimination</option>
            <option value="doubleElimination">Double Elimination</option>
          </select>
        </SettingRow>
        <SettingRow
          label="Number of courts"
          fieldKey="courtsCount"
          locked={locked}
          hint={locked.has("courtsCount") ? "Use the Courts tab to add or remove courts once the tournament has started." : undefined}
        >
          <span style={styles.sessionInfoValue}>{draft.courtsCount}</span>
        </SettingRow>
      </div>

      <h3 style={styles.poolHeading}>Court Names</h3>
      <div>
        {draft.courts.map((court) => (
          <CourtNameRow key={court.id} court={court} locked={false} onRename={onRenameCourt} />
        ))}
      </div>

      <h3 style={styles.poolHeading}>Pool Settings</h3>
      <div style={styles.settingsPanel}>
        <SettingRow label="Number of pools" fieldKey="poolCount" locked={locked}>
          <input type="number" min={1} disabled={locked.has("poolCount")} style={styles.expectedGamesInput} value={draft.poolCount} onChange={(e) => set("poolCount", Number(e.target.value) || 1)} />
        </SettingRow>
        <SettingRow label="Pool assignment method" fieldKey="assignmentMethod" locked={locked}>
          <select style={styles.rotationSelect} disabled={locked.has("assignmentMethod")} value={draft.assignmentMethod} onChange={(e) => set("assignmentMethod", e.target.value)}>
            {ASSIGNMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="manual" disabled>
              Manual (placeholder)
            </option>
            <option value="snake" disabled>
              Snake Seeding (placeholder)
            </option>
          </select>
        </SettingRow>
        <SettingRow label="Teams advancing per pool" fieldKey="advancesPerPool" locked={locked}>
          <input
            type="number"
            min={1}
            disabled={locked.has("advancesPerPool")}
            style={styles.expectedGamesInput}
            value={draft.advancesPerPool}
            onChange={(e) => set("advancesPerPool", Number(e.target.value) || 1)}
          />
        </SettingRow>
        <SettingRow
          label="Qualification method"
          fieldKey="qualificationMethod"
          locked={locked}
          hint="Wild Cards/Best Third Place add extra qualifiers beyond Teams Advancing Per Pool, ranked using the same standings and tie-breakers."
        >
          <select
            style={styles.rotationSelect}
            disabled={locked.has("qualificationMethod")}
            value={draft.qualificationMethod}
            onChange={(e) => set("qualificationMethod", e.target.value)}
          >
            {QUALIFICATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </SettingRow>
        {draft.qualificationMethod === "wildCard" && (
          <SettingRow label="Wild card count" fieldKey="wildCardCount" locked={locked}>
            <select
              style={styles.rotationSelect}
              disabled={locked.has("wildCardCount")}
              value={draft.wildCardCount}
              onChange={(e) => set("wildCardCount", Number(e.target.value))}
            >
              {WILD_CARD_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
        {draft.qualificationMethod === "bestThirdPlace" && (
          <SettingRow
            label="Best third place count"
            fieldKey="bestThirdPlaceCount"
            locked={locked}
            hint={`Can't exceed the number of pools (${draft.poolCount}) — only one 3rd-place finisher per pool.`}
          >
            <input
              type="number"
              min={1}
              max={draft.poolCount}
              disabled={locked.has("bestThirdPlaceCount")}
              style={styles.expectedGamesInput}
              value={draft.bestThirdPlaceCount}
              onChange={(e) => set("bestThirdPlaceCount", Number(e.target.value) || 1)}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Allow manual qualification override"
          fieldKey="allowManualQualificationOverride"
          locked={locked}
          hint="When enabled, directors can promote/eliminate/replace qualifiers on the Qualification tab before generating the bracket — every change is logged with a required reason."
        >
          <div style={styles.skillToggle}>
            <button
              type="button"
              disabled={locked.has("allowManualQualificationOverride")}
              style={styles.skillToggleBtn(draft.allowManualQualificationOverride)}
              onClick={() => set("allowManualQualificationOverride", true)}
            >
              Enabled
            </button>
            <button
              type="button"
              disabled={locked.has("allowManualQualificationOverride")}
              style={styles.skillToggleBtn(!draft.allowManualQualificationOverride)}
              onClick={() => set("allowManualQualificationOverride", false)}
            >
              Disabled
            </button>
          </div>
        </SettingRow>
      </div>

      <h3 style={styles.poolHeading}>Playoff Settings</h3>
      <p style={styles.editHint}>Playoff Enabled controls whether a bracket is generated. Everything else here is reference only — not yet enforced.</p>
      <div style={styles.settingsPanel}>
        <SettingRow label="Playoff enabled" fieldKey="playoffEnabled" locked={locked}>
          <div style={styles.skillToggle}>
            <button type="button" disabled={locked.has("playoffEnabled")} style={styles.skillToggleBtn(draft.playoffEnabled)} onClick={() => set("playoffEnabled", true)}>
              Yes
            </button>
            <button type="button" disabled={locked.has("playoffEnabled")} style={styles.skillToggleBtn(!draft.playoffEnabled)} onClick={() => set("playoffEnabled", false)}>
              No
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="Seeding method"
          fieldKey="seedingMethod"
          locked={locked}
          hint={draft.seedingMethod !== "standardCrossPool" ? "Non-default methods don't auto-generate the bracket — use the Seeding tab once qualification is ready." : undefined}
        >
          <select style={styles.rotationSelect} disabled={locked.has("seedingMethod")} value={draft.seedingMethod} onChange={(e) => set("seedingMethod", e.target.value)}>
            {SEEDING_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Bronze Medal Match" fieldKey="bronzeMatchEnabled" locked={locked} hint="When enabled, semifinal losers play for 3rd/4th place, generated alongside the bracket.">
          <div style={styles.skillToggle}>
            <button
              type="button"
              disabled={locked.has("bronzeMatchEnabled")}
              style={styles.skillToggleBtn(draft.bronzeMatchEnabled)}
              onClick={() => set("bronzeMatchEnabled", true)}
            >
              Enabled
            </button>
            <button
              type="button"
              disabled={locked.has("bronzeMatchEnabled")}
              style={styles.skillToggleBtn(!draft.bronzeMatchEnabled)}
              onClick={() => set("bronzeMatchEnabled", false)}
            >
              Disabled
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="Placement Matches"
          fieldKey="placementMatches"
          locked={locked}
          hint="When set to Consolation Bracket or Full Placement Bracket, first-round playoff losers play on for 5th-8th place, generated alongside the championship bracket."
        >
          <select style={styles.rotationSelect} disabled={locked.has("placementMatches")} value={draft.placementMatches} onChange={(e) => set("placementMatches", e.target.value)}>
            {PLACEMENT_MATCHES_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Auto-detect playoff stage" fieldKey="autoDetectPlayoffStage" locked={locked}>
          <div style={styles.skillToggle}>
            <button
              type="button"
              disabled={locked.has("autoDetectPlayoffStage")}
              style={styles.skillToggleBtn(draft.autoDetectPlayoffStage)}
              onClick={() => set("autoDetectPlayoffStage", true)}
            >
              On
            </button>
            <button
              type="button"
              disabled={locked.has("autoDetectPlayoffStage")}
              style={styles.skillToggleBtn(!draft.autoDetectPlayoffStage)}
              onClick={() => set("autoDetectPlayoffStage", false)}
            >
              Off
            </button>
          </div>
        </SettingRow>
        {!draft.autoDetectPlayoffStage && (
          <SettingRow label="Manual playoff stage" fieldKey="manualPlayoffStage" locked={locked}>
            <select
              style={styles.rotationSelect}
              disabled={locked.has("manualPlayoffStage")}
              value={draft.manualPlayoffStage || ""}
              onChange={(e) => set("manualPlayoffStage", e.target.value)}
            >
              <option value="" disabled>
                Select a stage…
              </option>
              {PLAYOFF_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
      </div>

      <h3 style={styles.poolHeading}>Match Rules</h3>
      <p style={styles.editHint}>
        Winning score/win-by-two are reference only, not enforced. Match Format is real for the Championship
        Match specifically: Best of 3 makes the Final a series (won by whoever wins 2 games first); every other
        match still ignores this setting.
      </p>
      <div style={styles.settingsPanel}>
        <SettingRow label="Match format" fieldKey="matchScoringRules" locked={locked}>
          <select
            style={styles.rotationSelect}
            disabled={locked.has("matchScoringRules")}
            value={draft.matchScoringRules.matchFormat}
            onChange={(e) => setScoring("matchFormat", e.target.value)}
          >
            {MATCH_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Winning score" fieldKey="matchScoringRules" locked={locked}>
          <input
            type="number"
            min={1}
            disabled={locked.has("matchScoringRules")}
            style={styles.expectedGamesInput}
            value={draft.matchScoringRules.winningScore}
            onChange={(e) => setScoring("winningScore", Number(e.target.value) || 1)}
          />
        </SettingRow>
        <SettingRow label="Win by two" fieldKey="matchScoringRules" locked={locked}>
          <div style={styles.skillToggle}>
            <button
              type="button"
              disabled={locked.has("matchScoringRules")}
              style={styles.skillToggleBtn(draft.matchScoringRules.winByTwo)}
              onClick={() => setScoring("winByTwo", true)}
            >
              On
            </button>
            <button
              type="button"
              disabled={locked.has("matchScoringRules")}
              style={styles.skillToggleBtn(!draft.matchScoringRules.winByTwo)}
              onClick={() => setScoring("winByTwo", false)}
            >
              Off
            </button>
          </div>
        </SettingRow>
      </div>

      <h3 style={styles.poolHeading}>Membership Eligibility</h3>
      <p style={styles.editHint}>Captured for reference — not enforced against the roster here yet (see Membership Management).</p>
      <div style={styles.settingsPanel}>
        <label style={styles.settingsField}>
          Guest access allowed
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(draft.eligibilityRequirements.allowGuests)} onClick={() => setEligibility("allowGuests", true)}>
              On
            </button>
            <button type="button" style={styles.skillToggleBtn(!draft.eligibilityRequirements.allowGuests)} onClick={() => setEligibility("allowGuests", false)}>
              Off
            </button>
          </div>
        </label>
        <label style={styles.settingsField}>
          Require active membership
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(draft.eligibilityRequirements.requireActiveMembership)} onClick={() => setEligibility("requireActiveMembership", true)}>
              Yes
            </button>
            <button type="button" style={styles.skillToggleBtn(!draft.eligibilityRequirements.requireActiveMembership)} onClick={() => setEligibility("requireActiveMembership", false)}>
              No
            </button>
          </div>
        </label>
        <label style={styles.settingsField}>
          Required plan
          <select style={styles.rotationSelect} value={draft.eligibilityRequirements.requiredPlanId || ""} onChange={(e) => setEligibility("requiredPlanId", e.target.value || null)}>
            <option value="">Any plan</option>
            {BUILT_IN_MEMBERSHIP_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={styles.editActions}>
        <button type="button" style={styles.primaryBtn} onClick={save}>
          <Save size={14} strokeWidth={2.5} />
          Save changes
        </button>
      </div>
    </div>
  );
}
