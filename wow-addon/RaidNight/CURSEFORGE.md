# Raid Night

Soft reserves for raids, in game. Works in **TBC Anniversary** (with the full loot list for Karazhan, Gruul, Magtheridon, SSC, The Eye, Hyjal, Black Temple, Zul'Aman, and Sunwell) and **WoW Forever** (The Barrow Deeps, Hyjal Summit, and Onyxia's Lair, reserving items by link).

## What it does

- Pick 1–6 soft reserves per raid (lead sets the count with `/rn limit 2`)
- The raid leader can hard reserve an item by right-clicking it. Nobody else can hard reserve, and a hard-reserved item is taken off everyone else's list.
- Filter by boss, search by name, hide gear your class cannot use
- Reserve any item by shift-clicking its link into the search box (or typing its item ID)
- Share picks with the party or raid automatically
- Export a Gargul CSV (`/rn export`, then `/gl sr`)
- Picks, Group, and Raid tabs, so the sheet is not one long pile of buttons
- Clear my picks removes only your reserves. Clear sheet is the raid leader, and it wipes everyone's picks and hard reserves
- A little wisp walks you through the window the first time, then sits back beside it. It also reminds raiders to put reserves in, and reminds the lead to start the sheet, nudge anyone still missing, and lock (with a soft chime you can mute with `/rn sound`)

## How to use

The **party/raid leader** is the Raid Night lead.

1. Lead types `/rn`, picks the instance, clicks **Start sheet**.
2. The group is told in chat to type `/rn`.
3. **Group** shows everyone, who the lead is, and each person's reserves. **Raid** is where the leader starts, locks, and clears the sheet.

Type `/rn` to open. `/rn start` is the same as Start sheet.

## Notes

This addon does not log in to the website and does not replace Discord. It is the loot sheet, in WoW.

Supports TBC Anniversary (interface 20506) and WoW Forever (interface 16001).
