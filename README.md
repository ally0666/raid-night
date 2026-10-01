# Raid night

Karazhan signup and loot reserves in one place. Built to replace the two-site dance of Raid-Helper and softres.it.

Sign in with **Discord** or **Battle.net**. Link both to the same account so either one works next time. Then pick your character, reserve two items, and the raid lead copies a Gargul string.

## Local

```
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

With no `.env` secrets, login is local: Discord / Battle.net still appear, then you pick **Nyx** (raider) or **Officer** (raid lead).

## What you need to do to make it a real site

The app is ready to host. These three things need your accounts — I cannot create them for you.

### 1. Discord app

1. Open [Discord Developer Portal](https://discord.com/developers/applications) and sign in.
2. **New Application** — name it something like `Raid night`.
3. OAuth2 → **Redirects** — add both:
   - `http://localhost:5173/api/auth/discord/callback` (local testing)
   - `https://YOUR-SITE/api/auth/discord/callback` (after you have the live URL)
4. Copy **Client ID** and **Client Secret**.

### 2. Battle.net client

1. Attach an Authenticator to your Battle.net account if you have not already.
2. Open [Blizzard API Access](https://develop.battle.net/access/clients) and create a client.
3. Redirect URI — add both:
   - `http://localhost:5173/api/auth/battlenet/callback`
   - `https://YOUR-SITE/api/auth/battlenet/callback`
4. Copy **Client ID** and **Client Secret**.

TBC Classic names are often missing from Blizzard's profile API. After Battle.net login, raiders can still type the character they raid on.

### 3. Host it (Render)

1. Put this folder on [GitHub](https://github.com/new) (install [Git](https://git-scm.com) if needed, then create a repo and upload `raid-night`).
2. Open [Render](https://render.com) → **New** → **Blueprint** and point it at that repo (`render.yaml` is already in the project).
3. Fill in the env vars from steps 1–2. Set `PUBLIC_URL` to the Render URL they give you, like `https://raid-night.onrender.com`.
4. Add that same `https://…/api/auth/discord/callback` and `…/battlenet/callback` to the Discord and Battle.net apps, then save.
5. Sign in on the live site, open your name → Account, copy your Discord / Battle.net **id**, and put it in `LEAD_DISCORD_IDS` or `LEAD_BATTLENET_IDS` so you get raid-lead tools.

Until Discord and Battle.net are configured, a public site will not offer those logins. Local Nyx/Officer demo logins stay on your machine only.

## Discord bot

The site can post a raid in a Discord channel with **Attending / Tentative / Not attending** buttons and the roster split into tanks, healers, melee and casters, the way Raid-Helper does. Signing up in Discord and on the site is the same roster, and the post updates itself.

It uses the same Discord application as the login:

1. [Developer Portal](https://discord.com/developers/applications) → your app → **Bot** → **Reset Token**. Put it in `DISCORD_BOT_TOKEN`.
2. **General Information** → copy **Public Key** into `DISCORD_PUBLIC_KEY`. Deploy with both set.
3. Back in **General Information**, set **Interactions Endpoint URL** to `https://YOUR-SITE/api/discord/interactions` and save. Discord checks it on the spot, so the deploy has to be live first.
4. Invite the bot with the link the server prints at startup (`Discord bot ready. Invite it: …`).

In Discord, `/raid create` schedules a raid and posts it; `/raid post` posts one you already scheduled on the site. Both are limited to members with **Manage Events** until a server admin changes that under Server Settings → Integrations.

`node scripts/check-discord.mjs` runs the whole flow against a fake Discord.

## Run production on this PC

```
npm run build
npm start
```

Then set `PUBLIC_URL` if OAuth should use a name other than localhost.

## Try this (local)

1. **Raider:** I'm in → Continue with Discord → Nyx → pick two items → save.
2. Open the name in the top-right → Connect Battle.net → pick Nyx again. Same account, two ways in.
3. **Raid lead:** sign out, I'm running this raid → Discord → Officer. Lock, copy for Gargul.
4. In WoW type `/gl sr`, paste, Import.
