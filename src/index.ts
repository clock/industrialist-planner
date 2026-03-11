import { createAppWithDefaultStore } from "./tui/app";

async function main(): Promise<void> {
  const app = createAppWithDefaultStore();
  await app.start();
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
