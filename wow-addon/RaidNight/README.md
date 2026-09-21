# Raid Night (WoW addon)

In-game soft reserves for Burning Crusade Classic / TBC Anniversary. Same loot sheet as the [Raid Night website](https://raid-night.onrender.com).

This is **not** the website in a window. WoW addons cannot open web pages. It is a client addon: pick loot, share picks with the raid, export a Gargul CSV.

## Install

1. Unzip so you have:

   `World of Warcraft\_anniversary_\Interface\AddOns\RaidNight\`

   That folder must contain `RaidNight.toc`.

2. Restart WoW (or `/reload` after a full restart once).
3. Type `/rn`.

Classic Era uses `_classic_era_`. TBC Anniversary uses `_anniversary_`.

## Commands

| Command | What it does |
| --- | --- |
| `/rn` | Open / close the window |
| `/rn limit 2` | Raid lead: set how many reserves each player gets |
| `/rn export` | Gargul CSV (copy, then `/gl sr` in game) |

Picks broadcast automatically while you are in a party or raid.

## CurseForge upload

1. Zip the **RaidNight** folder (the zip should contain `RaidNight/RaidNight.toc`, not loose files).
2. Log into [CurseForge](https://authors.curseforge.com/) → **Create project** → World of Warcraft.
3. Category: **Raid**. Supported game: **Burning Crusade Classic** / Anniversary.
4. Upload `RaidNight-1.0.0.zip`.
5. Paste the text from `CURSEFORGE.md` as the long description.

You have to upload from your own CurseForge account. The zip is ready in `wow-addon/`.
