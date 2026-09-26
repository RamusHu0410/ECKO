import { expect, test, type Page } from '@playwright/test'

const OUT = process.env.SHOTS ?? 'test-results'

/** A second of a 440 Hz tone as a WAV, standing in for a finished recording. */
async function saveSampleRecord(page: Page) {
  await page.evaluate(async () => {
    const rate = 22_050
    const samples = rate
    const buffer = new ArrayBuffer(44 + samples * 2)
    const view = new DataView(buffer)
    const text = (at: number, value: string) => [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, 36 + samples * 2, true)
    text(8, 'WAVEfmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, samples * 2, true)
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000 * (i / samples)), true)
    const records = await import(/* @vite-ignore */ `${location.origin}/Kelvin's files/data/records.ts`)
    await records.saveRecord(new Blob([buffer], { type: 'audio/wav' }), { emotion: 0.5, speed: 0.5, pitch: 0.5, instruments: [], style: null })
  })
}

test('the community board: vote, comment, and a shared record lands in the feed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto('/community')
  await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(6)
  await page.screenshot({ path: `${OUT}/community-feed.png`, fullPage: true })

  // a vote sticks across a reload
  const kettle = page.getByRole('article', { name: 'Four notes and a kettle' })
  await kettle.getByRole('button', { name: 'Upvote Four notes and a kettle' }).click()
  await expect(kettle.getByLabel('Score 241')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('article', { name: 'Four notes and a kettle' }).getByLabel('Score 241')).toBeVisible()

  // a sample post plays its stand-in phrase
  await kettle.getByRole('button', { name: 'Play Four notes and a kettle' }).click()
  await expect(kettle.getByRole('button', { name: 'Pause Four notes and a kettle' })).toBeVisible()

  // comments open, nest, and take a reply
  await kettle.getByRole('button', { name: /3 comments/ }).click()
  await expect(kettle.getByText('Please do not threaten me with a good time.')).toBeVisible()
  await kettle.getByRole('textbox', { name: 'What did you think of it?' }).fill('Kettle solo when?')
  await kettle.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(kettle.getByText('Kettle solo when?')).toBeVisible()
  await expect(kettle.getByRole('button', { name: /4 comments/ })).toBeVisible()
  await page.waitForTimeout(800) // let the cards below settle after the thread grows
  await page.screenshot({ path: `${OUT}/community-thread.png`, fullPage: true })

  // sharing a finished recording puts it at the top of the feed
  await saveSampleRecord(page)
  await page.getByRole('button', { name: 'Share a record' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share to community' })
  await expect(sheet.getByRole('radio')).toHaveCount(1)
  await sheet.getByRole('textbox', { name: 'Title' }).fill('My first shared hum')
  await sheet.getByRole('textbox', { name: /A few words/ }).fill('Straight out of the studio.')
  await sheet.getByRole('button', { name: 'Feedback wanted' }).click()
  await page.screenshot({ path: `${OUT}/community-share.png` })
  await sheet.getByRole('button', { name: 'Post' }).click()
  await expect(sheet).toBeHidden()

  const mine = page.getByRole('article').first()
  await expect(mine).toHaveAccessibleName('My first shared hum')
  await expect(mine.getByText('Feedback wanted')).toBeVisible()
  await expect(mine.getByText('0:01')).toBeVisible() // measured from the audio itself
  await expect(mine.getByLabel('Score 1')).toBeVisible()
  await mine.getByRole('button', { name: 'Play My first shared hum' }).click()
  await expect(mine.getByRole('button', { name: 'Pause My first shared hum' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/community-shared.png` })

  // it is still there after a reload, and can be taken down
  await page.reload()
  await page.getByRole('tab', { name: 'New' }).click()
  const again = page.getByRole('article', { name: 'My first shared hum' })
  await expect(again).toBeVisible()
  await again.getByRole('button', { name: 'Delete' }).click()
  await expect(again).toBeHidden()

  // a shared link opens straight onto its post
  await page.goto('/community#c-birthday')
  await expect(page.getByText('She is going to love it either way.')).toBeVisible()

  // phone width: no sideways scroll
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/community')
  await expect(page.getByRole('article').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: `${OUT}/community-phone.png`, fullPage: true })

  expect(errors).toEqual([])
})

test('the header icon and old /social links lead to the community board', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('link', { name: 'Community' }).click()
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()

  await page.goto('/social')
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()
})
