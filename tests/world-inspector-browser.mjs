import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const root = process.env.TEST_SITE || ".",
  port = 8894,
  base = "http://127.0.0.1:" + port;
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
const errors = [];
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
    viewport: { width: 1440, height: 960 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    base +
      "/world-inspector.html?index=tests/fixtures/world/dataset/index.json",
  );
  await page.waitForFunction(() =>
    document
      .getElementById("status")
      .textContent.includes("geographic review pending"),
  );
  assert.match(await page.locator("#gate").textContent(), /NOT ACCEPTED/);
  assert.match(await page.locator("#status").textContent(), /SYNTHETIC/);
  await page.locator("#featureSelect").selectOption("relation/101");
  assert.match(await page.locator("#detail").textContent(), /height tag/);
  await fs.mkdir("test-results/world", { recursive: true });
  await page.screenshot({ path: "test-results/world/inspector-desktop.png" });
  const canvas = page.locator("#map"),
    before = await canvas.screenshot(),
    box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 45,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.notDeepEqual(
    await canvas.screenshot(),
    before,
    "drag pans source view",
  );
  const scale = await page.locator("#scale").textContent();
  await canvas.focus();
  await page.keyboard.press("+");
  assert.notEqual(await page.locator("#scale").textContent(), scale);
  await page.locator("#fit").click();
  await page.locator("#boundaries").uncheck();
  await page.locator("#boundaries").check();
  await page.getByLabel("building (2)", { exact: true }).uncheck();
  await page.getByLabel("building (2)", { exact: true }).check();
  await page.locator("#latitude").fill("51");
  await page.locator("#locationForm button").click();
  assert.match(await page.locator("#status").textContent(), /outside/);
  await page.locator("#latitude").fill("52.21829");
  await page.locator("#locationForm button").click();
  // Delayed old tile response must not replace the latest selection.
  await page.route("**/tiles/1_1.json", async (route) => {
    await new Promise((r) => setTimeout(r, 350));
    await route.continue();
  });
  await page.locator("#tileSelect").selectOption("1_1");
  await page.locator("#tileSelect").selectOption("-1_0");
  await page.waitForFunction(() =>
    document.getElementById("status").textContent.includes("-1_0:"),
  );
  await page.waitForTimeout(450);
  assert.equal(await page.locator("#tileSelect").inputValue(), "-1_0");
  await page.unroute("**/tiles/1_1.json");
  // An unread tile failure stays visibly failed; re-selection retries it.
  await page.route("**/tiles/1_-2.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.locator("#tileSelect").selectOption("1_-2");
  await page.waitForFunction(() =>
    document.getElementById("status").textContent.startsWith("Tile failed:"),
  );
  await page.screenshot({ path: "test-results/world/inspector-failure.png" });
  await page.unroute("**/tiles/1_-2.json");
  await page.locator("#tileSelect").selectOption("0_0");
  await page.locator("#tileSelect").selectOption("1_-2");
  await page.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1_-2:"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/world/inspector-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "test-results/world/browser.json",
    JSON.stringify(
      {
        passed: true,
        root,
        tests: [
          "load synthetic dataset",
          "provenance selection",
          "drag pan",
          "keyboard zoom",
          "layer toggles",
          "out of extent",
          "stale response",
          "failed tile and recovery",
          "390px layout",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("World inspector browser checks passed");
} finally {
  await browser?.close();
  server.kill();
}
