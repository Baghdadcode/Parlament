import { expect, test } from "@playwright/test";

// Unique per run, so the tests also pass against a database that earlier runs already filled.
const run = Date.now().toString(36);

test("a sitting: chamber, speakers' list, main vote, decision and the record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Offline-läge (fejk)")).toBeVisible();
  await expect(page.getByText(/Uppskattad kostnad: ~\$/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Kammaren" })).toBeVisible();

  await page.getByLabel("Din fråga till riksdagen").fill(`Hur ska elpriserna sänkas? (${run})`);
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
  await expect(page.getByRole("link", { name: `Hur ska elpriserna sänkas? (${run})` })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(run) }).getByText("Bifall 234–97")).toBeVisible();
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

test("the AI model can be switched to Gemini for a sitting", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByLabel("AI-modell");
  await expect(picker).toHaveValue(""); // default: the model each member file names
  await expect(picker.locator("option:checked")).toHaveText("Enligt ledamotsfilerna (Mistral Large)");
  await expect(picker.locator("optgroup")).toHaveCount(4);
  await picker.selectOption({ label: "Gemini 3.1 Pro" });
  await expect(page.getByText("Alla partiledare och talmannen använder den här modellen")).toBeVisible();
  await expect(page.getByText(/Uppskattad kostnad: ~\$/)).toBeVisible();
  await page.getByLabel("Din fråga till riksdagen").fill("Ska elområdena slopas?");
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();
  await expect(page.getByText("Kammaren har bifallit förslaget.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("AI: Gemini 3.1 Pro", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alla anföranden" }).click();
  await expect(page.getByRole("article", { name: "Ebba Busch" }).getByText(/Gemini 3\.1 Pro/)).toBeVisible();
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
  await expect(page.getByText("socialdemokraterna.md · medium")).toBeVisible();
  await expect(page.getByText(/Mistral Large|Claude Opus/)).toHaveCount(0);
  await page.getByText("moderaterna.md").click();
  await expect(page.getByText(/Arbetslinjen/)).toBeVisible();
});

test("background editor creates and edits a background", async ({ page }) => {
  await page.goto("/bakgrund");
  await page.getByRole("button", { name: "+ Ny bakgrund" }).click();
  await page.getByLabel("Namn").fill(`Elmarknaden ${run}`);
  await page.getByLabel(/^Innehåll/).fill("Elområden: fyra.");
  await page.getByRole("button", { name: "Skapa bakgrund" }).click();
  await expect(page.getByText("Sparad")).toBeVisible();
  await page.getByLabel(/^Innehåll/).fill("Elområden: fyra, sedan 2011.");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Sparad")).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Bakgrund").locator("option", { hasText: `Elmarknaden ${run}` })).toHaveCount(1);
});

test("a 1-mot-1 debate: two leaders take turns and the Speaker names the winner", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Din fråga till riksdagen").fill(`Ny kärnkraft? (${run})`);
  await page.getByLabel(/Debatt 1 mot 1/).check();
  await expect(page.getByText("Förberedande votering", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: /Inleder/ }).selectOption({ label: "Ulf Kristersson (M)" });
  await page.getByRole("combobox", { name: /^Mot/ }).selectOption({ label: "Ulf Kristersson (M)" });
  await expect(page.getByText("Välj två olika debattörer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fråga riksdagen" })).toBeDisabled();
  await page.getByRole("combobox", { name: /^Mot/ }).selectOption({ label: "Nooshi Dadgostar (V)" });
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText(/§ 1 Debatt 1 mot 1: Ulf Kristersson \(M\) mot Nooshi Dadgostar \(V\)/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Debatt 1 mot 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ulf Kristersson vann debatten" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("TALMANNENS AVGÖRANDE", { exact: true })).toBeVisible();
  await expect(page.getByText("VINNARE", { exact: true })).toBeVisible();
  await expect(page.getByText(/anrop · cacheläsningar/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Huvudvotering")).toHaveCount(0);

  // Six speeches, alternating.
  const list = page.getByRole("navigation", { name: "Talarlista" });
  await expect(list.getByRole("button")).toHaveCount(6);
  await expect(list.getByRole("button").nth(1)).toContainText("Nooshi Dadgostar");

  await page.getByRole("tab", { name: "Protokoll" }).click();
  await expect(page.getByText("Talmannen förklarade Ulf Kristersson (M) som vinnare av debatten.")).toBeVisible();

  await page.getByRole("link", { name: "Protokoll", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(run) }).filter({ hasText: "Ny kärnkraft" }).getByText("1 mot 1")).toBeVisible();
});

test("your own member: write it on the members page, then debate a party leader 1 mot 1", async ({ page }) => {
  await page.goto("/ledamoter");
  await expect(page.getByRole("heading", { name: "Egna ledamöter" })).toBeVisible();
  await expect(page.getByText("Astrid Lindgren", { exact: true })).toBeVisible(); // the shipped example

  // A broken file is refused with the reason.
  await page.getByRole("button", { name: "+ Ny ledamot" }).click();
  await page.getByLabel(/Ny ledamot/).fill("bara text");
  await page.getByRole("button", { name: "Skapa ledamot" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /frontmatter/ })).toBeVisible();

  const name = `Testa Testsson ${run}`;
  await page.getByLabel(/Ny ledamot/).fill(`---\nname: ${name}\ntitle: Kommunalråd\nshort: TT\n---\nEn lugn lokalpolitiker som älskar cykelbanor.`);
  await page.getByRole("button", { name: "Skapa ledamot" }).click();
  await expect(page.getByText(/Sparad som members\/egna\/testa-testsson-/)).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Upload a ready-made file too.
  await page.getByRole("button", { name: "+ Ny ledamot" }).click();
  await page.getByLabel("Ladda upp en ledamotsfil").setInputFiles({
    name: "upp.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(`---\nname: Uppa Laddsson ${run}\nshort: UL\n---\nKommer från en fil.`),
  });
  await expect(page.getByText("upp.md inläst. Granska och spara.")).toBeVisible();
  await page.getByRole("button", { name: "Skapa ledamot" }).click();
  await expect(page.getByText(/Sparad som members\/egna\/uppa-laddsson-/)).toBeVisible();

  await page.goto("/");
  await page.getByLabel("Din fråga till riksdagen").fill(`Fler cykelbanor? (${run})`);
  await page.getByLabel(/Debatt 1 mot 1/).check();
  await page.getByRole("combobox", { name: /Inleder/ }).selectOption({ label: `${name} (Kommunalråd)` });
  await page.getByRole("combobox", { name: /^Mot/ }).selectOption({ label: "Ebba Busch (KD)" });
  await page.getByRole("button", { name: "Fråga riksdagen" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: `${name} vann debatten` })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(new RegExp(`Debatt 1 mot 1: ${name} \\(TT\\) mot Ebba Busch \\(KD\\)`))).toBeVisible();
});
