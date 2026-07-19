import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { styles } from "../styles.js";
import { TournamentTemplateService, makeTemplate } from "../engines/TournamentTemplateService.js";
import { MATCH_FORMATS, defaultMatchScoringRules } from "../engines/TournamentSettings.js";
import { TOURNAMENT_FORMATS } from "../lib/constants.js";
import SectionLabel from "./SectionLabel.jsx";

const templateService = new TournamentTemplateService();

const ASSIGNMENT_METHODS = [{ value: "random", label: "Random" }]; // see engines/PoolAssignment.js — only method implemented so far

// Empty draft for the Create/Edit form — mirrors makeTemplate's defaults,
// kept separate from it since the form needs string-friendly values for
// its number inputs (see save()'s Number(...) conversion back).
function draftFromTemplate(template) {
  const defaults = defaultMatchScoringRules();
  if (!template) {
    return {
      id: null,
      name: "",
      format: "roundRobin",
      mode: "singles",
      courtsCount: "4",
      poolCount: "1",
      assignmentMethod: "random",
      advancesPerPool: "1",
      matchFormat: defaults.matchFormat,
      winningScore: String(defaults.winningScore),
      winByTwo: defaults.winByTwo,
      courtNamesText: "",
    };
  }
  return {
    id: template.id,
    name: template.name,
    format: template.format,
    mode: template.mode,
    courtsCount: String(template.courtsCount),
    poolCount: String(template.poolCount),
    assignmentMethod: template.assignmentMethod,
    advancesPerPool: String(template.advancesPerPool),
    matchFormat: template.matchScoringRules?.matchFormat ?? defaults.matchFormat,
    winningScore: String(template.matchScoringRules?.winningScore ?? defaults.winningScore),
    winByTwo: template.matchScoringRules?.winByTwo ?? defaults.winByTwo,
    courtNamesText: (template.defaultCourtNames || []).join(", "),
  };
}

// Tournament Templates management — see PROJECT.md's Tournament Templates
// section. "Playoff Configuration" and "Qualifiers Per Pool" are
// consolidated into one field here (Teams Advancing Per Pool) rather than
// two separate controls — playoffs in this app are already auto-triggered
// purely by the qualified-team count being a power of two (see Playoff
// Qualification/Bracket Generation), so a template has nothing further to
// "configure" about playoffs beyond that number.
export default function TournamentTemplatesScreen({ onBack }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultId, setDefaultId] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // draft object | null (form closed)

  const load = () => {
    setLoading(true);
    Promise.all([templateService.fetchAllTemplates(), templateService.getDefaultTemplateId()])
      .then(([list, defId]) => {
        setTemplates(list);
        setDefaultId(defId);
      })
      .catch(() => setError("Couldn't load templates."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setError("");
    setEditing(draftFromTemplate(null));
  };

  const openEdit = (template) => {
    setError("");
    setEditing(draftFromTemplate(template));
  };

  const save = async () => {
    setError("");
    try {
      const template = makeTemplate({
        name: editing.name.trim(),
        format: editing.format,
        mode: editing.mode,
        courtsCount: Number(editing.courtsCount) || 0,
        poolCount: Number(editing.poolCount) || 0,
        assignmentMethod: editing.assignmentMethod,
        advancesPerPool: Number(editing.advancesPerPool) || 0,
        matchScoringRules: {
          matchFormat: editing.matchFormat,
          winningScore: Number(editing.winningScore) || 11,
          winByTwo: editing.winByTwo,
        },
        defaultCourtNames: editing.courtNamesText.trim()
          ? editing.courtNamesText.split(",").map((n) => n.trim()).filter(Boolean)
          : null,
      });
      if (editing.id) template.id = editing.id; // editing an existing custom template keeps its id
      await templateService.saveTemplate(template);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const duplicate = async (id) => {
    setError("");
    try {
      await templateService.duplicateTemplate(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    setError("");
    try {
      await templateService.deleteTemplate(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setDefault = async (id) => {
    setError("");
    try {
      await templateService.setDefaultTemplate(id);
      setDefaultId(id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={editing ? () => setEditing(null) : onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>Tournament Templates</SectionLabel>
      <p style={styles.editHint}>
        Save a tournament configuration once, then reuse it from Create Session's "Use Template" option — pre-fills
        every field below while still leaving them editable before the tournament starts.
      </p>

      {error && <p style={styles.editWarning}>{error}</p>}

      {!editing && (
        <>
          <div style={styles.editActions}>
            <button type="button" style={styles.primaryBtn} onClick={openCreate}>
              <Plus size={16} strokeWidth={2.5} />
              Create template
            </button>
          </div>

          {loading ? (
            <p style={styles.editHint}>Loading templates…</p>
          ) : (
            <ul style={styles.qualifiersList}>
              {templates.map((t) => (
                <li key={t.id} style={styles.qualifiersListItem}>
                  <span>
                    <span style={{ fontWeight: 700 }}>
                      {t.id === defaultId && <Star size={13} strokeWidth={2.5} style={{ marginRight: 4, verticalAlign: "text-bottom" }} />}
                      {t.name}
                    </span>
                    <span style={styles.queueSourceTag}>
                      {t.isBuiltIn ? "Built-in" : "Custom"} · {t.mode === "doubles" ? "Doubles" : "Singles"} · {t.poolCount} pool
                      {t.poolCount === 1 ? "" : "s"} · Top {t.advancesPerPool}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {t.id !== defaultId && (
                      <button type="button" style={styles.secondaryBtn} onClick={() => setDefault(t.id)}>
                        <Star size={13} strokeWidth={2.5} />
                        Set default
                      </button>
                    )}
                    {!t.isBuiltIn && (
                      <button type="button" style={styles.secondaryBtn} onClick={() => openEdit(t)}>
                        <Pencil size={13} strokeWidth={2.5} />
                        Edit
                      </button>
                    )}
                    <button type="button" style={styles.secondaryBtn} onClick={() => duplicate(t.id)}>
                      <Copy size={13} strokeWidth={2.5} />
                      Duplicate
                    </button>
                    {!t.isBuiltIn && (
                      <button type="button" style={styles.secondaryBtn} onClick={() => remove(t.id)}>
                        <Trash2 size={13} strokeWidth={2.5} />
                        Delete
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <div>
          <SectionLabel>Template name</SectionLabel>
          <input
            style={styles.input}
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="e.g. Saturday Doubles Ladder"
          />

          <SectionLabel>Tournament format</SectionLabel>
          <select
            style={styles.rotationSelect}
            value={editing.format}
            onChange={(e) => setEditing({ ...editing, format: e.target.value })}
          >
            {TOURNAMENT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <SectionLabel>Singles / Doubles</SectionLabel>
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(editing.mode === "singles")} onClick={() => setEditing({ ...editing, mode: "singles" })}>
              Singles
            </button>
            <button type="button" style={styles.skillToggleBtn(editing.mode === "doubles")} onClick={() => setEditing({ ...editing, mode: "doubles" })}>
              Doubles
            </button>
          </div>

          <div style={styles.settingsPanel}>
            <label style={styles.settingsField}>
              Number of courts
              <input type="number" min={1} style={styles.expectedGamesInput} value={editing.courtsCount} onChange={(e) => setEditing({ ...editing, courtsCount: e.target.value })} />
            </label>
            <label style={styles.settingsField}>
              Number of pools
              <input type="number" min={1} style={styles.expectedGamesInput} value={editing.poolCount} onChange={(e) => setEditing({ ...editing, poolCount: e.target.value })} />
            </label>
            <label style={styles.settingsField}>
              Playoff configuration (qualifiers per pool)
              <input type="number" min={1} style={styles.expectedGamesInput} value={editing.advancesPerPool} onChange={(e) => setEditing({ ...editing, advancesPerPool: e.target.value })} />
            </label>
            <label style={styles.settingsField}>
              Pool assignment method
              <select style={styles.rotationSelect} value={editing.assignmentMethod} onChange={(e) => setEditing({ ...editing, assignmentMethod: e.target.value })}>
                {ASSIGNMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <SectionLabel>Match scoring rules</SectionLabel>
          <p style={styles.editHint}>Captured for reference — not enforced by scoring yet.</p>
          <div style={styles.settingsPanel}>
            <label style={styles.settingsField}>
              Match format
              <select style={styles.rotationSelect} value={editing.matchFormat} onChange={(e) => setEditing({ ...editing, matchFormat: e.target.value })}>
                {MATCH_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.settingsField}>
              Winning score
              <input type="number" min={1} style={styles.expectedGamesInput} value={editing.winningScore} onChange={(e) => setEditing({ ...editing, winningScore: e.target.value })} />
            </label>
            <label style={styles.settingsField}>
              Win by two
              <div style={styles.skillToggle}>
                <button type="button" style={styles.skillToggleBtn(editing.winByTwo)} onClick={() => setEditing({ ...editing, winByTwo: true })}>
                  On
                </button>
                <button type="button" style={styles.skillToggleBtn(!editing.winByTwo)} onClick={() => setEditing({ ...editing, winByTwo: false })}>
                  Off
                </button>
              </div>
            </label>
          </div>

          <SectionLabel>Default court names (optional)</SectionLabel>
          <input
            style={styles.input}
            placeholder="Court 1, Court 2, Championship Court"
            value={editing.courtNamesText}
            onChange={(e) => setEditing({ ...editing, courtNamesText: e.target.value })}
          />
          <p style={styles.editHint}>Comma-separated. Leave blank to use the default "Court 1", "Court 2", …</p>

          <div style={styles.editActions}>
            <button type="button" style={styles.secondaryBtn} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" style={styles.primaryBtn} onClick={save} disabled={!editing.name.trim()}>
              Save template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
