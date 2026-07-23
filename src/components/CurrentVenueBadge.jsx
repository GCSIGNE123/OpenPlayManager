import { Building2 } from "lucide-react";
import { styles } from "../styles.js";
import { useActiveVenue } from "../context/ActiveVenueContext.jsx";

// "Current Venue" indicator — see PROJECT.md's Multi-Venue Authentication
// & Workspace Architecture section. A small, reusable readout of
// useActiveVenue()'s activeVenue, dropped into a module's header so the
// screen visibly operates "inside" the active venue workspace, per the
// spec's own mockup ("Current Venue / Ormoc Pickleball Center"). Purely
// display — never fetches or filters anything itself.
export default function CurrentVenueBadge() {
  const { venueName, venueLogo, loading } = useActiveVenue();
  if (loading) return null;
  return (
    <div style={{ ...styles.courtInfoPill, marginBottom: 10 }}>
      {venueLogo ? (
        <img src={venueLogo} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <Building2 size={12} strokeWidth={2.5} />
      )}
      {venueName ? `Current Venue: ${venueName}` : "No venue selected"}
    </div>
  );
}
