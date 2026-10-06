import { expect, test } from "@playwright/test";

test("a sitting: chamber, speakers' list, main vote, decision and the record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Offline-läge (fejk)")).toBeVisible();
  await expect(page.getByText(/Uppskattad kostnad: ~\$/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Kammaren" })).toBeVisible();

  await page.getByLabel("Din fråga till riksdagen").fill("Hur ska elpriserna sänkas?");
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/, { timeout: 30_000 }); // first compile in dev mode is slow
  await expect(page.getByText(/Riksdagens protokoll \d{4}\/\d{2}:\d+/).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Talarlista" })).toBeVisible();

  // The main vote ends with the gavel, and the decision becomes a formal document.
  await expect(page.getByText("Kammaren har bifallit förslaget.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/anrop · cacheläsningar/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "En finansierad reform med årlig uppföljning" })).toBeVisible();
  await expect(page.getByText("BIFALLET")).toBeVisible();
  await expect(page.getByText("Riksdagen beslutar att")).toBeVisible();
  await expect(page.getByText("(SD, C)")).toBeVisible(); // reservation 1 is förslag B and E
  await expect(page.getByText(/Votering: Ja 234 · Nej 97 · Avstår 18 · Frånvarande 0/)).toBeVisible();

  // Pick a speech from the speakers' list: it goes up to the rostrum.
  const list = page.getByRole("navigation", { name: "Talarlista" });
  await list.getByRole("button", { name: /Ebba Busch/ }).first().click();
  const rostrum = page.getByRole("region", { name: "Talarstolen" });
  await expect(rostrum.getByText("Herr talman! Som Ebba Busch föreslår jag")).toBeVisible();
  await expect(rostrum.getByText("Anf. 6 · Anföranden")).toBeVisible();

  // Every speech side by side.
  await page.getByRole("button", { name: "Alla anföranden" }).click();
  await expect(page.getByRole("article", { name: "Jimmie Åkesson" })).toBeVisible();

  // The record of proceedings.
  await page.getByRole("tab", { name: "Protokoll" }).click();
  await expect(page.getByRole("heading", { name: /Riksdagens protokoll/ })).toBeVisible();
  await expect(page.getByText("Anf. 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Huvudvotering/ })).toBeVisible();
  await expect(page.getByText("Kammaren biföll talmannens förslag.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skriv ut / spara som PDF" })).toBeVisible();

  await page.getByRole("link", { name: "Protokoll", exact: true }).click();
  await expect(page.getByRole("link", { name: "Hur ska elpriserna sänkas?" })).toBeVisible();
  await expect(page.getByText("Bifall 234–97")).toBeVisible();
});

test("Speaker-decides mode skips the preliminary vote but still holds the main vote", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Din fråga till riksdagen").fill("Snabb fråga: höjd pension?");
  await page.getByLabel(/Talmannen avgör/).check();
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();
  await expect(page.getByText("Kammaren har bifallit förslaget.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Valt förslag: A \(S\)/)).toBeVisible();
  await expect(page.getByText("Förberedande votering (anonym rangordning av slutförslagen)")).toHaveCount(0);
});

test("sound is off by default and can be turned on", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "🔇 Ljud av" }).click();
  await expect(page.getByRole("button", { name: "🔊 Ljud på" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "🔊 Ljud på" })).toBeVisible();
});

test("the members page shows every file, title and seats", async ({ page }) => {
  await page.goto("/ledamoter");
  for (const name of ["Ulf Kristersson", "Nooshi Dadgostar", "Elisabeth Thand Ringqvist", "Amanda Lind", "Simona Mohamsson", "Talmannen"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Partiordförande, Socialdemokraterna · 107 mandat/)).toBeVisible();
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
