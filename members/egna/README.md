# Egna ledamöter

Här lägger du dina egna ledamöter: vem som helst, till exempel dig själv, en historisk person, en lokalpolitiker
eller en romanfigur. De kan debattera i **Debatt 1 mot 1**, mot en partiledare eller mot varandra. De deltar inte i
partiledardebatten.

Skapa en fil här (eller på sidan **Ledamöter** i appen, där du också kan ladda upp en färdig .md-fil). Bara `name:`
och en beskrivning under frontmatter krävs:

```md
---
name: Ditt namn
title: Gästtalare          # valfritt: titel på namnskylten
party: Partilös            # valfritt: parti, rörelse eller vad personen står för
short: DN                  # valfritt: förkortning, högst 5 tecken (annars initialerna)
color: "#7C3AED"           # valfritt: färg i gränssnittet (annars en från en fast palett)
id: ditt-namn              # valfritt: annars skapas id:t av namnet
enabled: true              # valfritt: false = visas inte i listan
model: mistral-large-latest
effort: medium
---
## Vem du är
...
## Åsikter och värderingar
...
## Debattstil
...
## Röda linjer
...
```

- Allt under frontmatter blir personans beskrivning, ordagrant. `<!-- kommentarer -->` tas bort.
- `id` och `short` får inte krocka med en partiledare eller en annan egen ledamot. En fil med fel hoppas över, och
  felet visas på sidan Ledamöter.
- Filerna läses på nytt vid varje fråga, så ändringar gäller direkt.
- `astrid-lindgren.md` är ett exempel; ändra eller ta bort den.
