// Feature 2: the 60% / 85% context notices, each shown once.
import { expect, test } from 'claude-code/testing'

import { fakeSession } from './stubs.ts'

const BAND = { plugin: 'session-saver-mod', component: 'AbovePrompt' } as const
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as any

// Claude Code measuring the session with the context this full.
function measure($: any, percent: number) {
  return $.session.measure({
    context: { tokens: percent * 2000, percent, window: 200_000 },
    rateLimits: [],
    changed: ['context'],
  })
}

// Beneath the mod, Claude Code's own band: an empty box.
function engineDrawsNothing(on: any) {
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

// The band's text right now, or undefined when the mod draws nothing there.
async function bandText($: any, surface: 'terminal' | 'desktop'): Promise<string | undefined> {
  const ui = await $.ui.mount({ ...BAND, surface, props: BAND_PROPS })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()
  return text
}

test('nothing below 60%', async ($, on) => {
  fakeSession(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  engineDrawsNothing(on)
  await measure($, 40)
  expect(await bandText($, 'terminal')).toBeUndefined()
})

test('yellow at 60%, once; red at 85%, once', async ($, on) => {
  fakeSession(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  engineDrawsNothing(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    await measure($, 62)
    const ui = await $.ui.mount({ ...BAND, surface, props: BAND_PROPS })
    const yellow = await ui.find({ type: 'Text' })
    expect(yellow?.text).toContain('Context 62% full. Run /compact')
    expect(yellow?.props.color).toBe('warning')

    // Dismissed, then measured again above 60%: it does not come back.
    await ui.press({ key: 'dismiss-context-notice' })
    await ui.unmount()
    await measure($, 70)
    expect(await bandText($, surface)).toBeUndefined()

    // Past 85%: the red notice.
    await measure($, 88)
    const red = await $.ui.mount({ ...BAND, surface, props: BAND_PROPS })
    const redText = await red.find({ type: 'Text' })
    expect(redText?.text).toContain('Context 88% full. Ask Claude for a short summary')
    expect(redText?.props.color).toBe('error')
    await red.press({ key: 'dismiss-context-notice' })
    await red.unmount()
    await measure($, 95)
    expect(await bandText($, surface)).toBeUndefined()

    // After /compact the context drops: both notices are armed again.
    await measure($, 20)
  }
})

test('jumping straight past 85% shows only the red notice', async ($, on) => {
  fakeSession(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  engineDrawsNothing(on)
  await measure($, 90)
  expect(await bandText($, 'terminal')).toContain('Context 90% full. Ask Claude')
})
