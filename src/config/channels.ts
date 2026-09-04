/**
 * Static "channel lineup" for the retro TV Guide. Channels represent iconic
 * broadcast & cable television networks (NBC, ABC, FOX, CBS, HBO, MTV, Cartoon Network, etc.),
 * analogous to a classic 90s/2000s cable box lineup.
 */
export interface Channel {
  number: number;
  name: string;
  genre: string;
  accentColor: string;
}

export const CHANNELS: Channel[] = [
  { number: 2, name: "CH 02 · NBC", genre: "Must-See TV & Primetime", accentColor: "#facc15" },
  { number: 3, name: "CH 03 · ABC", genre: "TGIF & Family Primetime", accentColor: "#22d3ee" },
  { number: 4, name: "CH 04 · FOX", genre: "Animation & Cult TV", accentColor: "#f97316" },
  { number: 5, name: "CH 05 · CBS", genre: "Drama & Classic Comedy", accentColor: "#e879f9" },
  { number: 6, name: "CH 06 · HBO", genre: "Prestige Movies & Series", accentColor: "#ef4444" },
  { number: 7, name: "CH 07 · Cartoon Network", genre: "Classic Animation & Toonami", accentColor: "#38bdf8" },
  { number: 8, name: "CH 08 · Nickelodeon", genre: "90s Nicktoons & Teen TV", accentColor: "#fb923c" },
  { number: 9, name: "CH 09 · Comedy Central", genre: "Stand-Up & Late Night Satire", accentColor: "#fde047" },
  { number: 10, name: "CH 10 · MTV", genre: "Music Videos & Pop Culture", accentColor: "#f472b6" },
  { number: 11, name: "CH 11 · Sci-Fi Channel", genre: "Space, Mystery & Fantasy", accentColor: "#c084fc" },
  { number: 12, name: "CH 12 · AMC", genre: "Classic Cinema & Epic Drama", accentColor: "#a3e635" },
];

export function getChannel(number: number): Channel | undefined {
  return CHANNELS.find((channel) => channel.number === number);
}

export const CHANNEL_NUMBERS = CHANNELS.map((channel) => channel.number);
