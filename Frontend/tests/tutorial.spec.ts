import { test, expect } from '@playwright/test'

// a first visit: nothing remembered in this browser
test.use({ storageState: { cookies: [], origins: [] } })

test('the guide opens on a first visit, walks through every step, and not again after', async ({ page }) => {
  await page.goto('/')
  const guide = page.getByRole('dialog')
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('Hum a tune')

  const next = page.getByRole('button', { name: 'Next' })
  for (let step = 2; step <= 8; step++) {
    await next.click()
    await expect(guide).toContainText(`${step} of 8`)
  }
  await expect(guide).toContainText('Keep your songs')
  await page.getByRole('button', { name: 'Start humming' }).click()
  await expect(guide).toBeHidden()

  await page.reload()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toBeHidden()

  // it can always be opened again from the intro, and Escape closes it
  await page.getByRole('button', { name: 'How to use ECKO' }).click()
  await expect(page.getByRole('dialog')).toContainText('Hum a tune')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the gnome step explains how to talk to him', async ({ page }) => {
  await page.goto('/')
  const next = page.getByRole('button', { name: 'Next' })
  for (let step = 2; step <= 5; step++) await next.click()
  await expect(page.getByRole('dialog')).toContainText('Talk to the gnome')
  await expect(page.getByRole('dialog')).toContainText('Press and hold him')
})
