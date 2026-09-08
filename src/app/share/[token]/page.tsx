import { Metadata } from "next";
import { ChannelResolveView } from "@/components/social/ChannelShareHub";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Import Shared Channel Lineup | Cablecast",
  description: "Preview and import a shared retro broadcast channel lineup into your Cablecast television.",
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <ChannelResolveView token={token} />;
}
