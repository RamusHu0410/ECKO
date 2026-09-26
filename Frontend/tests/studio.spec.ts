import { expect, test, type Locator, type Page } from '@playwright/test'
import { TALK_REPLY, fakeBackend } from './fakeBackend'

const mic = (page: Page) => page.getByRole('button', { name: /^Microphone/ })
const key = (page: Page, name: 'HUM' | 'TALK') => page.getByRole('radio', { name })
const rerecord = (page: Page) => page.getByRole('button', { name: 'Re-record' })

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

// with the CSS turntable HUM / TALK are on the page and get clicked (a long talk reply once covered them);
// with the 3D one they are keys on the plinth, and the page's own buttons are for the keyboard
for (const turntable of ['css', '3d'] as const) {
  test(`hum, talk, hum again, then re-record (${turntable} turntable)`, async ({ page }) => {
    const press = (name: 'HUM' | 'TALK') => (turntable === 'css' ? key(page, name).click() : pressWithKeyboard(key(page, name)))
    const calls = await fakeBackend(page)
    await page.goto(turntable === 'css' ? '/?turntable=css' : '/')

    // hum the first tune
    await holdMic(page, async () => {
      await expect(page.getByText('release to stop')).toBeVisible()
      await page.waitForTimeout(1000)
    })
    await expect(rerecord(page)).toBeVisible({ timeout: 15_000 })

    // talk to it: the keys are locked while the mic listens
    await press('TALK')
    await holdMic(page, async () => {
      await expect(key(page, 'HUM')).toBeDisabled()
      await page.waitForTimeout(800)
    })
    await expect(page.getByText(TALK_REPLY).first()).toBeVisible() // the caption (the second copy is for screen readers)
    await expect(mic(page)).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 }) // the answer is done
    expect(calls.voice).toBe(1)

    // back to HUM: holding the mic records a fresh hum over the song
    await press('HUM')
    await expect(key(page, 'HUM')).toBeChecked()
    await expect(page.getByText('Hold to hum a new tune')).toBeVisible()
    await holdMic(page, async () => {
      await expect(page.getByText('release to stop')).toBeVisible()
      await expect(key(page, 'TALK')).toBeDisabled()
      await page.waitForTimeout(1000)
    })
    await expect(rerecord(page)).toBeVisible({ timeout: 15_000 })
    expect(calls.upload).toBe(2)

    // Re-record goes back to an empty disc, ready for the next hum
    await rerecord(page).click()
    await expect(page.getByText('Hold to hum', { exact: true })).toBeVisible()
    await expect(rerecord(page)).toBeHidden()
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
