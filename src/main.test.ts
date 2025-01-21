import { describe, it, beforeEach, expect, vi } from 'vitest'
import { DirectedGraph } from 'graphology'
import { getOutput, getStackGraph, updateDescription } from './main'
import type { PullRequest, StackNodeAttributes } from './types'

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
    const output = ['- main <!-- branch-stack -->', '  - \\#2'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '## Description',
      '',
      '## Stack',
      '',
      '- main <!-- branch-stack -->',
      '  - \\#2',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should correctly update pull request body when the comment is inline', () => {
    const description = `
## Description

## Stack

- main <!-- branch-stack -->
  - \\#2
`
    const output = ['- main <!-- branch-stack -->', '  - \\#2'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '## Description',
      '',
      '## Stack',
      '',
      '- main <!-- branch-stack -->',
      '  - \\#2',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should append output to description if body regex fails', () => {
    const description = '## Description'
    const output = ['- main <!-- branch-stack -->', '  - \\#2'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '## Description',
      '',
      '- main <!-- branch-stack -->',
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
    const output = ['- main <!-- branch-stack -->', '  - \\#1'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '- main <!-- branch-stack -->',
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

  it('should not replace any list directly succeeding the stack comment', () => {
    const description = `<!-- branch-stack -->

- [ ] this checklist
  - [ ] is going to be alright but with an asterisk to start

## More Description
`
    const output = ['- main <!-- branch-stack -->', '  - \\#1'].join('\n')

    const actual = updateDescription({ description, output })
    const expected = [
      '- main <!-- branch-stack -->',
      '  - \\#1',
      '',
      '* [ ] this checklist',
      '  - [ ] is going to be alright but with an asterisk to start',
      '',
      '## More Description',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })
})

describe('getStackGraph', () => {
  it('should construct the stack graph correctly', () => {
    const pullRequest: PullRequest = {
      number: 1,
      base: {
        ref: 'main',
      },
      head: {
        ref: 'pr-1',
      },
      state: 'TODO',
      body: 'pr 1 body',
    }
    const repoGraph = new DirectedGraph<StackNodeAttributes>()
    repoGraph.mergeNode('main', { type: 'perennial', ref: 'main' })
    repoGraph.mergeNode('pr-1', {
      type: 'pull-request',
      ...pullRequest,
    })
    repoGraph.mergeDirectedEdge('main', 'pr-1')

    const stackGraph = getStackGraph(pullRequest, repoGraph)

    expect(stackGraph.nodes()).toHaveLength(2)
    expect(stackGraph.nodes()).toContain('pr-1')
  })

  it('should construct the stack graph when there are stacked refs', () => {
    const pullRequest1: PullRequest = {
      number: 1,
      base: {
        ref: 'main',
      },
      head: {
        ref: 'pr-1',
      },
      state: 'TODO',
      body: 'pr 1 body',
    }
    const pullRequest2: PullRequest = {
      number: 2,
      base: {
        ref: 'pr-1',
      },
      head: {
        ref: 'pr-2',
      },
      state: 'TODO',
      body: 'pr 2 body',
    }
    const repoGraph = new DirectedGraph<StackNodeAttributes>()
    repoGraph.mergeNode('main', { type: 'perennial', ref: 'main' })
    repoGraph.mergeNode('pr-1', {
      type: 'pull-request',
      ...pullRequest1,
    })
    repoGraph.mergeNode('pr-2', {
      type: 'pull-request',
      ...pullRequest2,
    })
    repoGraph.mergeDirectedEdge('main', 'pr-1')
    repoGraph.mergeDirectedEdge('pr-1', 'pr-2')

    const stackGraph = getStackGraph(pullRequest1, repoGraph)

    expect(stackGraph.nodes()).toHaveLength(3)
    expect(stackGraph.nodes()).toStrictEqual(['main', 'pr-1', 'pr-2'])
  })
})

describe('getOutput', () => {
  it('should produce the expected output', () => {
    const pullRequest1: PullRequest = {
      number: 1,
      base: {
        ref: 'main',
      },
      head: {
        ref: 'pr-1',
      },
      state: 'TODO',
      body: 'pr 1 body',
    }
    const pullRequest2: PullRequest = {
      number: 2,
      base: {
        ref: 'pr-1',
      },
      head: {
        ref: 'pr-2',
      },
      state: 'TODO',
      body: 'pr 2 body',
    }
    const repoGraph = new DirectedGraph<StackNodeAttributes>()
    repoGraph.mergeNode('main', { type: 'perennial', ref: 'main' })
    repoGraph.mergeNode('pr-1', {
      type: 'pull-request',
      ...pullRequest1,
    })
    repoGraph.mergeNode('pr-2', {
      type: 'pull-request',
      ...pullRequest2,
    })
    repoGraph.mergeDirectedEdge('main', 'pr-1')
    repoGraph.mergeDirectedEdge('pr-1', 'pr-2')

    const stackGraph = getStackGraph(pullRequest1, repoGraph)

    const output = getOutput(stackGraph, ['main'])

    expect(output).toBe(`- \`main\` <!-- branch-stack -->
  - #1 :point_left:
    - #2`)
  })
})
