import { describe, it, expect } from "vitest";
import {
  isAppointmentLiveNow,
  getLiveOffsetForAppointment,
  getUpcomingTimeSlots,
  getAppointmentStartDate,
} from "../schedule";

describe("Low Severity - Schedule Timezone & DST Safety (Issues 41 & 42)", () => {
  it("computes isAppointmentLiveNow correctly with tzOffset", () => {
    // Suppose an appointment is scheduled on Tuesday (dayOfWeek: 2) at 8:00 PM (1200 mins), blockCount: 2 (60 mins)
    const timing = {
      dayOfWeek: 2,
      blockStartMinutes: 1200,
      blockCount: 2,
    };

    // Construct a UTC Date where local time in IST (tzOffset = -330) is Tuesday 8:15 PM (1215 mins)
    // 8:15 PM IST = 14:45 UTC.
    const nowUtc = new Date(Date.UTC(2026, 8, 15, 14, 45, 0)); // 2026-09-15 is Tuesday

    const isLive = isAppointmentLiveNow(timing, nowUtc, -330);
    expect(isLive).toBe(true);

    const offset = getLiveOffsetForAppointment(timing, nowUtc, -330);
    expect(offset).toBe(15 * 60); // 15 minutes elapsed = 900 seconds
  });

  it("returns false for isAppointmentLiveNow when outside block start/end with tzOffset", () => {
    const timing = {
      dayOfWeek: 2,
      blockStartMinutes: 1200,
      blockCount: 2,
    };

    // 9:15 PM IST (1275 mins) -> broadcast has ended (ends at 1260 mins)
    const nowUtc = new Date(Date.UTC(2026, 8, 15, 15, 45, 0));

    const isLive = isAppointmentLiveNow(timing, nowUtc, -330);
    expect(isLive).toBe(false);

    const offset = getLiveOffsetForAppointment(timing, nowUtc, -330);
    expect(offset).toBeNull();
  });

  it("calculates getUpcomingTimeSlots correctly with tzOffset", () => {
    // Reference date: 14:10 UTC, which in IST (-330) is 19:40 (7:40 PM)
    const nowUtc = new Date(Date.UTC(2026, 8, 15, 14, 10, 0));
    const slots = getUpcomingTimeSlots(4, nowUtc, -330);

    expect(slots.length).toBe(4);
    // 19:40 floored to 30 mins is 19:30 (1170 mins)
    expect(slots[0].blockStartMinutes).toBe(1170);
    expect(slots[0].label).toBe("7:30 PM");

    // Slot 2 should be 20:00 (8:00 PM = 1200 mins)
    expect(slots[1].blockStartMinutes).toBe(1200);
    expect(slots[1].label).toBe("8:00 PM");
  });

  it("calculates getAppointmentStartDate correctly with tzOffset", () => {
    const nowUtc = new Date(Date.UTC(2026, 8, 15, 10, 0, 0));
    // Appointment at 8:00 PM IST (1200 mins) -> in UTC should be 14:30
    const startDate = getAppointmentStartDate({ blockStartMinutes: 1200 }, nowUtc, -330);

    expect(startDate.getUTCHours()).toBe(14);
    expect(startDate.getUTCMinutes()).toBe(30);
  });
});
