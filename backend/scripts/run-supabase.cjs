#!/usr/bin/env node
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");

const binDir = path.join(__dirname, "..", "node_modules", "supabase", "bin");
const bin = path.join(binDir, process.platform === "win32" ? "supabase.exe" : "supabase");
const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
