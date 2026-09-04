/** Country choices for the World Guide's broadcast schedule filter. */
export interface CountryOption {
  code: string;
  label: string;
  flag: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: "US", label: "United States", flag: "/flags/us.png" },
  { code: "IN", label: "India",         flag: "/flags/in.png" },
  { code: "GB", label: "United Kingdom",flag: "/flags/gb.png" },
  { code: "CA", label: "Canada",        flag: "/flags/ca.png" },
  { code: "AU", label: "Australia",     flag: "/flags/au.png" },
  { code: "DE", label: "Germany",       flag: "/flags/de.png" },
  { code: "FR", label: "France",        flag: "/flags/fr.png" },
  { code: "JP", label: "Japan",         flag: "/flags/jp.png" },
  { code: "KR", label: "South Korea",   flag: "/flags/kr.png" },
];

/** Renders an ISO 3166-1 alpha-2 code as its flag emoji, e.g. "US" -> "🇺🇸". */
export function countryCodeToFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
