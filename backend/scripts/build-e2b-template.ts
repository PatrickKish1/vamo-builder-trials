/**
 * Build the E2B Next.js builder template once. Run with: pnpm exec tsx scripts/build-e2b-template.ts
 * Requires E2B_API_KEY in env. After building, set E2B_BUILDER_TEMPLATE_NAME=code-easy-nextjs to use it.
 */
import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { getNextJsBuilderTemplate } from "../src/e2b-templates/nextjs-builder.js";

const TEMPLATE_NAME = "code-easy-nextjs";
const apiKey = process.env.E2B_API_KEY;
if (!apiKey) {
  console.error("E2B_API_KEY is required. Add it to .env");
  process.exit(1);
}

async function main() {
  const exists = await Template.exists(TEMPLATE_NAME, { apiKey });
  if (exists) {
    console.log(`Template "${TEMPLATE_NAME}" already exists. Skipping build.`);
    console.log("To rebuild, delete the template in E2B dashboard or use a new name/tag.");
    return;
  }

  console.log("Building E2B template:", TEMPLATE_NAME);
  const template = getNextJsBuilderTemplate();
  const buildInfo = await Template.build(template, TEMPLATE_NAME, {
    apiKey,
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log("Build complete:", buildInfo.templateId, buildInfo.name);
  console.log("Set E2B_BUILDER_TEMPLATE_NAME=" + TEMPLATE_NAME + " in backend .env to use this template.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
