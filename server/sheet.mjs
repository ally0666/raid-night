// Read-only signup sheet for people who cannot see the Discord post. Anyone with the link can open it.
import { ADDON_URL, raiderIcons, section, SECTIONS, sheetUrl } from './discord.mjs'
import { WOW_CLASSES } from './seed.mjs'
import { buildRoster } from './store.mjs'

const ICONS = 'https://wow.zamimg.com/images/wow/icons/large'

function html(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function raiderRow(raider) {
  const icons = raiderIcons(raider)
    .map((icon) => `<img src="${ICONS}/${icon}.jpg" alt="" width="22" height="22">`)
    .join('')
  return `<li>${icons}<b>${html(raider.name)}</b><span>${html(raider.spec)} ${html(raider.className)}</span></li>`
}

function rsvpNames(data, raid, status) {
  return Object.entries(raid.rsvp || {})
    .filter(([, value]) => value === status)
    .map(([userId]) => data.users[userId])
    .filter(Boolean)
    .map((user) => user.discord?.globalName || user.discord?.username || 'Raider')
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 48px; background: #0b1018; color: #eef3f8; font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.45; }
  main { max-width: 860px; margin: 0 auto; }
  .eyebrow { margin: 0; color: #e2b657; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; }
  h1 { margin: 4px 0 16px; font-size: 30px; }
  .facts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .facts span { padding: 6px 12px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 999px; background: #121a28; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  section { padding: 14px 16px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; background: #182234; }
  h2 { display: flex; justify-content: space-between; margin: 0 0 10px; font-size: 15px; }
  h2 small { color: #93a0b3; font-weight: 500; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: flex; align-items: center; gap: 6px; padding: 5px 0; }
  li img { border-radius: 4px; }
  li span, .empty, footer { color: #93a0b3; font-size: 13px; }
  li span { margin-left: auto; text-align: right; }
  .names { margin: 0; font-size: 14px; }
  .wide { margin-top: 12px; }
  footer { margin-top: 28px; }
  a { color: #5b9fd4; }
`

export function sheetPage(data, raid) {
  const roster = buildRoster(data, raid)
  const when = [raid.dateLabel, raid.when].filter(Boolean).join(' · ')
  const summary = `${roster.length}/${raid.size} signed · ${when}`
  const sections = SECTIONS.map(([key, label]) => {
    const raiders = roster
      .filter((raider) => section(raider) === key)
      .sort((a, b) => WOW_CLASSES.indexOf(a.className) - WOW_CLASSES.indexOf(b.className) || a.name.localeCompare(b.name))
    const rows = raiders.length ? `<ul>${raiders.map(raiderRow).join('')}</ul>` : '<p class="empty">Nobody yet</p>'
    return `<section><h2>${html(label)} <small>${raiders.length}</small></h2>${rows}</section>`
  })
  const rsvps = [
    ['tentative', '❔ Tentative'],
    ['absent', '🚫 Not attending'],
  ]
    .map(([status, label]) => [label, rsvpNames(data, raid, status)])
    .filter(([, names]) => names.length)
    .map(
      ([label, names]) =>
        `<section class="wide"><h2>${label} <small>${names.length}</small></h2><p class="names">${names.map(html).join(', ')}</p></section>`,
    )

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="60">
<title>${html(raid.name)} · Raid Night signups</title>
<meta property="og:title" content="${html(raid.name)} signups">
<meta property="og:description" content="${html(summary)}">
<meta property="og:url" content="${html(sheetUrl(raid))}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="eyebrow">RAID NIGHT</p>
<h1>${html(raid.name)}</h1>
<div class="facts">
<span>📅 ${html(when)}</span>
<span>👥 ${roster.length}/${raid.size} signed</span>
<span>${raid.locked ? '🔒 Signups are locked' : `🔒 Signups close at ${html(raid.lockLabel)}`}</span>
</div>
<div class="grid">${sections.join('')}</div>
${rsvps.join('')}
<footer>Signups happen on the raid's Discord post, and this page updates on its own every minute. Soft reserves are picked in game with the <a href="${ADDON_URL}" rel="noopener">Raid Night addon</a>.</footer>
</main>
</body>
</html>`
}
