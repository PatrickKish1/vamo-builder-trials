/**
 * E2B custom template for the builder: pre-baked Next.js app with pnpm, shadcn init.
 * Build once; sandboxes start with zero runtime install — no create-next-app or pnpm install at runtime.
 *
 * Seed path: /home/user/project/seed/frontend (copied to project/{name}/frontend at scaffold).
 */
import { Template, type TemplateClass } from "e2b";

const SEED_DIR = "/home/user/project/seed/frontend";

export const BUILDER_SEED_PATH = SEED_DIR;

/**
 * Template definition: Node image, pnpm, create-next-app at seed path, pnpm install, shadcn init.
 * No start command — we run `pnpm run dev` ourselves when starting preview.
 */
export function getNextJsBuilderTemplate(): TemplateClass {
  return Template()
    .fromNodeImage("20")
    .runCmd("corepack enable && corepack prepare pnpm@latest --activate")
    .runCmd(`mkdir -p /home/user/project/seed`)
    .runCmd(
      `pnpm dlx create-next-app@latest ${SEED_DIR} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes`
    )
    .setWorkdir(SEED_DIR)
    .runCmd("pnpm install")
    .runCmd("pnpm dlx shadcn@latest init --yes")
    .setWorkdir("/home/user")
    .setReadyCmd("test -f /home/user/project/seed/frontend/package.json");
}
