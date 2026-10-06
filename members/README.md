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
enabled: true            # false = sitter över
order: 1                 # ordning i gränssnittet
model: claude-opus-5-5   # eller claude-sonnet-5-5 (billigare)
effort: medium           # low | medium | high | xhigh | max
---
Fri markdown: personlighet, ideologi, debattstil, relationer, röda linjer ...
```

- Allt under frontmatter blir personans beskrivning i prompten, ordagrant.
- `<!-- HTML-kommentarer -->` tas bort innan texten skickas, så du kan skriva anteckningar till dig själv.
- Lägg till en ny fil för att lägga till en deltagare; sätt `enabled: false` eller ta bort filen för att ta bort en.
- Det behövs minst 3 och högst 9 aktiva ledamöter, och högst en talman (saknas talman används en neutral standardtalman).
- Personerna är AI-simuleringar som bygger på partiernas och ledarnas offentliga hållning. De är inte de verkliga
  personernas åsikter, och fakta kan vara inaktuella, så redigera fritt.
