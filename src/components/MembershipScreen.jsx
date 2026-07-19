import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllPlayers, savePlayerRecord, filterPlayersByQuery, generateMemberId } from "../lib/playerDatabase.js";
import { fetchAllMembershipPlans, BUILT_IN_MEMBERSHIP_PLANS } from "../lib/membershipPlans.js";
import { MembershipService, deriveMembership } from "../engines/MembershipService.js";
import SectionLabel from "./SectionLabel.jsx";

const membershipService = new MembershipService();
const STATUS_FILTERS = ["all", "active", "expired", "suspended", "pending"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Membership Dashboard — see PROJECT.md's Membership Management section.
// Every stat is computed live from the Player Database's own membership
// fields via MembershipService, nothing new is persisted.
function DashboardPanel({ players, plans }) {
  const memberships = players.map((p) => deriveMembership(p, plans));
  const active = memberships.filter((m) => m.status === "active").length;
  const expired = memberships.filter((m) => m.status === "expired").length;
  const expiringSoon = memberships.filter(
    (m) => m.status === "active" && m.expirationDate && m.expirationDate - Date.now() <= THIRTY_DAYS_MS
  ).length;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const newThisMonth = players.filter((p) => p.joinDate && p.joinDate >= startOfMonth.getTime()).length;

  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Total Members</span>
        <span style={styles.sessionInfoValue}>{players.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Active Members</span>
        <span style={styles.sessionInfoValue}>{active}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Expiring Soon (30d)</span>
        <span style={styles.sessionInfoValue}>{expiringSoon}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Expired Members</span>
        <span style={styles.sessionInfoValue}>{expired}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>New Members This Month</span>
        <span style={styles.sessionInfoValue}>{newThisMonth}</span>
      </div>
    </div>
  );
}

function RenewForm({ player, plans, onRenew, onCancel }) {
  const [planId, setPlanId] = useState(player.membershipPlanId || plans[0]?.id || "");
  return (
    <div style={styles.tournamentSetupCard}>
      <p style={styles.editHint}>
        Renewing for <strong>{player.displayName}</strong>. No payment is processed here — this only updates
        membership records.
      </p>
      <select style={styles.rotationSelect} value={planId} onChange={(e) => setPlanId(e.target.value)}>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={styles.primaryBtn} onClick={() => onRenew(planId)}>
          Confirm renewal
        </button>
      </div>
    </div>
  );
}

function ProfileCard({ player, membership }) {
  return (
    <div style={styles.tournamentSetupCard}>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Member ID</span>
          <span style={styles.sessionInfoValue}>{membership.memberId || "—"}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Plan</span>
          <span style={styles.sessionInfoValue}>{membership.plan?.name || "—"}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Join Date</span>
          <span style={styles.sessionInfoValue}>{formatDate(membership.joinDate)}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Expiration Date</span>
          <span style={styles.sessionInfoValue}>{formatDate(membership.expirationDate)}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Skill Level</span>
          <span style={styles.sessionInfoValue}>{membership.skillLevel}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Emergency Contact</span>
          <span style={styles.sessionInfoValue}>{membership.emergencyContact || "—"}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>DUPR ID</span>
          <span style={styles.sessionInfoValue}>{membership.duprId || "—"}</span>
        </div>
      </div>
      {membership.notes && <p style={styles.editHint}>Notes: {membership.notes}</p>}
    </div>
  );
}

// Member Directory — search/filter/sort over the Player Database, plus
// View Profile and Renew Membership (a real MembershipService.renewMembership
// call, no payment step — see RenewForm above).
function DirectoryPanel({ players, plans, onReload }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [expandedId, setExpandedId] = useState(null);
  const [renewingId, setRenewingId] = useState(null);

  const rows = useMemo(() => {
    let list = filterPlayersByQuery(players, query).map((p) => ({ player: p, membership: deriveMembership(p, plans) }));
    if (statusFilter !== "all") list = list.filter((r) => r.membership.status === statusFilter);
    const compare = {
      name: (a, b) => a.player.displayName.localeCompare(b.player.displayName),
      expiration: (a, b) => (a.membership.expirationDate ?? Infinity) - (b.membership.expirationDate ?? Infinity),
      status: (a, b) => a.membership.status.localeCompare(b.membership.status),
    };
    return [...list].sort(compare[sortKey]);
  }, [players, plans, query, statusFilter, sortKey]);

  const renew = async (player, planId) => {
    const updated = membershipService.renewMembership(player, planId, plans);
    const stamped = updated.memberId ? updated : { ...updated, memberId: generateMemberId() };
    await savePlayerRecord(stamped);
    setRenewingId(null);
    onReload();
  };

  return (
    <div>
      <div style={styles.historySearchBox}>
        <Search size={14} strokeWidth={2.5} />
        <input style={styles.historySearchInput} placeholder="Search members…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={styles.dashboardTabRow}>
        {STATUS_FILTERS.map((s) => (
          <button key={s} type="button" style={styles.dashboardTabBtn(statusFilter === s)} onClick={() => setStatusFilter(s)}>
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div style={styles.dashboardTabRow}>
        {[
          { id: "name", label: "Sort: Name" },
          { id: "expiration", label: "Sort: Expiration" },
          { id: "status", label: "Sort: Status" },
        ].map((s) => (
          <button key={s.id} type="button" style={styles.dashboardTabBtn(sortKey === s.id)} onClick={() => setSortKey(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={styles.editHint}>No members match.</p>
      ) : (
        <ul style={{ ...styles.rosterList, maxWidth: "100%" }}>
          {rows.map(({ player, membership }) => (
            <li key={player.id} style={{ ...styles.rosterItem, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700 }}>{player.displayName}</span>
              <span style={styles.queueSourceTag}>{membership.plan?.name || "No plan"}</span>
              <span style={styles.resultTag(membership.status === "active" ? "win" : "loss")}>{membership.status.toUpperCase()}</span>
              <span style={styles.editHint}>Exp: {formatDate(membership.expirationDate)}</span>
              <button style={styles.checkInTapBtn} onClick={() => setExpandedId(expandedId === player.id ? null : player.id)}>
                {expandedId === player.id ? "Hide profile" : "View profile"}
              </button>
              <button style={styles.checkInTapBtn} onClick={() => setRenewingId(renewingId === player.id ? null : player.id)}>
                Renew Membership
              </button>
              {expandedId === player.id && (
                <div style={{ width: "100%" }}>
                  <ProfileCard player={player} membership={membership} />
                </div>
              )}
              {renewingId === player.id && (
                <div style={{ width: "100%" }}>
                  <RenewForm player={player} plans={plans} onRenew={(planId) => renew(player, planId)} onCancel={() => setRenewingId(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "directory", label: "Member Directory" },
];

// Membership Management — see PROJECT.md. Extends the existing Player
// Database (see lib/playerDatabase.js's new membership fields) rather than
// a separate member table; this screen is a read/write surface over that
// same data, driven entirely by MembershipService.
export default function MembershipScreen({ onBack }) {
  const [players, setPlayers] = useState([]);
  const [plans, setPlans] = useState(BUILT_IN_MEMBERSHIP_PLANS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllPlayers(), fetchAllMembershipPlans()])
      .then(([p, pl]) => {
        setPlayers(p);
        setPlans(pl);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Membership Management</SectionLabel>

      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={styles.dashboardTabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={styles.editHint}>Loading members…</p>
      ) : tab === "dashboard" ? (
        <DashboardPanel players={players} plans={plans} />
      ) : (
        <DirectoryPanel players={players} plans={plans} onReload={load} />
      )}
    </div>
  );
}
