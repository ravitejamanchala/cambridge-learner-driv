import fs from "node:fs/promises";
import { acquire } from "./acquire.mjs";
import { build } from "./build.mjs";
const [
  command,
  configFile = "configs/world/cambridge.json",
  source = ".world-sources/cambridge",
  out = ".world-datasets/cambridge",
] = process.argv.slice(2);
try {
  const config = JSON.parse(await fs.readFile(configFile, "utf8"));
  if (command === "acquire") await acquire(config, source);
  else if (command === "build") {
    const r = await build(config, source, out);
    console.log(
      JSON.stringify(
        {
          index: r.dir + "/index.json",
          version: r.manifest.version,
          structuralPass: r.report.structuralPass,
          dataGate: r.report.dataGate,
        },
        null,
        2,
      ),
    );
  } else
    throw Error(
      "Usage: node --use-env-proxy tools/world/cli.mjs acquire|build [config.json] [source-directory] [output-root]",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
