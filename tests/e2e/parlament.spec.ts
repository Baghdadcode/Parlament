import { expect, test } from "@playwright/test";

test("ask a question, watch the debate stream, see the vote and the decision, find it in history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Offline-läge (fejk)")).toBeVisible();
  await expect(page.getByText(/Uppskattad kostnad: ~\$/)).toBeVisible();
  await expect(page.getByText("Magdalena Andersson")).toBeVisible();

  await page.getByLabel("Din fråga till riksdagen").fill("Hur ska elpriserna sänkas?");
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/, { timeout: 30_000 }); // first compile in dev mode is slow
  // Live: the opening round fills in while streaming.
  await expect(page.getByRole("heading", { name: "Debatten" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Jimmie Åkesson" })).toBeVisible();

  // Finished: decision with reservations, and the vote matrix with a winner.
  await expect(page.getByRole("heading", { name: "Riksdagens beslut" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Reservationer" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Votering" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Borda totalt/ })).toBeVisible();
  await expect(page.getByText(/anrop · cacheläsningar/)).toBeVisible({ timeout: 60_000 });

  // Earlier rounds stay readable.
  await page.getByRole("tab", { name: "Öppning" }).click();
  await expect(page.getByRole("article", { name: "Ebba Busch" }).getByText(/Som Ebba Busch föreslår jag/)).toBeVisible();

  await page.getByRole("link", { name: "Historik" }).click();
  await expect(page.getByRole("link", { name: "Hur ska elpriserna sänkas?" })).toBeVisible();
});

test("Speaker-decides mode skips the vote", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Din fråga till riksdagen").fill("Snabb fråga: höjd pension?");
  await page.getByLabel(/Talmannen avgör/).check();
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();
  await expect(page.getByText("Ingen votering i den här sessionen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Riksdagens beslut" })).toBeVisible();
});

test("the members page shows every file and persona", async ({ page }) => {
  await page.goto("/ledamoter");
  for (const name of ["Ulf Kristersson", "Nooshi Dadgostar", "Elisabeth Thand Ringqvist", "Amanda Lind", "Simona Mohamsson", "Talmannen"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByText("moderaterna.md").click();
  await expect(page.getByText(/Arbetslinjen/)).toBeVisible();
});

test("background editor creates and edits a background", async ({ page }) => {
  await page.goto("/bakgrund");
  await page.getByRole("button", { name: "+ Ny bakgrund" }).click();
  await page.getByLabel("Namn").fill("Elmarknaden");
  await page.getByLabel(/^Innehåll/).fill("Elområden: fyra.");
  await page.getByRole("button", { name: "Skapa bakgrund" }).click();
  await expect(page.getByText("Sparad")).toBeVisible();
  await page.getByLabel(/^Innehåll/).fill("Elområden: fyra, sedan 2011.");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Sparad")).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Bakgrund").locator("option", { hasText: "Elmarknaden" })).toHaveCount(1);
});
