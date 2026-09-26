import { expect, test, type Page } from '@playwright/test'
import { fakeBackend } from './fakeBackend'

const OUT = '/private/tmp/claude-501/-Users-simonsee-coding-hackthon-ECKO/8bd0df14-694b-4422-973f-bf32450c128c/scratchpad/shots'

async function hum(page: Page) {
  const mic = page.getByRole('button', { name: /^Microphone/ })
  await mic.scrollIntoViewIfNeeded()
  const box = await mic.boundingBox()
  if (!box) throw new Error('no mic')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
  await page.mouse.down()
  await page.waitForTimeout(1100)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Re-record' })).toBeVisible({ timeout: 15_000 })
}

test('the whole journey, with a shot of each page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await fakeBackend(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/')
  await hum(page)
  await page.waitForTimeout(800)

  // social, from the header icon
  await page.getByRole('link', { name: 'Social' }).click()
  await expect(page).toHaveURL(/\/social$/)
  await expect(page.getByRole('heading', { name: 'Social' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/6-social.png` })

  // a like sticks across a reload
  // a shared record plays its stand-in phrase
  const firstRow = page.getByRole('listitem').first()
  await firstRow.getByRole('button', { name: /^Play / }).click()
  await expect(firstRow.getByRole('button', { name: /^Pause / })).toBeVisible()

  const like = page.getByRole('button', { name: /^Like Something for the walk home/ })
  await like.click()
  await expect(page.getByRole('button', { name: /^Unlike Something for the walk home/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Unlike Something for the walk home/ })).toBeVisible()

  // profile: the record just made is there and plays
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  const rows = page.getByRole('listitem')
  await expect(rows).toHaveCount(1, { timeout: 10_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/7-profile.png` })

  await rows.first().getByRole('button', { name: /^Play / }).click()
  await expect(rows.first().getByRole('button', { name: /^Pause / })).toBeVisible()

  // the wordmark goes home
  await page.getByRole('link', { name: 'ECKO, home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /Hum a tune/ })).toBeVisible()

  console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 1))
})
