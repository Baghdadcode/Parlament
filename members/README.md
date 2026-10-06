# Ledamöter

Varje `.md`-fil i den här mappen (utom den här README-filen) är en deltagare i debatten. Filerna läses in på nytt
varje gång du ställer en fråga, så ändringar gäller direkt, utan att du behöver starta om `npm run dev`.

## Format

```md
---
id: s                    # kort, unikt id (små bokstäver, siffror, bindestreck)
name: Magdalena Andersson
party: Socialdemokraterna
short: S                 # partiförkortning
color: "#E8112D"         # partifärg i gränssnittet
role: ledamot            # ledamot (debatterar och röstar) eller talman (skriver beslutet)
title: Partiordförande   # titel på namnskylten
seats: 107               # mandat: ritas i kammaren och väger rösten i huvudvoteringen
placement: 2             # plats i kammardiagrammet, vänster (1) till höger
enabled: true            # false = sitter över
order: 1                 # ordning i gränssnittet
model: mistral-large-latest  # eller mistral-medium-latest, claude-opus-5-5, gemini-3.1-pro-preview …
effort: medium           # low | medium | high | xhigh | max
---
Fri markdown: personlighet, ideologi, debattstil, relationer, röda linjer ...
```

- I `talman.md` anger `address: Herr talman` (eller `Fru talman`) hur partiledarna inleder sina anföranden.
- Om ingen fil anger `seats` får alla en röst var i huvudvoteringen och lika många platser i kammaren.
- Mandaten i filerna är från valet 2022; uppdatera dem till 2026 års resultat.
- `model` gäller när du väljer "Enligt ledamotsfilerna" i AI-modellväljaren. Väljer du en modell där, används den
  för alla. Mistral-modeller kräver `MISTRAL_API_KEY`, Claude-modeller `ANTHROPIC_API_KEY` och Gemini-modeller
  `GEMINI_API_KEY`. Utan `model:` används Mistral Large.
- Allt under frontmatter blir personans beskrivning i prompten, ordagrant.
- `<!-- HTML-kommentarer -->` tas bort innan texten skickas, så du kan skriva anteckningar till dig själv.
- Lägg till en ny fil för att lägga till en deltagare; sätt `enabled: false` eller ta bort filen för att ta bort en.
- Det behövs minst 3 och högst 9 aktiva ledamöter, och högst en talman (saknas talman används en neutral standardtalman).
- Personerna är AI-simuleringar som bygger på partiernas och ledarnas offentliga hållning. De är inte de verkliga
  personernas åsikter, och fakta kan vara inaktuella, så redigera fritt.
