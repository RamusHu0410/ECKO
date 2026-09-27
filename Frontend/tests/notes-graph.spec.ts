import { test, expect, type Locator, type Page } from '@playwright/test'
import { fakeBackend } from './fakeBackend'

/** Hums into the fake mic for a moment, so the fake backend makes a song (and its notes graph). */
async function hum(page: Page) {
  const mic = page.getByRole('button', { name: /^Microphone/ })
  await mic.scrollIntoViewIfNeeded()
  await mic.hover()
  await page.mouse.down()
  await page.waitForTimeout(1000)
  await page.mouse.up()
}

/** Sweeps the pointer over the graph until its label says `wanted`; returns what it said (or ''). */
async function pointAt(page: Page, graph: Locator, wanted: RegExp): Promise<string> {
  const canvas = graph.getByRole('img')
  await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!
  const label = graph.locator('span[aria-hidden="true"]').filter({ hasText: /:/ })
  for (let across = 0.02; across < 1; across += 0.02) {
    for (let down = 0.05; down < 1; down += 0.05) {
      await page.mouse.move(box.x + box.width * across, box.y + box.height * down)
      if ((await label.count()) && wanted.test((await label.textContent()) ?? '')) return (await label.textContent()) ?? ''
    }
  }
  return ''
}

test('pointing at the graph names the hummed note and the note the song plays', async ({ page }) => {
  await fakeBackend(page) // hums C4 E4 D4 G4
  await page.goto('/')
  await hum(page)
  const graph = page.locator('figure').filter({ hasText: 'Your tune' })
  await expect(graph).toBeVisible({ timeout: 15_000 })

  expect(await pointAt(page, graph, /You sang/)).toMatch(/You sang: (C4|E4|D4|G4)/)

  // the pitch fader moves the song two semitones up: its grey bars are named as the new notes
  const pitch = page.getByRole('slider', { name: 'Pitch' })
  await pitch.focus()
  for (let i = 0; i < 8; i++) await pitch.press('ArrowRight')
  await expect(graph).toContainText('what the song plays', { timeout: 10_000 })
  expect(await pointAt(page, graph, /Song plays/)).toMatch(/Song plays: (D4|F♯4|E4|A4)/)

  // and the label goes when the pointer leaves
  await page.mouse.move(0, 0)
  await expect(graph.locator('span[aria-hidden="true"]').filter({ hasText: /:/ })).toHaveCount(0)
})
