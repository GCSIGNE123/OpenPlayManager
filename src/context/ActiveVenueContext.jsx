import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchAllVenues } from "../lib/venueModel.js";

// Active Venue Workspace — see PROJECT.md's Multi-Venue Authentication &
// Workspace Architecture section. This is the "Single Source of Context"
// the spec asks for: a module gets the current venue by calling
// useActiveVenue() instead of a Venue ID being threaded/prop-drilled
// through every screen and call site. Architecture preparation only —
// no login, no permission enforcement, no filtering of existing data
// (which would risk hiding today's un-tagged records; nothing currently
// reads venueId to change behavior, and this context doesn't change
// that). userRole/permissions are explicit `null`/`[]` placeholders for
// the future real auth system this is preparing the ground for.
//
// Future login flow this is designed against (not built this sprint):
// Login -> Select Venue (if >1) -> Venue Dashboard -> every module scoped
// to that venue. This provider's auto-select-if-exactly-one /
// leave-unset-if-zero-or-many behavior is exactly that decision, just
// without a login step or a venue-selector screen in front of it yet.
const ActiveVenueContext = createContext(null);

export function ActiveVenueProvider({ children }) {
  const [venues, setVenues] = useState([]);
  const [activeVenueId, setActiveVenueId] = useState(null);
  const [loading, setLoading] = useState(true);

  const reloadVenues = () => {
    setLoading(true);
    return fetchAllVenues()
      .then((v) => {
        setVenues(v);
        // Auto-enter the single venue a user belongs to (see Future Login
        // Flow above); with zero or multiple venues, leave the workspace
        // unset — a future venue-selector screen decides from here, this
        // provider doesn't guess. Never overrides an already-chosen
        // active venue that's still in the list (e.g. after an edit).
        setActiveVenueId((prev) => {
          if (prev && v.some((x) => x.id === prev)) return prev;
          return v.length === 1 ? v[0].id : null;
        });
        return v;
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reloadVenues();
  }, []);

  const activeVenue = useMemo(() => venues.find((v) => v.id === activeVenueId) ?? null, [venues, activeVenueId]);

  const value = useMemo(
    () => ({
      venues,
      loading,
      activeVenueId,
      setActiveVenueId,
      activeVenue,
      venueName: activeVenue?.name ?? null,
      venueLogo: activeVenue?.logo ?? null,
      // Future Roles — see lib/constants.js's PLATFORM_ROLES. Neither of
      // these is read/enforced anywhere yet; they exist so a future real
      // auth system has somewhere to put the answer without every module
      // needing a second context or prop path added later.
      userRole: null,
      permissions: [],
      reloadVenues,
    }),
    [venues, loading, activeVenueId, activeVenue]
  );

  return <ActiveVenueContext.Provider value={value}>{children}</ActiveVenueContext.Provider>;
}

export function useActiveVenue() {
  const ctx = useContext(ActiveVenueContext);
  if (!ctx) throw new Error("useActiveVenue must be used within an ActiveVenueProvider");
  return ctx;
}
