import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
export async function buildInspector(out, src = ".") {
  await fs.mkdir(out, { recursive: true });
  await build({
    entryPoints: [path.join(src, "js/world-data/inspector.js")],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: path.join(out, "world-inspector.js"),
  });
  const html = (
    await fs.readFile(path.join(src, "world-inspector.html"), "utf8")
  )
    .replace("js/world-data/inspector.js", "world-inspector.js")
    .replace("js/world-data/inspector.css", "world-inspector.css");
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
