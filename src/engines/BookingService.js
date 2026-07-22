// Booking Service — see PROJECT.md's Court Booking & Reservations section.
// Thin orchestration on top of AvailabilityService (validation/conflict
// rules) and lib/bookingModel.js (persistence) — this file owns exactly
// "validate, then persist," never re-implements overlap/conflict math
// itself.
import { emptyBooking, saveBooking } from "../lib/bookingModel.js";
import { validateBookingFields } from "./AvailabilityService.js";

export class BookingService {
  // Same { valid, errors[] } shape AvailabilityService.validateBookingFields
  // already returns — re-exported as a method here so callers only need
  // one import (BookingService) for "validate and save," while
  // AvailabilityService stays purely about availability math with zero
  // persistence knowledge.
  validate(fields, existingBookings, excludeBookingId = null) {
    return validateBookingFields(fields, existingBookings, excludeBookingId);
  }

  // fields: { court, date, startTime, endTime, playerId, customerName,
  // contactNumber, numberOfPlayers, notes, bookingSource }
  // Throws (message-bearing Error) on any validation failure — the same
  // "call the service, let it throw, persist what it returns" contract
  // every other save* function in this app already uses.
  async createBooking(fields, existingBookings) {
    const validation = this.validate(fields, existingBookings);
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }
    const booking = emptyBooking({
      courtId: fields.court.id,
      playerId: fields.playerId ?? null,
      customerName: fields.customerName,
      contactNumber: fields.contactNumber,
      date: fields.date,
      startTime: fields.startTime,
      endTime: fields.endTime,
      numberOfPlayers: fields.numberOfPlayers,
      notes: fields.notes,
      bookingSource: fields.bookingSource,
    });
    return saveBooking(booking);
  }

  async updateBooking(existingBooking, fields, existingBookings) {
    const validation = this.validate(fields, existingBookings, existingBooking.id);
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }
    return saveBooking({
      ...existingBooking,
      courtId: fields.court.id,
      playerId: fields.playerId ?? existingBooking.playerId,
      customerName: fields.customerName.trim(),
      contactNumber: fields.contactNumber ? fields.contactNumber.trim() : null,
      date: fields.date,
      startTime: fields.startTime,
      endTime: fields.endTime,
      numberOfPlayers: fields.numberOfPlayers === "" || fields.numberOfPlayers == null ? null : Number(fields.numberOfPlayers),
      notes: fields.notes ? fields.notes.trim() : null,
    });
  }

  // Status transitions — no re-validation against conflicts needed (a
  // cancelled/completed/no-show booking is by definition no longer
  // competing for the slot; AvailabilityService already excludes
  // "cancelled" from ACTIVE_STATUSES, and "completed"/"noShow" simply
  // record how a past reservation resolved).
  async cancelBooking(booking) {
    return saveBooking({ ...booking, status: "cancelled" });
  }

  async markCompleted(booking) {
    return saveBooking({ ...booking, status: "completed" });
  }

  async markNoShow(booking) {
    return saveBooking({ ...booking, status: "noShow" });
  }
}
