import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const out = fileURLToPath(new URL('../verify/', import.meta.url))
mkdirSync(out, { recursive: true })
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

const context = browser.defaultBrowserContext()
await context.overridePermissions('http://localhost:5173', ['clipboard-read', 'clipboard-write'])

async function settle(page) {
  await new Promise((r) => setTimeout(r, 400))
  await waitImages(page)
}

async function shot(page, name) {
  await settle(page)
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
  console.log('saved', name)
}

async function waitImages(page) {
  try {
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), { timeout: 4000 })
  } catch {
    // ignore
  }
}

async function reset(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.evaluate(async () => {
    localStorage.clear()
    sessionStorage.clear()
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('button.primary')
}

async function run(width, height, prefix) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2 })
  await reset(page)
  await shot(page, `${prefix}-01-invite`)

  await page.click('button.primary')
  await page.waitForSelector('.oauth-btn.discord')
  await shot(page, `${prefix}-02-login`)

  await page.click('.oauth-btn.discord')
  await page.waitForSelector('[data-persona="nyx"]')
  await shot(page, `${prefix}-03-persona`)

  await page.click('[data-persona="nyx"]')
  await page.waitForSelector('.char-card')
  await waitImages(page)
  await shot(page, `${prefix}-04-confirm`)

  await page.click('button.secondary')
  await page.waitForSelector('.item-list')
  await waitImages(page)
  await shot(page, `${prefix}-05-picks`)

  await page.$eval('.sticky button.primary', (el) => el.click())
  await page.waitForSelector('.eyebrow.ok')
  await waitImages(page)
  await shot(page, `${prefix}-06-done`)

  await page.click('.session-btn')
  await page.waitForSelector('.provider-card')
  await shot(page, `${prefix}-07-account`)

  const connect = await page.$('.connect-provider')
  if (connect) {
    await connect.click()
    await page.waitForSelector('.oauth-btn.battlenet')
    await page.click('.oauth-btn.battlenet')
    await page.waitForSelector('[data-persona="nyx"]')
    await page.click('[data-persona="nyx"]')
    await page.waitForSelector('.provider-card')
  }
  await shot(page, `${prefix}-08-linked`)

  await page.click('.sign-out')
  await page.waitForSelector('button.primary')
  try {
    await page.waitForSelector('.toast', { hidden: true, timeout: 4000 })
  } catch {
    // ignore
  }

  await page.click('button.lead-entry')
  await page.waitForSelector('.oauth-btn.discord')
  await page.click('.oauth-btn.discord')
  await page.waitForSelector('[data-persona="officer"]')
  await page.click('[data-persona="officer"]')
  await page.waitForSelector('.lead')
  await waitImages(page)
  await shot(page, `${prefix}-09-lead`)

  await page.click('.lead-actions .primary')
  await page.waitForSelector('.toast')
  await shot(page, `${prefix}-10-copied`)

  await page.close()
}

await run(390, 844, 'mobile')
await run(1280, 800, 'desktop')
await browser.close()
console.log('ok')
