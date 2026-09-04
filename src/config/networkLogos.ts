/**
 * Best-effort logo lookup for the World Guide's channel rows. TVmaze's
 * `/schedule` endpoint returns a network's plain display name with no logo
 * of its own, so this is a small curated map (name -> a locally-saved
 * favicon under `public/logos/`, sourced via `scripts/download-logos.ps1`)
 * for the most common broadcast/cable networks. Anything not listed here
 * just falls back to the generic channel icon — there's no reliable, free
 * "logo by network name" API to cover the long tail.
 */
const NETWORK_LOGOS: Record<string, string> = {
  abc: "/logos/abc.png",
  "abc news live": "/logos/abcnews.png",
  nbc: "/logos/nbc.png",
  cbs: "/logos/cbs.png",
  fox: "/logos/fox.png",
  "fox news channel": "/logos/foxnews.png",
  "fox news": "/logos/foxnews.png",
  "the cw": "/logos/cw.png",
  cw: "/logos/cw.png",
  pbs: "/logos/pbs.png",
  cnn: "/logos/cnn.png",
  msnbc: "/logos/msnbc.png",
  "ms now": "/logos/msnbc.png",
  espn: "/logos/espn.png",
  espn2: "/logos/espn.png",
  hbo: "/logos/hbo.png",
  showtime: "/logos/showtime.png",
  amc: "/logos/amc.png",
  "usa network": "/logos/usanetwork.png",
  tbs: "/logos/tbs.png",
  tnt: "/logos/tnt.png",
  fx: "/logos/fx.png",
  fxx: "/logos/fx.png",
  bravo: "/logos/bravo.png",
  "a&e": "/logos/ae.png",
  history: "/logos/history.png",
  "history channel": "/logos/history.png",
  discovery: "/logos/discovery.png",
  "discovery channel": "/logos/discovery.png",
  "comedy central": "/logos/comedycentral.png",
  mtv: "/logos/mtv.png",
  vh1: "/logos/vh1.png",
  bet: "/logos/bet.png",
  univision: "/logos/univision.png",
  telemundo: "/logos/telemundo.png",
  "adult swim": "/logos/adultswim.png",
  "cartoon network": "/logos/cartoonnetwork.png",
  nickelodeon: "/logos/nickelodeon.png",
  "disney channel": "/logos/disneychannel.png",
  "hallmark channel": "/logos/hallmark.png",
  lifetime: "/logos/lifetime.png",
  freeform: "/logos/freeform.png",
  syfy: "/logos/syfy.png",
  "paramount network": "/logos/paramountnetwork.png",
  ovation: "/logos/ovation.png",
  "ion television": "/logos/ion.png",
  ion: "/logos/ion.png",
  "cozi tv": "/logos/cozi.png",
  "bounce tv": "/logos/bounce.png",
  bounce: "/logos/bounce.png",
};

/** Looks up a saved logo for a TVmaze network display name, case-insensitively. */
export function getNetworkLogo(networkName: string): string | null {
  return NETWORK_LOGOS[networkName.trim().toLowerCase()] ?? null;
}
