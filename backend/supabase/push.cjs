#!/usr/bin/env node
"use strict";
/**
 * Push migrations from this supabase dir to the linked remote database.
 * Run from backend:  node supabase/push.cjs
 * Or:  pnpm run db:push  (same thing)
 *
 * Migrations are idempotent (DROP POLICY IF EXISTS etc.) so re-run / already-applied is safe.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const backendDir = path.join(__dirname, "..");
const runSupabase = path.join(backendDir, "scripts", "run-supabase.cjs");
const args = ["db", "push", ...process.argv.slice(2)];

const result = spawnSync(process.execPath, [runSupabase, ...args], {
  cwd: backendDir,
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
