# Raid Night (WoW addon)

In-game soft reserves for TBC Anniversary and WoW Forever. In TBC it uses the same loot sheet as the [Raid Night website](https://raid-night.onrender.com).

This is **not** the website in a window. WoW addons cannot open web pages. It is a client addon: pick loot, share picks with the raid, export a Gargul CSV.

## Install

1. Unzip so you have:

   `World of Warcraft\_anniversary_\Interface\AddOns\RaidNight\`

   That folder must contain `RaidNight.toc`.

2. Restart WoW (or `/reload` after a full restart once).
3. Type `/rn`.

Classic Era uses `_classic_era_`. TBC Anniversary uses `_anniversary_`. For WoW Forever, put the same `RaidNight` folder in WoW Forever's `Interface\AddOns` folder.

## How a raid uses it

1. Form a party or raid. **The WoW group leader is the Raid Night lead.**
2. Lead types `/rn`. The window has three tabs: **Picks**, **Group**, and **Raid**.
3. On **Raid**, the lead chooses the instance, sets 1–6 reserves with + / −, and clicks **Start sheet**.
4. That posts in raid/party chat: type `/rn` and pick.
5. Everyone else with the addon types `/rn`, opens **Picks**, and clicks their items.
6. **Group** lists every member, marks **lead** / **you**, and shows their reserves (or “needs addon” / “no picks yet”).
7. The first time you open the window, the wisp walks each control and explains it, then sits back at the side of the window. **Next** moves on, **Skip** sends it home. `/rn tour` plays it again. After that, the wisp goes back to reminding the raid to fill reserves, start the sheet, and lock.
8. The raid leader can **right-click** an item to hard reserve it. A hard reserve does not use a soft-reserve slot. If it drops, it is theirs, and nobody else can reserve it. Right-click it again to drop it. Anyone who is not the raid leader keeps soft reserving with a left click.
9. When the lead is ready, they click **Lock SRs**. Nobody can change picks or hard reserves until the lead clicks **Unlock SRs**.
10. On **Group**, the lead clicks **Gargul CSV** when loot starts. Hard reserves are included as the raid leader's rows marked `HR`.
11. **Clear my picks** removes only your soft reserves. **Clear sheet** on the Raid tab wipes everyone's picks and hard reserves, and only the raid leader can use it.

## WoW Forever

Raid Night detects WoW Forever automatically and offers its raids: **The Barrow Deeps**, **Hyjal Summit** and **Onyxia's Lair**.
Forever's loot tables aren't built in yet, so reserve items by link:

1. Click the search box in Raid Night.
2. Shift-click any item link (in chat, your bags, a loot window, or anywhere else WoW shows items). It appears in the list.
3. Click it to reserve it. You can also type an item ID into the search box.

During a boss fight WoW blocks addon messages, so Raid Night holds anything it needs to send and sends it when the fight ends.
If WoW can't play the wisp's own chime, it uses the game's whisper sound instead.

| Command | What it does |
| --- | --- |
| `/rn` | Open / close the window |
| `/rn start` | Same as the Start sheet button (lead only) |
| `/rn lock` | Lead: freeze all picks |
| `/rn unlock` | Lead: allow changes again |
| `/rn limit 2` | Lead: set how many reserves each player gets |
| `/rn export` | Gargul CSV (copy, then `/gl sr` in game) |
| `/rn clear` | Clear your own picks (asks “are you sure?”) |
| `/rn clearsheet` | Raid leader: clear everyone's picks and hard reserves |
| `/rn tour` | Wisp walks through the window, then sits back down |
| `/rn helper` | Bring the wisp back if you clicked Later |
| `/rn sound` | Turn the wisp's chime on or off |
| `/rn minimap` | Hide or show the minimap button |
| `/rn discord discord.gg/yourcode` | Lead: set the Discord invite the raid sees (`/rn discord clear` removes it) |
| `/rn discord` | Show the raid's Discord invite |

## CurseForge upload

1. Zip the **RaidNight** folder (the zip should contain `RaidNight/RaidNight.toc`, not loose files).
2. Log into [CurseForge](https://authors.curseforge.com/) → **Create project** → World of Warcraft.
3. Category: **Raid**. Supported game: **Burning Crusade Classic** / Anniversary.
4. Upload the latest `RaidNight-<version>.zip`.
5. Paste the text from `CURSEFORGE.md` as the long description.

You have to upload from your own CurseForge account.

## Credits

Wisp character: original art made for Raid Night.
Wisp notification sound: "New Notification 047" by Universfield (Pixabay).
