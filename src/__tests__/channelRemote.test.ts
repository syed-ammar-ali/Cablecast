import { describe, it, expect } from "vitest";
import { CHANNELS, getChannel } from "@/config/channels";

function formatMinutes(m: number): string {
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

function formatDateDisplay(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const parts = iso.split("-").map(Number);
    if (parts.length === 3) {
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  } catch {
    // fallback
  }
  return iso;
}

function processNumpadInput(
  currentDigits: string,
  key: string,
  isEpisodeCodeMode: boolean = false,
): string {
  const maxLen = isEpisodeCodeMode ? 4 : 2;

  if (key >= "0" && key <= "9") {
    return currentDigits.length < maxLen ? currentDigits + key : currentDigits;
  }
  if (key === "CLR" || key === "clear") {
    return "";
  }
  if (key === "backspace" || key === "delete") {
    return currentDigits.slice(0, -1);
  }
  return currentDigits;
}

function validateChannelDial(digits: string): { isValid: boolean; channelNumber?: number; error?: string } {
  if (!digits || digits.length === 0) {
    return { isValid: false, error: "Enter a channel number." };
  }
  const chNum = parseInt(digits, 10);
  if (isNaN(chNum)) {
    return { isValid: false, error: "Invalid channel." };
  }
  if (chNum < 2 || chNum > 12) {
    return { isValid: false, error: `CH ${chNum} does not exist. Cablecast channels are 02 – 12.` };
  }
  return { isValid: true, channelNumber: chNum };
}

function constructEpisodeCode(prefix: string, digits: string): { isValid: boolean; fullCode?: string; error?: string } {
  if (digits.length < 4) {
    return { isValid: false, error: `Type 4 digits for ${prefix} (e.g. 0101).` };
  }
  return { isValid: true, fullCode: `${prefix}${digits.slice(0, 4)}` };
}

describe("Channel Remote Control & Dialing Engine", () => {
  describe("Direct Channel Dialing Validation", () => {
    it("validates direct channels between 02 and 12", () => {
      expect(validateChannelDial("02").isValid).toBe(true);
      expect(validateChannelDial("2").isValid).toBe(true);
      expect(validateChannelDial("05").channelNumber).toBe(5);
      expect(validateChannelDial("12").channelNumber).toBe(12);
    });

    it("rejects channels below 02", () => {
      const zero = validateChannelDial("00");
      expect(zero.isValid).toBe(false);
      expect(zero.error).toContain("does not exist");

      const one = validateChannelDial("01");
      expect(one.isValid).toBe(false);
    });

    it("rejects channels above 12", () => {
      const thirteen = validateChannelDial("13");
      expect(thirteen.isValid).toBe(false);
      expect(thirteen.error).toContain("Cablecast channels are 02 – 12");

      const ninetyNine = validateChannelDial("99");
      expect(ninetyNine.isValid).toBe(false);
    });

    it("retrieves channel config for all valid channels", () => {
      for (let ch = 2; ch <= 12; ch++) {
        const config = getChannel(ch);
        expect(config).toBeDefined();
        expect(config?.number).toBe(ch);
        expect(config?.name).toBeTruthy();
      }
    });
  });

  describe("Numpad State Machine", () => {
    it("appends digits up to max 2 in channel mode", () => {
      let digits = "";
      digits = processNumpadInput(digits, "0");
      expect(digits).toBe("0");
      digits = processNumpadInput(digits, "7");
      expect(digits).toBe("07");
      // 3rd digit should be ignored in channel mode
      digits = processNumpadInput(digits, "5");
      expect(digits).toBe("07");
    });

    it("appends digits up to max 4 in episode code mode", () => {
      let digits = "";
      digits = processNumpadInput(digits, "0", true);
      digits = processNumpadInput(digits, "1", true);
      digits = processNumpadInput(digits, "0", true);
      digits = processNumpadInput(digits, "4", true);
      expect(digits).toBe("0104");
      // 5th digit should be ignored
      digits = processNumpadInput(digits, "9", true);
      expect(digits).toBe("0104");
    });

    it("supports backspace and CLR reset", () => {
      let digits = "07";
      digits = processNumpadInput(digits, "backspace");
      expect(digits).toBe("0");

      digits = processNumpadInput(digits, "9");
      expect(digits).toBe("09");

      digits = processNumpadInput(digits, "CLR");
      expect(digits).toBe("");
    });
  });

  describe("Episode Code Constructor", () => {
    it("constructs full code when 4 digits provided", () => {
      const code = constructEpisodeCode("BB", "0105");
      expect(code.isValid).toBe(true);
      expect(code.fullCode).toBe("BB0105");
    });

    it("rejects incomplete episode code with helpful prompt", () => {
      const code = constructEpisodeCode("BB", "01");
      expect(code.isValid).toBe(false);
      expect(code.error).toContain("Type 4 digits for BB");
    });
  });

  describe("Remote Display Helpers", () => {
    it("formats minutes to standard 12-hour AM/PM label", () => {
      expect(formatMinutes(480)).toBe("8:00 AM");
      expect(formatMinutes(720)).toBe("12:00 PM");
      expect(formatMinutes(1230)).toBe("8:30 PM");
      expect(formatMinutes(1439)).toBe("11:59 PM");
    });

    it("formats ISO dates for human reading", () => {
      const formatted = formatDateDisplay("2026-09-04");
      expect(formatted).toContain("Sep 4, 2026");
    });

    it("handles null or invalid ISO dates", () => {
      expect(formatDateDisplay(null)).toBeNull();
      expect(formatDateDisplay("")).toBeNull();
    });
  });
});
