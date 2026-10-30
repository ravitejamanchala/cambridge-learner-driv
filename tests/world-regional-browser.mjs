import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.env.TEST_SITE || "dist-world-inspector",
  port = 8895,
  base = `http://127.0.0.1:${port}`;
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(port),
    "--bind",
    "127.0.0.1",
    "--directory",
    root,
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/world-inspector.html")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/world-inspector.html");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#status")
        .textContent.includes("geographic review pending"),
    {},
    { timeout: 60000 },
  );
  assert.doesNotMatch(await page.locator("#status").innerText(), /SYNTHETIC/);
  assert.equal(await page.locator("#tileSelect option").count(), 102);
  const report = JSON.parse(await page.locator("#validation").innerText());
  assert.equal(report.sourceCounts.node, 445855);
  assert.equal(report.rejected.length, 7);
  assert.equal(report.unresolvedReferences.length, 0);
  assert.equal(report.structuralPass, false);
  await page.locator("#locationForm button").click();
  await page.waitForFunction(() =>
    document.querySelector("#scale").textContent.includes("300 px"),
  );
  await page.locator("#boundaries").uncheck();
  await page.locator("#sourceBounds").uncheck();
  await fs.mkdir("test-results/world", { recursive: true });
  await page.screenshot({ path: "test-results/world/regional-reference.png" });
  const id = await page
    .locator("#featureSelect option")
    .nth(1)
    .getAttribute("value");
  await page.locator("#featureSelect").selectOption(id);
  assert.match(await page.locator("#detail").innerText(), /OpenStreetMap/);
  for (const id of ["0_0", "-2_2", "1_-2"]) {
    await page.locator("#tileSelect").selectOption(id);
    await page.waitForFunction(
      (id) => document.querySelector("#status").textContent.includes(id + ":"),
      id,
      { timeout: 60000 },
    );
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "test-results/world/regional-browser.json",
    JSON.stringify(
      {
        passed: true,
        version:
          "52fdf092cb5e518587df60f81ee649591e457ede6b761af903e7ecf17563bef9",
        scope:
          "real local dataset: 102 tiles, reference location, provenance, three tile transitions; not city driving",
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Real Cambridge inspector browser checks passed");
} finally {
  await browser?.close();
  server.kill();
}
