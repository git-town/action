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
})
