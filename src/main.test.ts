import { describe, it, beforeEach, expect, vi } from 'vitest'
import { main, updateDescription } from './main'
import type { Octokit } from './types'

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

describe('main', () => {
  it('should work', async () => {
    await main({
      octokit: {} as unknown as Octokit,
      currentPullRequest: {
        number: 361,
        head: {
          ref: 'test-branch',
        },
        base: {
          ref: 'document-setup',
        },
        state: 'open',
      },
      pullRequests: [
        // {
        //   number: 360,
        //   head: {
        //     ref: 'document-setup',
        //   },
        //   base: {
        //     ref: 'main',
        //   },
        //   state: 'open',
        // },
        {
          number: 361,
          head: {
            ref: 'test-branch',
          },
          base: {
            ref: 'document-setup',
          },
          state: 'open',
        },
      ],
      mainBranch: 'main',
      perennialBranches: [],
      skipSingleStacks: false,
    })
  })
})
