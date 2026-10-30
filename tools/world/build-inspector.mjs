import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { installDataset } from "./archive.mjs";
export async function buildInspector(out, src = ".") {
  await fs.mkdir(out, { recursive: true });
  await build({
    entryPoints: [path.join(src, "js/world-data/inspector.js")],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: path.join(out, "world-inspector.js"),
  });
  let html = (await fs.readFile(path.join(src, "world-inspector.html"), "utf8"))
    .replace("js/world-data/inspector.js", "world-inspector.js")
    .replace("js/world-data/inspector.css", "world-inspector.css");
  await build({entryPoints:[path.join(src,'js/world-data/assets-preview.js')],bundle:true,format:'esm',target:'es2022',outfile:path.join(out,'street-assets.js')});
  await fs.writeFile(path.join(out,'street-assets.html'),(await fs.readFile(path.join(src,'street-assets.html'),'utf8')).replace('js/world-data/assets-preview.js','street-assets.js'));
  const archive = path.join(src, "data/world/cambridge.json.gz");
  const available = await fs.access(archive).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (available) {
    const index = await installDataset(
      archive,
      path.join(out, "world-data/cambridge"),
    );
    html = html
      .replace(
        'value="tests/fixtures/world/dataset/index.json"',
        'value="world-data/cambridge/index.json"',
      )
      .replace(
        "The bundled example is synthetic test\n      geometry.",
        "Cambridge source data is awaiting acceptance.",
      );
    console.log("Cambridge inspection dataset: " + index.version);
  }
  await fs.writeFile(path.join(out, "world-inspector.html"), html);
  await fs.copyFile(
    path.join(src, "js/world-data/inspector.css"),
    path.join(out, "world-inspector.css"),
  );
  await fs.cp(
    path.join(src, "tests/fixtures/world/dataset"),
    path.join(out, "tests/fixtures/world/dataset"),
    { recursive: true },
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = process.argv[2] || "dist-world-inspector";
  await buildInspector(out);
  console.log("Built data-stage inspector at " + out + "/world-inspector.html");
}
