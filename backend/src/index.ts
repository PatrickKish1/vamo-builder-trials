import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { createApp } = await import("./app.js");
const { env } = await import("./config/env.js");

const app = createApp();

app.listen(env.port, () => {
  console.log(`Backend listening on port ${env.port}`);
});
