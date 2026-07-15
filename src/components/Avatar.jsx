import { styles } from "../styles.js";
import { colorForName, initials } from "../lib/utils.js";

export default function Avatar({ player, size = 26 }) {
  if (!player) return null;
  const dim = { width: size, height: size, minWidth: size };
  if (player.photo) {
    return <img src={player.photo} alt="" style={{ ...styles.avatarImg, ...dim }} />;
  }
  return (
    <div style={{ ...styles.avatarInitials, ...dim, background: colorForName(player.name) }}>
      {initials(player.name)}
    </div>
  );
}
