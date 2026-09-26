import { expect, test, type Page } from '@playwright/test'
import { fakeBackend } from './fakeBackend'

/** The middle of the 3D canvas. */
async function sceneCentre(page: Page) {
  const box = await page.locator('.tt3d canvas').boundingBox()
  if (!box) throw new Error('the 3D scene is not on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

test('the wheel always scrolls the page, even over the 3D turntable', async ({ page }) => {
  await fakeBackend(page)
  await page.goto('/')
  await page.locator('#studio').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500) // three.js is lazy-loaded

  const { x, y } = await sceneCentre(page)
  await page.mouse.move(x, y)
  const before = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before)

  // and back up again
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 400)
})

test('dragging turns the camera and never counts as a click on the record', async ({ page }) => {
  await fakeBackend(page)
  await page.goto('/')
  await page.locator('#studio').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)

  // hum first, so the record is playing and a click on it would pause it
  const mic = page.getByRole('button', { name: /^Microphone/ })
  const micBox = await mic.boundingBox()
  if (!micBox) throw new Error('no mic')
  await page.mouse.move(micBox.x + micBox.width / 2, micBox.y + micBox.height / 3)
  await page.mouse.down()
  await page.waitForTimeout(1000)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Re-record' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Pause the record' })).toBeVisible()

  // pause it with the keyboard, so the platter is still and the only thing that can move the
  // picture is the camera
  const pause = page.getByRole('button', { name: 'Pause the record' })
  await pause.focus()
  await pause.press('Enter')
  const resume = page.getByRole('button', { name: 'Resume the record' })
  await expect(resume).toBeVisible()
  await page.waitForTimeout(800)

  const { x, y, box } = await sceneCentre(page)
  const shot = async () => (await page.screenshot({ clip: box })).toString('base64')
  const before = await shot()

  // a long drag straight across the record itself
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 12; step++) await page.mouse.move(x + step * 14, y - step * 2)
  await page.mouse.up()
  await page.waitForTimeout(800)

  expect(await shot()).not.toBe(before) // the camera turned
  await expect(resume).toBeVisible() // ...and the drag never counted as a tap, so it is still paused
})
