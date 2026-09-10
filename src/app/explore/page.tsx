import { Metadata } from "next";
import { CablecastApp } from "@/components/home/CablecastApp";

export const metadata: Metadata = {
  title: "Explore & Discover Catalog | Cablecast Retro TV",
  description:
    "Explore, filter and discover movies, TV series, and seasonal classics with vintage 90s vibes.",
};

export default function ExplorePage() {
  return <CablecastApp initialView="explore" />;
}
