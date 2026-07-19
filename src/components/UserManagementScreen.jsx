import { useEffect, useState } from "react";
import { ArrowLeft, Plus, KeyRound, Ban, CheckCircle2, Pencil } from "lucide-react";
import { styles } from "../styles.js";
import { emptyUserRecord, fetchAllUsers, saveUserRecord } from "../lib/userDatabase.js";
import { BUILT_IN_ROLES } from "../engines/Role.js";
import { AuthorizationService } from "../engines/AuthorizationService.js";
import SectionLabel from "./SectionLabel.jsx";

const authorizationService = new AuthorizationService();

// The one live enforcement point this task wires up — see PROJECT.md's
// Role-Based Access Control section for why. There's no login system in
// this app (out of scope here — building one would be authentication, not
// authorization), so there's no real "current user" to check everywhere.
// This screen is only reachable after the existing Admin PIN gate
// (PickleballOpenPlay.jsx's adminAuthed), which today is this app's one
// real "acting as an administrator" boundary — so having passed it is
// treated as acting with the built-in Super Admin role for the purposes of
// exercising AuthorizationService for real, rather than only unit-testing
// it in isolation.
const ACTING_ADMIN = { id: "admin-pin-session", roleIds: ["builtin-super-admin"], status: "active" };

function roleNames(roleIds) {
  return roleIds.map((id) => BUILT_IN_ROLES.find((r) => r.id === id)?.name || id).join(", ") || "—";
}

// Add/Edit form — name, one-or-more roles (checkbox list, since a user can
// hold multiple), and clubId as a free-text placeholder (there's no real
// Multi-Club Management yet — see userDatabase.js's clubId comment).
function UserForm({ draft, setDraft, onSave, onCancel, error }) {
  const toggleRole = (roleId) => {
    setDraft({
      ...draft,
      roleIds: draft.roleIds.includes(roleId)
        ? draft.roleIds.filter((id) => id !== roleId)
        : [...draft.roleIds, roleId],
    });
  };

  return (
    <div>
      <SectionLabel>Name</SectionLabel>
      <input style={styles.input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

      <SectionLabel>Club</SectionLabel>
      <input
        style={styles.input}
        placeholder="e.g. Ormoc City Pickleball Club"
        value={draft.clubId || ""}
        onChange={(e) => setDraft({ ...draft, clubId: e.target.value })}
      />
      <p style={styles.editHint}>Free text for now — Multi-Club Management isn't implemented yet.</p>

      <SectionLabel>Roles</SectionLabel>
      <ul style={styles.qualifiersList}>
        {BUILT_IN_ROLES.map((role) => (
          <li key={role.id} style={styles.qualifiersListItem}>
            <span>{role.name}</span>
            <button
              type="button"
              style={draft.roleIds.includes(role.id) ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => toggleRole(role.id)}
            >
              {draft.roleIds.includes(role.id) ? "Assigned" : "Assign"}
            </button>
          </li>
        ))}
      </ul>

      {error && <p style={styles.editWarning}>{error}</p>}

      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={styles.primaryBtn} onClick={onSave} disabled={!draft.name.trim()}>
          Save user
        </button>
      </div>
    </div>
  );
}

// User Management — see PROJECT.md's Role-Based Access Control section.
// Reached from the Admin Panel (Super Admin's own territory today). Lists
// every user (Name/Role/Club/Status) with Add/Edit/Disable/Reset Password
// actions — Reset Password is an explicit placeholder per the spec, not a
// real credential reset (there's no authentication system for it to reset
// anything against yet).
export default function UserManagementScreen({ onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // draft | null
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState(null); // { userId, text }

  const load = () => {
    setLoading(true);
    fetchAllUsers()
      .then(setUsers)
      .catch(() => setError("Couldn't load users."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const canManageUsers = authorizationService.hasPermission(ACTING_ADMIN, "administration.manageUsers");

  const openCreate = () => {
    setError("");
    setEditing(emptyUserRecord({ name: "" }));
  };

  const openEdit = (user) => {
    setError("");
    setEditing(user);
  };

  const save = async () => {
    if (!canManageUsers) {
      setError("You don't have permission to manage users.");
      return;
    }
    setError("");
    try {
      await saveUserRecord(editing);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleStatus = async (user) => {
    if (!canManageUsers) return;
    await saveUserRecord({ ...user, status: user.status === "disabled" ? "active" : "disabled" });
    load();
  };

  const resetPassword = (user) => {
    // Placeholder, per the spec — no credential store exists yet to reset
    // anything against (this app has no per-user authentication at all).
    setResetMessage({ userId: user.id, text: "Password reset isn't implemented yet." });
    setTimeout(() => setResetMessage(null), 2500);
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={editing ? () => setEditing(null) : onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>User Management</SectionLabel>

      {!editing ? (
        <>
          <div style={styles.editActions}>
            <button type="button" style={styles.primaryBtn} onClick={openCreate} disabled={!canManageUsers}>
              <Plus size={16} strokeWidth={2.5} />
              Add user
            </button>
          </div>

          {error && <p style={styles.editWarning}>{error}</p>}

          {loading ? (
            <p style={styles.editHint}>Loading users…</p>
          ) : users.length === 0 ? (
            <p style={styles.editHint}>No users yet — add one to get started.</p>
          ) : (
            <ul style={styles.rosterList}>
              {users.map((u) => (
                <li key={u.id} style={styles.rosterItem}>
                  <span style={{ fontWeight: 700 }}>{u.name}</span>
                  <span style={styles.queueSourceTag}>{roleNames(u.roleIds)}</span>
                  <span style={styles.queueSourceTag}>{u.clubId || "No club"}</span>
                  <span style={styles.resultTag(u.status === "disabled" ? "loss" : "win")}>
                    {u.status === "disabled" ? "DISABLED" : "ACTIVE"}
                  </span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => openEdit(u)} disabled={!canManageUsers}>
                      <Pencil size={12} strokeWidth={2.5} />
                      Edit
                    </button>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => toggleStatus(u)} disabled={!canManageUsers}>
                      {u.status === "disabled" ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <Ban size={12} strokeWidth={2.5} />}
                      {u.status === "disabled" ? "Enable" : "Disable"}
                    </button>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => resetPassword(u)}>
                      <KeyRound size={12} strokeWidth={2.5} />
                      Reset Password
                    </button>
                  </span>
                  {resetMessage?.userId === u.id && <span style={styles.editHint}>{resetMessage.text}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <UserForm draft={editing} setDraft={setEditing} onSave={save} onCancel={() => setEditing(null)} error={error} />
      )}
    </div>
  );
}
