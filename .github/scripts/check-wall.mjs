#!/usr/bin/env node
/**
 * Fails a pull request that removes somebody from WALL.md.
 *
 * Why this exists: contributors edit WALL.md in the GitHub web editor, which
 * saves the whole file against whatever their fork's base was when they opened
 * the page. Every save silently discards rows added in between. On 2026-08-12
 * that had erased 14 of 21 names, and each loss looked like a successful
 * contribution: PR reviewed, merged, CI green, Pages deployed, name gone.
 *
 * A removal is almost never intentional here, so this turns a silent wipe into
 * a red check before the merge button is available.
 *
 * Usage (in CI):  node .github/scripts/check-wall.mjs <base-ref>
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const baseRef = process.argv[2] || "origin/main";
const FILE = "WALL.md";

/** Deliberately forgiving, matching mural.js: a row is any line with a pipe and
 *  a name, whether or not the contributor got the outer pipes right. */
function names(markdown) {
  const out = new Map();
  for (const line of String(markdown).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || !t.includes("|")) continue;
    if (t.startsWith("#") || t.startsWith(">")) continue;
    if (/^\|?[\s:|-]+\|?$/.test(t)) continue;
    const lower = t.toLowerCase();
    if (lower.includes("name") && lower.includes("project")) continue;
    const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const name = cells[0].replace(/\*\*|__|[*_`]/g, "").trim();
    if (!name) continue;
    // Key on letters only so "Sudhanshu pandey" and "Sudhanshu Pandey" match.
    out.set(name.toLowerCase().replace(/[^a-z]/g, ""), name);
  }
  return out;
}

function show(ref) {
  try {
    return execFileSync("git", ["show", `${ref}:${FILE}`], { encoding: "utf8" });
  } catch {
    return null;
  }
}

const baseContent = show(baseRef);
if (baseContent === null) {
  console.log(`No ${FILE} on ${baseRef} — nothing to compare against.`);
  process.exit(0);
}

const before = names(baseContent);
const after = names(readFileSync(FILE, "utf8"));

const removed = [...before.entries()].filter(([k]) => !after.has(k)).map(([, v]) => v);
const added = [...after.entries()].filter(([k]) => !before.has(k)).map(([, v]) => v);

// Duplicates within the PR's own version.
const seen = new Map();
const dupes = [];
for (const line of readFileSync(FILE, "utf8").split(/\r?\n/)) {
  const m = names(line);
  for (const [k, v] of m) {
    if (seen.has(k)) dupes.push(v);
    else seen.set(k, v);
  }
}

console.log(`${FILE}: ${before.size} names on ${baseRef}, ${after.size} in this PR`);
if (added.length) console.log(`Added: ${added.join(", ")}`);

let failed = false;

if (removed.length) {
  failed = true;
  console.log("");
  console.log("::error::This pull request removes " + removed.length + " name(s) from " + FILE + ": " + removed.join(", "));
  console.log("");
  console.log("This is almost always accidental. The GitHub web editor saves the whole");
  console.log("file, so if your fork was behind, your save deletes rows other people");
  console.log("added after you opened the page.");
  console.log("");
  console.log("To fix: sync your fork with the upstream main branch, then re-apply your");
  console.log("own row at the end of the table. On your fork's page use 'Sync fork', or:");
  console.log("");
  console.log("  git remote add upstream https://github.com/accelerate-muj/welcome-mural.git");
  console.log("  git fetch upstream && git rebase upstream/main");
  console.log("");
  console.log("Names that would be lost: " + removed.join(", "));
}

if (dupes.length) {
  console.log("");
  console.log("::warning::Duplicate rows for: " + [...new Set(dupes)].join(", "));
}

if (!failed) console.log("\nNo names removed. Good to merge.");
process.exit(failed ? 1 : 0);
