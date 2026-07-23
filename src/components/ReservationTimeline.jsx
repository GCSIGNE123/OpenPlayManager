import { useState } from "react";
import { styles } from "../styles.js";

// Interactive Reservation Timeline — the Booking Calendar's presentation
// layer (see PROJECT.md's Court Booking & Reservations section). Pure
// display: every component here takes pre-computed fractions/labels/
// colors and click callbacks, and calls NONE of BookingService/
// AvailabilityService itself — CourtBookingScreen.jsx (the screen) is the
// only place that talks to those. That split is what makes this safely
// reusable for a future sprint's Open Play/Tournament/Coaching/
// Maintenance/Public-booking blocks: as long as a caller maps its own
// records into the generic block shape below, nothing in this file needs
// to change.
//
// block = {
//   id, label (e.g. customer/player name), timeLabel ("3:00 PM–4:00 PM"),
//   startTime, endTime ("HH:MM"), statusKey (one of
//   styles.reservationStatusColor's keys — "confirmed"|"cancelled"|
//   "completed"|"noShow"|"maintenance"), tooltip (nullable — extra
//   hover/tap detail lines, array of strings), onClick,
// }

export const TIMELINE_START_HOUR = 6;
export const TIMELINE_END_HOUR = 22;
export const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR },
  (_, i) => TIMELINE_START_HOUR + i
);

// Pure unit conversion (display math, not scheduling logic) — a "HH:MM"
// time string's position within [startHour, endHour) as a 0..1 fraction.
// Reused for the Day grid, Week mini-cells, and the current-time line.
export function timeToFraction(hhmm, startHour = TIMELINE_START_HOUR, endHour = TIMELINE_END_HOUR) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h + m / 60 - startHour) / (endHour - startHour);
}

function formatHourLabel(h) {
  return `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "PM" : "AM"}`;
}

// ---- TimelineHeader ----
// mode "day": one cell per hour. mode "week": one cell per date, today
// highlighted.
export function TimelineHeader({ mode, hours = TIMELINE_HOURS, weekDates = [], todayDate, formatDayLabel, rowLabelWidth = 104 }) {
  return (
    <div style={{ ...styles.timelineHeaderRow, paddingLeft: rowLabelWidth }}>
      {mode === "week"
        ? weekDates.map((d) => (
            <div key={d} style={styles.timelineWeekHeaderCell(d === todayDate)}>
              {formatDayLabel ? formatDayLabel(d) : d}
              {d === todayDate && " · TODAY"}
            </div>
          ))
        : hours.map((h) => (
            <div key={h} style={styles.timelineHeaderCell}>
              {formatHourLabel(h)}
            </div>
          ))}
    </div>
  );
}

// ---- TimelineGrid ----
// The empty-slot click surface for one court's row (Day mode) — an hour
// per cell, dashed separators, "Available" by default; a court that isn't
// bookable (inactive, or already known-reserved-elsewhere) renders
// not-allowed instead, purely a cursor/affordance change — the actual
// rule enforcement still happens in AvailabilityService/BookingService
// when the resulting form is submitted.
export function TimelineGrid({ hours = TIMELINE_HOURS, clickable = true, onCellClick }) {
  return (
    <>
      {hours.map((h, i) => (
        <div
          key={h}
          onClick={() => clickable && onCellClick(h)}
          style={{
            ...styles.timelineGridCell(clickable),
            left: `${(i / hours.length) * 100}%`,
            width: `${(1 / hours.length) * 100}%`,
            borderLeft: i > 0 ? "1px dashed var(--line)" : "none",
          }}
          title={clickable ? "Click to book this slot — Available" : "Unavailable"}
        />
      ))}
    </>
  );
}

// ---- ReservationBlock ----
// A single colored block — booking, or (statusKey "maintenance") a
// court-wide unavailable band. Hover shows the spec's "Contact Number /
// Number of Players / Notes / Status" detail popover on desktop; tap
// (click) always opens the existing BookingForm (view+edit+status actions
// together, per the already-approved Phase 1 pattern) rather than a
// separate read-only screen.
export function ReservationBlock({ left, width, label, timeLabel, statusKey, tooltip, onClick }) {
  const [tooltipPos, setTooltipPos] = useState(null); // null | {top, left}
  const color = styles.reservationStatusColor(statusKey);
  // The timeline's horizontal-scroll wrapper (styles.reservationScroll)
  // implicitly clips vertical overflow too (a CSS quirk: setting
  // overflow-x non-visible forces overflow-y to compute as "auto" if left
  // at its default), so a tooltip positioned relative to the block would
  // get cut off. Positioning it `position: fixed` from the hovered
  // block's own viewport rect sidesteps that entirely.
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ top: rect.bottom + 6, left: rect.left });
      }}
      onMouseLeave={() => setTooltipPos(null)}
      style={{
        ...styles.reservationBlock,
        left: `${left}%`,
        width: `${Math.max(width, 2)}%`,
        ...color,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {timeLabel && <span style={styles.reservationBlockTime}>{timeLabel}</span>}
      {tooltipPos && tooltip && tooltip.length > 0 && (
        <div style={{ ...styles.reservationTooltip, position: "fixed", top: tooltipPos.top, left: tooltipPos.left }}>
          {tooltip.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- ReservationTimeline ----
// The calendar body. mode "day": courts as rows, hours as columns (the
// primary front-desk interface). mode "week": courts as rows, 7 day
// columns, each a compact mini-timeline of that day's blocks — same
// timeToFraction math, just scaled to the day-cell's own width, so
// staff get a real visual week overview instead of a plain day picker.
export default function ReservationTimeline({
  mode,
  courts,
  date,
  hours = TIMELINE_HOURS,
  getBlocksForCourt,
  onSlotClick,
  weekDates = [],
  todayDate,
  formatDayLabel,
  getBlocksForCourtDay,
  onDayCellClick,
}) {
  const rowLabelWidth = 104;
  const showNowLine = mode === "day" && date === todayDate;
  const nowFraction = showNowLine ? timeToFraction(`${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`, hours[0], hours[hours.length - 1] + 1) : null;

  return (
    <div style={styles.reservationScroll}>
      <TimelineHeader mode={mode} hours={hours} weekDates={weekDates} todayDate={todayDate} formatDayLabel={formatDayLabel} rowLabelWidth={rowLabelWidth} />
      {courts.map((court) => (
        <div key={court.id} style={{ ...styles.timelineRow, opacity: court.active ? 1 : 0.4 }}>
          <div style={styles.timelineRowLabel}>{court.name}</div>
          {mode === "week" ? (
            <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
              {weekDates.map((d) => {
                const blocks = court.active ? getBlocksForCourtDay(court, d) : [];
                const isToday = d === todayDate;
                const dayNowFraction = isToday ? timeToFraction(`${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`, hours[0], hours[hours.length - 1] + 1) : null;
                return (
                  <div
                    key={d}
                    onClick={() => court.active && onDayCellClick(court, d)}
                    style={{ ...styles.weekDayCell, cursor: court.active ? "pointer" : "not-allowed" }}
                    title={court.active ? "Click to view/book this day" : "Court inactive"}
                  >
                    {isToday && dayNowFraction != null && dayNowFraction >= 0 && dayNowFraction <= 1 && (
                      <div style={{ ...styles.timelineNowLine, left: `${dayNowFraction * 100}%` }} />
                    )}
                    {blocks.map((b) => {
                      const left = Math.max(0, timeToFraction(b.startTime, hours[0], hours[hours.length - 1] + 1)) * 100;
                      const width =
                        (Math.min(1, timeToFraction(b.endTime, hours[0], hours[hours.length - 1] + 1)) -
                          Math.max(0, timeToFraction(b.startTime, hours[0], hours[hours.length - 1] + 1))) *
                        100;
                      return <ReservationBlock key={b.id} left={left} width={width} label={b.label} statusKey={b.statusKey} tooltip={b.tooltip} onClick={b.onClick} />;
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.timelineGridTrack}>
              <TimelineGrid hours={hours} clickable={court.active} onCellClick={(h) => onSlotClick(court, `${String(h).padStart(2, "0")}:00`)} />
              {showNowLine && nowFraction != null && nowFraction >= 0 && nowFraction <= 1 && (
                <div style={{ ...styles.timelineNowLine, left: `${nowFraction * 100}%` }} />
              )}
              {(court.active ? getBlocksForCourt(court) : []).map((b) => {
                const left = Math.max(0, timeToFraction(b.startTime, hours[0], hours[hours.length - 1] + 1)) * 100;
                const width =
                  (Math.min(1, timeToFraction(b.endTime, hours[0], hours[hours.length - 1] + 1)) -
                    Math.max(0, timeToFraction(b.startTime, hours[0], hours[hours.length - 1] + 1))) *
                  100;
                return (
                  <ReservationBlock key={b.id} left={left} width={width} label={b.label} timeLabel={b.timeLabel} statusKey={b.statusKey} tooltip={b.tooltip} onClick={b.onClick} />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
