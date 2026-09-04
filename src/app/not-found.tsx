import Link from "next/link";
import { RetroTvError } from "@/components/ui/404-error-page";

/**
 * Next.js's file-convention 404 — rendered whenever a signed-in session
 * hits a route that doesn't exist. (Signed-out visitors never see this:
 * `src/proxy.ts` redirects them to `/gate` before routing even gets this
 * far, same as it would for any other page.)
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-black px-4 py-16 text-center">
      <div className="scale-75 sm:scale-90 md:scale-100">
        <RetroTvError errorCode="404" errorMessage="NOT FOUND" />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">Cablecast</p>
        <h1 className="mt-2 text-xl font-bold uppercase tracking-wide text-white">This Channel Isn&apos;t Broadcasting</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">
          Whatever you tuned into doesn&apos;t exist. Head back to the guide and pick something that&apos;s actually on air.
        </p>

        <Link
          href="/home"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-neutral-200"
        >
          Back to Live Guide
        </Link>
      </div>
    </div>
  );
}
