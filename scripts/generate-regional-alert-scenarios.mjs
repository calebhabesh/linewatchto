import { mkdir, writeFile } from "node:fs/promises";
import {
  buildRegionalScenario,
  regionalScenarioExpectations,
  regionalScenarioNames,
} from "./regional-alert-scenario-catalog.mjs";

const outputDir = new URL(
  "../backend/src/test/resources/fixtures/metrolinx-alert-scenarios/",
  import.meta.url,
);
const fixedNow = "2026-07-29T18:00:00.000Z";
await mkdir(outputDir, { recursive: true });

for (const name of regionalScenarioNames) {
  await writeFile(
    new URL(`${name}.json`, outputDir),
    `${JSON.stringify(buildRegionalScenario(name, { now: fixedNow }), null, 2)}\n`,
  );
}
await writeFile(
  new URL("scenario-index.json", outputDir),
  `${JSON.stringify({
    generatedAt: fixedNow,
    scenarios: regionalScenarioNames.map((name) => ({
      name,
      file: `${name}.json`,
      ...regionalScenarioExpectations[name],
    })),
  }, null, 2)}\n`,
);
console.log(`Wrote ${regionalScenarioNames.length} regional alert scenarios to ${outputDir.pathname}`);
