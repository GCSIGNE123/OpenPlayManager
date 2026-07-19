import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { styles } from "../styles.js";
import { SKILL_DIVISIONS } from "../lib/constants.js";
import { fetchAllLeagues, saveLeague, makeLeague, fetchSeasonsForLeague, fetchLeagueSeason } from "../lib/leagueModel.js";
import { buildAndSaveLeagueSeason, saveLeagueMatchStart, saveLeagueMatchResult, saveSwapWeekMatches } from "../lib/league.js";
import { fetchAllPlayers } from "../lib/playerDatabase.js";
import { fetchAllMembershipPlans } from "../lib/membershipPlans.js";
import { defaultEligibilityRequirements } from "../engines/TournamentSettings.js";
import { MembershipService } from "../engines/MembershipService.js";
import SectionLabel from "./SectionLabel.jsx";
import LeagueSeasonDashboardView from "./LeagueSeasonDashboardView.jsx";

const membershipService = new MembershipService();

// One division draft in the New Season form: a name (defaults to one of
// the 4 suggested SKILL_DIVISIONS, or any custom text — "future divisions
// configurable" per the spec just means any label works here) plus a set
// of selected player ids from the Player Database.
//
// This is the one place this task wires MembershipService.validateEligibility
// into a live block — see PROJECT.md's Membership Management section for
// why Tournament Settings only captures the same requirements without
// enforcing them here too. Adding an ineligible player is refused with the
// service's own reason string, not silently allowed.
function DivisionEditor({ division, onChange, onRemove, allPlayers, membershipPlans, eligibilityRequirements }) {
  const [blockedMessage, setBlockedMessage] = useState(null);

  const togglePlayer = (player) => {
    const alreadyIn = division.playerIds.includes(player.id);
    if (!alreadyIn) {
      const { eligible, reason } = membershipService.validateEligibility(player, eligibilityRequirements);
      if (!eligible) {
        setBlockedMessage(`${player.displayName}: ${reason}`);
        return;
      }
    }
    setBlockedMessage(null);
    onChange({
      ...division,
      playerIds: alreadyIn ? division.playerIds.filter((p) => p !== player.id) : [...division.playerIds, player.id],
    });
  };

  return (
    <div style={styles.tournamentSetupCard}>
      <div style={styles.checkinRow}>
        <input
          style={styles.input}
          value={division.name}
          onChange={(e) => onChange({ ...division, name: e.target.value })}
        />
        <button type="button" style={styles.secondaryBtn} onClick={onRemove}>
          Remove
        </button>
      </div>
      <p style={styles.editHint}>{division.playerIds.length} player(s) selected</p>
      {blockedMessage && <p style={styles.editWarning}>{blockedMessage}</p>}
      <ul style={styles.qualifiersList}>
        {allPlayers.map((p) => (
          <li key={p.id} style={styles.qualifiersListItem}>
            <span>{p.displayName}</span>
            <button
              type="button"
              style={division.playerIds.includes(p.id) ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => togglePlayer(p)}
            >
              {division.playerIds.includes(p.id) ? "Added" : "Add"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewSeasonForm({ league, allPlayers, membershipPlans, onCancel, onCreated }) {
  const [name, setName] = useState(`${league.name} Season`);
  const [season, setSeason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [matchDay, setMatchDay] = useState("Tuesday");
  const [matchTime, setMatchTime] = useState("6:00 PM");
  const [courtsCount, setCourtsCount] = useState("4");
  const [mode, setMode] = useState("singles");
  const [divisions, setDivisions] = useState([{ name: SKILL_DIVISIONS[0], playerIds: [] }]);
  const [eligibility, setEligibility] = useState(defaultEligibilityRequirements());
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const addDivision = () => setDivisions([...divisions, { name: SKILL_DIVISIONS[0], playerIds: [] }]);
  const updateDivision = (i, next) => setDivisions(divisions.map((d, idx) => (idx === i ? next : d)));
  const removeDivision = (i) => setDivisions(divisions.filter((_, idx) => idx !== i));

  const create = async () => {
    setError("");
    if (!startDate || !endDate) {
      setError("Start Date and End Date are required.");
      return;
    }
    setCreating(true);
    try {
      const season2 = await buildAndSaveLeagueSeason({
        leagueId: league.id,
        name,
        season,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        matchDay,
        matchTime,
        courtsCount: Number(courtsCount) || 1,
        mode,
        divisions: divisions.map((d) => ({
          name: d.name,
          players: allPlayers.filter((p) => d.playerIds.includes(p.id)).map((p) => ({ id: p.id, name: p.displayName })),
        })),
        eligibilityRequirements: eligibility,
      });
      onCreated(season2);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <SectionLabel>New Season</SectionLabel>
      <div style={styles.settingsPanel}>
        <label style={styles.settingsField}>
          League Name
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Season
          <input style={styles.input} placeholder="e.g. Fall 2026" value={season} onChange={(e) => setSeason(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Start Date
          <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          End Date
          <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Match Day
          <select style={styles.rotationSelect} value={matchDay} onChange={(e) => setMatchDay(e.target.value)}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.settingsField}>
          Match Time
          <input style={styles.input} placeholder="e.g. 6:00 PM" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Number of Courts
          <input type="number" min={1} style={styles.expectedGamesInput} value={courtsCount} onChange={(e) => setCourtsCount(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Singles / Doubles
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(mode === "singles")} onClick={() => setMode("singles")}>
              Singles
            </button>
            <button type="button" style={styles.skillToggleBtn(mode === "doubles")} onClick={() => setMode("doubles")}>
              Doubles
            </button>
          </div>
        </label>
      </div>

      <SectionLabel>Membership Eligibility</SectionLabel>
      <p style={styles.editHint}>Enforced live below — an ineligible player can't be added to a division.</p>
      <div style={styles.settingsPanel}>
        <label style={styles.settingsField}>
          Guest access allowed
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(eligibility.allowGuests)} onClick={() => setEligibility({ ...eligibility, allowGuests: true })}>
              On
            </button>
            <button type="button" style={styles.skillToggleBtn(!eligibility.allowGuests)} onClick={() => setEligibility({ ...eligibility, allowGuests: false })}>
              Off
            </button>
          </div>
        </label>
        <label style={styles.settingsField}>
          Require active membership
          <div style={styles.skillToggle}>
            <button
              type="button"
              style={styles.skillToggleBtn(eligibility.requireActiveMembership)}
              onClick={() => setEligibility({ ...eligibility, requireActiveMembership: true })}
            >
              Yes
            </button>
            <button
              type="button"
              style={styles.skillToggleBtn(!eligibility.requireActiveMembership)}
              onClick={() => setEligibility({ ...eligibility, requireActiveMembership: false })}
            >
              No
            </button>
          </div>
        </label>
        <label style={styles.settingsField}>
          Required plan
          <select
            style={styles.rotationSelect}
            value={eligibility.requiredPlanId || ""}
            onChange={(e) => setEligibility({ ...eligibility, requiredPlanId: e.target.value || null })}
          >
            <option value="">Any plan</option>
            {membershipPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionLabel>Divisions</SectionLabel>
      {divisions.map((d, i) => (
        <DivisionEditor
          key={i}
          division={d}
          allPlayers={allPlayers}
          membershipPlans={membershipPlans}
          eligibilityRequirements={eligibility}
          onChange={(next) => updateDivision(i, next)}
          onRemove={() => removeDivision(i)}
        />
      ))}
      <button type="button" style={styles.secondaryBtn} onClick={addDivision}>
        <Plus size={13} strokeWidth={2.5} />
        Add division
      </button>

      {error && <p style={styles.editWarning}>{error}</p>}

      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={{ ...styles.primaryBtn, ...(creating ? styles.btnDisabled : {}) }} onClick={create} disabled={creating}>
          {creating ? "Creating…" : "Create season"}
        </button>
      </div>
    </div>
  );
}

// League Management — see PROJECT.md's League Management section. Three
// internal steps: pick/create a League, pick/create a Season under it, or
// (once a season is open) the full Season Dashboard. Kept as one screen
// component (not three separate top-level `screen` states in
// PickleballOpenPlay.jsx) since the whole flow is a single self-contained
// tool an organizer opens from the landing page, same footprint as
// TournamentTemplatesScreen.
export default function LeagueManagerScreen({ onBack }) {
  const [leagues, setLeagues] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false);
  const [openSeason, setOpenSeason] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchAllLeagues(), fetchAllPlayers(), fetchAllMembershipPlans()])
      .then(([l, p, plans]) => {
        setLeagues(l);
        setAllPlayers(p.filter((pl) => pl.active));
        setMembershipPlans(plans);
      })
      .catch(() => setError("Couldn't load leagues."))
      .finally(() => setLoading(false));
  }, []);

  const openLeague = async (league) => {
    setError("");
    setSelectedLeague(league);
    setSeasons(await fetchSeasonsForLeague(league.id));
  };

  const createLeague = async () => {
    if (!newLeagueName.trim()) return;
    const league = await saveLeague(makeLeague({ name: newLeagueName }));
    setLeagues([...leagues, league]);
    setNewLeagueName("");
    setCreatingLeague(false);
    openLeague(league);
  };

  const onSeasonCreated = (season) => {
    setSeasons([...seasons, season]);
    setShowNewSeasonForm(false);
    setOpenSeason(season);
  };

  const refreshOpenSeason = async (updated) => setOpenSeason(updated);

  if (openSeason) {
    return (
      <LeagueSeasonDashboardView
        season={openSeason}
        onBack={() => setOpenSeason(null)}
        onStartMatch={async (matchId) => refreshOpenSeason(await saveLeagueMatchStart(openSeason, matchId))}
        onEnterScore={async (matchId, result) => refreshOpenSeason(await saveLeagueMatchResult(openSeason, matchId, result))}
        onSwap={async (a, b) => refreshOpenSeason(await saveSwapWeekMatches(openSeason, a, b))}
      />
    );
  }

  if (selectedLeague) {
    return (
      <div style={styles.createWrap}>
        <button style={styles.backBtn} onClick={() => setSelectedLeague(null)}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <SectionLabel>{selectedLeague.name}</SectionLabel>

        {!showNewSeasonForm ? (
          <>
            <div style={styles.editActions}>
              <button type="button" style={styles.primaryBtn} onClick={() => setShowNewSeasonForm(true)}>
                <Plus size={16} strokeWidth={2.5} />
                New season
              </button>
            </div>
            {seasons.length === 0 ? (
              <p style={styles.editHint}>No seasons yet — create one to get started.</p>
            ) : (
              <ul style={styles.rosterList}>
                {seasons.map((s) => (
                  <li key={s.id} style={styles.rosterItem}>
                    <span style={{ fontWeight: 700 }}>{s.season || s.name}</span>
                    <span style={styles.queueSourceTag}>{s.pools.length} division(s)</span>
                    <span style={styles.resultTag(s.status === "completed" ? "win" : "loss")}>{s.status}</span>
                    <button style={styles.checkInTapBtn} onClick={async () => setOpenSeason(await fetchLeagueSeason(s.id))}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <NewSeasonForm
            league={selectedLeague}
            allPlayers={allPlayers}
            membershipPlans={membershipPlans}
            onCancel={() => setShowNewSeasonForm(false)}
            onCreated={onSeasonCreated}
          />
        )}
      </div>
    );
  }

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Leagues</SectionLabel>
      {error && <p style={styles.editWarning}>{error}</p>}

      {!creatingLeague ? (
        <div style={styles.editActions}>
          <button type="button" style={styles.primaryBtn} onClick={() => setCreatingLeague(true)}>
            <Plus size={16} strokeWidth={2.5} />
            Create league
          </button>
        </div>
      ) : (
        <div style={styles.checkinRow}>
          <input style={styles.input} placeholder="e.g. Tuesday Night League" value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} />
          <button type="button" style={styles.primaryBtn} onClick={createLeague}>
            Save
          </button>
        </div>
      )}

      {loading ? (
        <p style={styles.editHint}>Loading leagues…</p>
      ) : leagues.length === 0 ? (
        <p style={styles.editHint}>No leagues yet — create one to get started.</p>
      ) : (
        <ul style={styles.rosterList}>
          {leagues.map((l) => (
            <li key={l.id} style={styles.rosterItem}>
              <span style={{ fontWeight: 700 }}>{l.name}</span>
              <button style={styles.checkInTapBtn} onClick={() => openLeague(l)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
