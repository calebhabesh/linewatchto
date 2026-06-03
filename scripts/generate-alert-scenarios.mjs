import { mkdir, writeFile } from "node:fs/promises";
import { buildScenarioFeed, scenarioExpectations, scenarioNames } from "./alert-scenario-catalog.mjs";

const outputDir = new URL("../backend/src/test/resources/fixtures/ttc-alert-scenarios/", import.meta.url);
const fixedNow = "2026-06-03T15:00:00.000Z";

await mkdir(outputDir, { recursive: true });

for (const name of scenarioNames) {
  const feed = buildScenarioFeed(name, { now: fixedNow });
  await writeFile(
    new URL(`${name}.json`, outputDir),
    `${JSON.stringify(feed, null, 2)}\n`,
    "utf8",
  );
}

await writeFile(
  new URL("scenario-index.json", outputDir),
  `${JSON.stringify({ generatedAt: fixedNow, scenarios: scenarioNames.map((name) => ({
    name,
    file: `${name}.json`,
    ...scenarioExpectations[name],
  })) }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${scenarioNames.length} LineWatch alert scenarios to ${outputDir.pathname}`);
