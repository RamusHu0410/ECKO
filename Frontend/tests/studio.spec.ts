import { expect, test, type Locator, type Page } from '@playwright/test'
import { TALK_REPLY, fakeBackend } from './fakeBackend'

const mic = (page: Page) => page.getByRole('button', { name: /^Microphone/ })
/** The gnome's button for the keyboard (the gnome himself is in the 3D scene). */
const gnome = (page: Page) => page.getByRole('button', { name: /^The gnome/ })
const rerecord = (page: Page) => page.getByRole('button', { name: 'Re-record' })

/** Holds the gnome the keyboard's way: Space held down on his focused button. */
async function holdGnome(page: Page, whileHeld: () => Promise<void>) {
  await gnome(page).focus()
  await page.keyboard.down('Space')
  await whileHeld()
  await page.keyboard.up('Space')
}

/** The way a keyboard user presses a button: the 3D turntable's page buttons only show once they have focus. */
async function pressWithKeyboard(button: Locator) {
  await button.focus()
  await button.press('Enter')
}

/** Presses and holds the mic, checks what's true while it's held, then lets go. */
async function holdMic(page: Page, whileHeld: () => Promise<void>) {
  await mic(page).scrollIntoViewIfNeeded() // the studio is below the intro
  const box = await mic(page).boundingBox()
  if (!box) throw new Error('the microphone is not on screen')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
  await page.mouse.down()
  await whileHeld()
  await page.mouse.up()
}

for (const turntable of ['css', '3d'] as const) {
  test(`hum, talk to the gnome, hum again, then re-record (${turntable} turntable)`, async ({ page }) => {
    const calls = await fakeBackend(page)
    await page.goto(turntable === 'css' ? '/?turntable=css' : '/')

    // no gnome, and so no talking, until there's a hum to change
    await expect(gnome(page)).toHaveCount(0)
    await holdMic(page, async () => {
      await expect(page.getByText('release to stop')).toBeVisible()
      await page.waitForTimeout(1000)
    })
    await expect(rerecord(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Hold the gnome to change your song')).toBeVisible()

    // hold the gnome and talk: the mic is off while he listens
    await holdGnome(page, async () => {
      await expect(gnome(page)).toContainText('Listening')
      await expect(mic(page)).toHaveAttribute('aria-disabled', 'true')
      await page.waitForTimeout(800)
    })
    await expect(page.getByText(TALK_REPLY).first()).toBeVisible() // the caption (the second copy is for screen readers)
    await expect(mic(page)).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 }) // the answer is done
    expect(calls.voice).toBe(1)

    // the mic always hums: holding it records a fresh hum over the song
    await holdMic(page, async () => {
      await expect(page.getByText('release to stop')).toBeVisible()
      await expect(gnome(page)).toHaveCount(0) // he's gone until the new song is ready
      await page.waitForTimeout(1000)
    })
    await expect(rerecord(page)).toBeVisible({ timeout: 15_000 })
    expect(calls.upload).toBe(2)

    // Re-record goes back to an empty disc, ready for the next hum
    await rerecord(page).click()
    await expect(page.getByText('Hold to hum', { exact: true })).toBeVisible()
    await expect(rerecord(page)).toBeHidden()
    await expect(gnome(page)).toHaveCount(0)
  })
}

declare global {
  interface Window {
    /** Every media element that started playing: the song's has a blob: address. */
    played: Set<HTMLMediaElement>
  }
}

test('Replay plays the song from the start, every time', async ({ page }) => {
  await page.addInitScript(() => {
    window.played = new Set()
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      window.played.add(this)
      return play.call(this)
    }
  })
  await fakeBackend(page) // the song lasts 4 seconds
  await page.goto('/')
  await holdMic(page, () => page.waitForTimeout(1000))
  const replay = page.getByRole('button', { name: 'Replay' })
  await expect(replay).toBeVisible({ timeout: 15_000 })

  const song = () =>
    page.evaluate(() => {
      const audio = [...window.played].find((media) => media.src.startsWith('blob:'))
      return { at: audio?.currentTime ?? -1, playing: audio ? !audio.paused : false }
    })
  const playsFromTheStart = async () => {
    const now = await song()
    expect(now.playing).toBe(true)
    expect(now.at).toBeLessThan(0.6)
  }

  // mid-song, twice, and twice in quick succession
  for (const pause of [1200, 1000, 50]) {
    await page.waitForTimeout(pause)
    await replay.click()
    await playsFromTheStart()
  }

  // from a paused record: it starts turning again
  await page.waitForTimeout(800)
  await pressWithKeyboard(page.getByRole('button', { name: 'Pause the record' }))
  expect((await song()).playing).toBe(false)
  await replay.click()
  await expect(page.getByRole('button', { name: 'Pause the record' })).toBeVisible()
  await playsFromTheStart()

  // after the song has ended
  await expect.poll(async () => (await song()).playing, { timeout: 8_000 }).toBe(false)
  await replay.click()
  await playsFromTheStart()
})

test('moving a fader makes the song again and the graph shows it move', async ({ page }) => {
  const calls = await fakeBackend(page)
  await page.goto('/')
  await holdMic(page, () => page.waitForTimeout(1000))
  await expect(rerecord(page)).toBeVisible({ timeout: 15_000 })
  expect(calls.song).toBe(1)

  const graph = page.locator('figure').filter({ hasText: 'Your tune' })
  await expect(graph).toContainText('as you hummed it')
  await expect(graph).not.toContainText('what the song plays') // the song is still the hum

  const pitch = page.getByRole('slider', { name: 'Pitch' })
  await pitch.focus()
  for (let i = 0; i < 8; i++) await pitch.press('ArrowRight')

  // one new song for the whole drag, not one per step
  await expect.poll(() => calls.song, { timeout: 10_000 }).toBe(2)
  await expect(graph).toContainText('what the song plays')
})

test('the notes graph never names a note', async ({ page }) => {
  await fakeBackend(page)
  await page.goto('/')
  await holdMic(page, () => page.waitForTimeout(1000))
  const graph = page.locator('figure').filter({ hasText: 'Your tune' })
  await expect(graph).toBeVisible({ timeout: 15_000 })
  // the drawing is a canvas, so the only text is the caption and the description a screen reader reads
  const words = ((await graph.textContent()) ?? '') + (await graph.getByRole('img').getAttribute('aria-label'))
  expect(words).not.toMatch(/\b[A-G]#?-?\d\b|\bMIDI\b/)
})
