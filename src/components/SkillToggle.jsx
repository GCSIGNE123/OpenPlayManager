import { styles } from "../styles.js";

export default function SkillToggle({ value, onChange }) {
  return (
    <div style={styles.skillToggle}>
      <button
        type="button"
        style={styles.skillToggleBtn(value === "beginner")}
        onClick={() => onChange("beginner")}
      >
        Beginner
      </button>
      <button
        type="button"
        style={styles.skillToggleBtn(value === "intermediate")}
        onClick={() => onChange("intermediate")}
      >
        Intermediate
      </button>
    </div>
  );
}
