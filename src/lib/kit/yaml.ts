/* CANONICAL. Authored in redfearn-group/redfearn-brand under kit/ and
   vendored into each Astro app by sync.mjs. Do not edit the copy in a
   consumer repo: the next sync overwrites it, and the vendor drift CI job
   fails the build first. */

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

/** Absolute path to the repo's data/ directory.
 *
 * Resolved from cwd, which is the repo root under both `astro dev` and
 * `astro build`. */
export const DATA_DIR = path.resolve(process.cwd(), "data");

/** Read and parse a YAML file, returning `fallback` if it is absent or
 * parses to null.
 *
 * A missing file is deliberately not an error. These repos ship data files
 * that are legitimately empty or not yet created, and a build that dies
 * because a tracker has no entries yet would be worse than a page that
 * renders an empty state.
 *
 * The cast is unchecked: nothing validates that the file's shape matches T.
 * A YAML typo produces `undefined` at the point of use rather than a parse
 * error here. */
export function readYaml<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  return (parsed as T) ?? fallback;
}

/** readYaml against a path relative to the repo's data/ directory.
 * `readData("meetings.yaml", { meetings: [] })` rather than repeating the
 * path.join(DATA_DIR, ...) at every call site. */
export function readData<T>(relPath: string, fallback: T): T {
  return readYaml(path.join(DATA_DIR, relPath), fallback);
}
