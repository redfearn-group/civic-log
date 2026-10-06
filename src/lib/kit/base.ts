/* CANONICAL. Authored in redfearn-group/redfearn-brand under kit/ and
   vendored into each Astro app by sync.mjs. Do not edit the copy in a
   consumer repo: the next sync overwrites it, and the vendor drift CI job
   fails the build first. */

/** Prefix an absolute path with Astro's configured base (e.g. "/garage-log")
 * so internal links still work once deployed under a GitHub Pages project
 * path.
 *
 * Trims rather than collapses. An earlier Canyon Breeze copy of this
 * function used `.replace(/\/+/g, "/")` on the joined string, which
 * collapses every run of slashes anywhere in it: correct for internal
 * paths, and it turns "https://" into "https:/" the first time anyone
 * passes an absolute URL. Handle the join at the seam instead of
 * rewriting the whole string. */
export function withBase(p: string): string {
  const base = import.meta.env.BASE_URL;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedPath = p.startsWith("/") ? p : `/${p}`;
  return trimmedBase + trimmedPath;
}
