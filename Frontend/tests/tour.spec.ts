import { test, expect, type Page } from '@playwright/test'

// a first visit: nothing remembered in this browser
test.use({ storageState: { cookies: [], origins: [] } })

/** The element the tour's spotlight is on: the one whose box matches the spotlight's, less its padding. */
async function spotlit(page: Page, selector: string) {
  const target = await page.locator(selector).first().boundingBox()
  const light = await page.locator('.outline-amber').boundingBox()
  return target && light && Math.abs(light.x + 8 - target.x) < 4 && Math.abs(light.y + 8 - target.y) < 4
}

test('reaching the studio for the first time starts the tour at the record, then the mic', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeHidden() // not over the intro
  await page.locator('#studio').scrollIntoViewIfNeeded()
  const note = page.getByRole('dialog')
  await expect(note).toContainText('Your record')
  await expect.poll(() => spotlit(page, '[data-tour="turntable"]')).toBe(true)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(note).toContainText('Hum here')
  await expect.poll(() => spotlit(page, '[data-tour="mic"]')).toBe(true)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(note).toBeHidden()

  await page.reload()
  await page.locator('#studio').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  await expect(page.getByRole('dialog')).toBeHidden() // part one plays once
})

test('"How to use ECKO" plays the tour again; arrow keys step, Escape closes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'How to use ECKO' }).click()
  const note = page.getByRole('dialog')
  await expect(note).toContainText('Your record')
  await page.keyboard.press('ArrowRight')
  await expect(note).toContainText('Hum here')
  await page.keyboard.press('ArrowLeft')
  await expect(note).toContainText('Your record')
  await page.keyboard.press('Escape')
  await expect(note).toBeHidden()
})
