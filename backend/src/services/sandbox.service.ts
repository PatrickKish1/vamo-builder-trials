/**
 * Sandbox (E2B) service: create, sync files, run commands, preview.
 *
 * Runtime design (to evolve; start simple by file/project type):
 * - Prefer per-file or per-project detection: infer language from file extension or
 *   project files (package.json, requirements.txt, Cargo.toml, go.mod, etc.) and only
 *   install/check that runtime when the user runs (no bloat).
 * - Multi-language: user may add JS then TS then Java; handle on demand (e.g. when
 *   run is requested, resolve language from current files and ensure that runtime).
 * - Python: support venv (create/use venv, pip install into it) when running Python.
 * - Versions: check runtime versions and support upgrade/latest where needed (e.g.
 *   node, python, java, rust). Java/Solidity/Rust/Move need extra setup (JDK, solc,
 *   toolchains) and should be wired in as we add them.
 */
import { Sandbox } from "e2b";
import { env } from "../config/env.js";
import { badRequest } from "../utils/errors.js";

const E2B_WORKDIR = "/home/user";

interface SandboxEntry {
  sandboxId: string;
  sandbox: Sandbox;
}

const projectToSandbox = new Map<string, SandboxEntry>();

function requireE2B(): void {
  if (!env.e2bApiKey) {
    throw new Error("E2B_API_KEY is required for sandbox operations");
  }
}

export async function createSandbox(
  projectId: string,
  templateId?: string
): Promise<{ sandboxId: string }> {
  requireE2B();
  if (!projectId) throw badRequest("Project ID is required");

  const existing = projectToSandbox.get(projectId);
  if (existing) {
    const running = await existing.sandbox.isRunning().catch(() => false);
    if (running) {
      return { sandboxId: existing.sandboxId };
    }
    projectToSandbox.delete(projectId);
  }

  const sandbox = templateId
    ? await Sandbox.create(templateId, { apiKey: env.e2bApiKey })
    : await Sandbox.create({ apiKey: env.e2bApiKey });

  projectToSandbox.set(projectId, { sandboxId: sandbox.sandboxId, sandbox });
  return { sandboxId: sandbox.sandboxId };
}

export async function getSandboxForProject(projectId: string): Promise<Sandbox | null> {
  const entry = projectToSandbox.get(projectId);
  if (!entry) return null;
  const running = await entry.sandbox.isRunning().catch(() => false);
  if (!running) {
    projectToSandbox.delete(projectId);
    return null;
  }
  return entry.sandbox;
}

export interface FileToSync {
  path: string;
  content: string;
  isFolder?: boolean;
}

export async function syncFilesToSandbox(
  projectId: string,
  files: FileToSync[]
): Promise<{ synced: number }> {
  requireE2B();
  const sandbox = await getSandboxForProject(projectId);
  if (!sandbox) throw badRequest("No running sandbox for this project. Call create first.");

  const writeEntries = files
    .filter((f) => !f.isFolder)
    .map((f) => ({
      path: `${E2B_WORKDIR}/${f.path.replace(/^\//, "")}`,
      data: f.content,
    }));

  if (writeEntries.length === 0) {
    return { synced: 0 };
  }

  await sandbox.files.write(writeEntries);
  return { synced: writeEntries.length };
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommand(
  projectId: string,
  command: string
): Promise<RunCommandResult> {
  requireE2B();
  const sandbox = await getSandboxForProject(projectId);
  if (!sandbox) throw badRequest("No running sandbox for this project. Call create first.");

  const result = await sandbox.commands.run(command, {
    cwd: E2B_WORKDIR,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

export async function getPreviewUrl(
  projectId: string,
  port: number
): Promise<{ url: string }> {
  requireE2B();
  const sandbox = await getSandboxForProject(projectId);
  if (!sandbox) throw badRequest("No running sandbox for this project. Call create first.");

  const host = sandbox.getHost(port);
  const url = host.startsWith("http") ? host : `https://${host}`;
  return { url };
}

export async function killSandbox(projectId: string): Promise<{ ok: boolean }> {
  requireE2B();
  const entry = projectToSandbox.get(projectId);
  if (!entry) return { ok: true };
  try {
    await entry.sandbox.kill();
  } catch {
    // already dead
  }
  projectToSandbox.delete(projectId);
  return { ok: true };
}

export function suggestCommands(files: { path: string; content?: string }[]): {
  install: string | null;
  run: string | null;
  language: string;
} {
  const hasPackageJson = files.some(
    (f) => f.path === "package.json" || f.path.endsWith("/package.json")
  );
  const hasPnpmLock = files.some(
    (f) => f.path === "pnpm-lock.yaml" || f.path.endsWith("/pnpm-lock.yaml")
  );
  const hasYarnLock = files.some(
    (f) => f.path === "yarn.lock" || f.path.endsWith("/yarn.lock")
  );
  const hasBunLock = files.some(
    (f) => f.path === "bun.lockb" || f.path.endsWith("/bun.lockb")
  );
  const hasRequirements = files.some(
    (f) => f.path === "requirements.txt" || f.path.endsWith("/requirements.txt")
  );
  const hasCargoToml = files.some(
    (f) => f.path === "Cargo.toml" || f.path.endsWith("/Cargo.toml")
  );
  const hasGoMod = files.some((f) => f.path === "go.mod" || f.path.endsWith("/go.mod"));

  if (hasPackageJson) {
    const install = hasPnpmLock
      ? "pnpm install"
      : hasYarnLock
        ? "yarn install"
        : hasBunLock
          ? "bun install"
          : "pnpm install";
    return {
      install,
      run: "pnpm run dev",
      language: "node",
    };
  }
  if (hasRequirements) {
    return {
      install: "pip install -r requirements.txt",
      run: "python main.py",
      language: "python",
    };
  }
  if (hasCargoToml) {
    return {
      install: null,
      run: "cargo run",
      language: "rust",
    };
  }
  if (hasGoMod) {
    return {
      install: null,
      run: "go run .",
      language: "go",
    };
  }
  return {
    install: null,
    run: null,
    language: "unknown",
  };
}
