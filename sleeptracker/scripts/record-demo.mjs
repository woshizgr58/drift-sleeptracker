import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
const browser = await chromium.launch(
  existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {},
);
mkdirSync("../artifacts", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: "../artifacts/video", size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const pause = (ms = 1600) => page.waitForTimeout(ms);
const local = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
await page.goto("http://127.0.0.1:8100");
await pause();
await page.screenshot({ path: "../artifacts/today-empty.png", fullPage: true });
await page.getByRole("button", { name: "Log a night", exact: true }).click();
const end = new Date();
end.setDate(end.getDate() - 1);
end.setHours(7, 30, 0, 0);
await page
  .getByLabel("Bedtime", { exact: true })
  .fill(local(new Date(end.getTime() - 8.5 * 3600000)));
await pause(800);
await page.getByLabel("Wake-up", { exact: true }).fill(local(end));
await page
  .getByLabel("Notes")
  .fill("Put my phone away early. A peaceful night.");
await pause(2200);
await page.getByRole("button", { name: "Save sleep" }).click();
await pause(2200);
await page.getByRole("button", { name: "How awake do you feel?" }).click();
await pause();
await page.locator(".scale-option").nth(2).click();
await page.getByLabel("Notes").fill("A relaxed start to the afternoon.");
await pause();
await page.getByRole("button", { name: "Save check-in", exact: true }).click();
await pause();
await page.screenshot({ path: "../artifacts/today.png", fullPage: true });
await page.getByRole("button", { name: "Journal", exact: true }).click();
await pause(3000);
await page.screenshot({ path: "../artifacts/journal.png", fullPage: true });
// A real reload demonstrates persistence, rather than reseeding data.
await page.reload();
await pause(2500);
await page.getByRole("button", { name: "Journal", exact: true }).click();
await pause(3000);
await page.getByRole("button", { name: "Nights", exact: true }).click();
await pause();
await page.locator(".journal-entry").first().click();
await page
  .getByLabel("Notes")
  .fill("Put my phone away early. Woke up refreshed.");
await pause();
await page.getByRole("button", { name: "Save changes" }).click();
await pause();
await page.getByRole("button", { name: "Check-ins", exact: true }).click();
await pause(2500);
await page.getByRole("button", { name: "Settings", exact: true }).click();
await pause(2500);
await page.getByRole("heading", { name: "Backup", exact: true }).scrollIntoViewIfNeeded();
await pause(2500);
await page.getByRole("button", { name: "Today", exact: true }).click();
await page.locator(".brand").scrollIntoViewIfNeeded();
await pause(2000);
const video = page.video();
await context.close();
await video.saveAs("../demo.webm");
await browser.close();
console.log("Recorded ../demo.webm and screenshots in ../artifacts");
