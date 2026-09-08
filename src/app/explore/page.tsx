import { Metadata } from "next";
import { ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore & Discover Catalog | Cablecast Retro TV",
  description:
    "Explore, filter and discover movies, TV series, holiday specials and seasonal classics with vintage 90s vibes.",
};

export default function ExplorePage() {
  return <ExploreView />;
}
