import { describe, it, beforeEach, expect, vi } from 'vitest'
import { updateDescription } from './main'

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('updateDescription', () => {
  it('should correctly update pull request body', () => {
    const description = `
## Description

## Stack

<!-- branch-stack -->
- main
  - \\#1
`
    const output = ['- main', '  - \\#2'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '## Description',
      '',
      '## Stack',
      '',
      '<!-- branch-stack -->',
      '',
      '- main',
      '  - \\#2',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should append output to description if body regex fails', () => {
    const description = '## Description'
    const output = ['- main', '  - \\#2'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '## Description',
      '',
      '<!-- branch-stack -->',
      '',
      '- main',
      '  - \\#2',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should not delete parts of the description below itself when there is another list', () => {
    const description = `<!-- branch-stack -->

## More Description

There may be things here we don't want to overwrite.

- [ ] including
- [ ] something
- [ ] like a
- [ ] checklist
`
    const output = ['- main', '  - \\#1'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '<!-- branch-stack -->',
      '',
      '- main',
      '  - \\#1',
      '',
      '## More Description',
      '',
      `There may be things here we don't want to overwrite.`,
      '',
      '- [ ] including',
      '- [ ] something',
      '- [ ] like a',
      '- [ ] checklist',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should replace any list directly succeeding the stack comment', () => {
    const description = `<!-- branch-stack -->

- [ ] this checklist
- [ ] is toast

## More Description
`
    const output = ['- main', '  - \\#1'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '<!-- branch-stack -->',
      '',
      '- main',
      '  - \\#1',
      '',
      '## More Description',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })
})
