import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

/**
 * Server Component gate on top of `src/proxy.ts` — Proxy already blocks
 * non-admins from ever reaching this route, but re-checking here means the
 * page is still safe on its own if a future matcher change ever loosens
 * Proxy's coverage (see the Next.js Data Security guidance on not relying
 * on Proxy alone).
 */
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/gate");
  if (session.role !== "admin") redirect("/home");

  return <AdminDashboard />;
}
