import { DirectedGraph } from 'graphology'
import { describe, it, expect } from 'vitest'
import { getStackGraph } from './main'
import { injectVisualization, renderVisualization } from './renderer'
import type { PullRequest, StackNodeAttributes } from './types'

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

    const visualization = renderVisualization(stackGraph, ['main'])
    const expected = [
      '- `main` <!-- branch-stack -->',
      '  - #1 :point_left:',
      '    - #2',
    ].join('\n')

    expect(visualization).toBe(expected)
  })
})

describe('applyVisualization', () => {
  describe('when standalone anchor is present', () => {
    describe('when previous stack exists', () => {
      it('should delete previous stack & replace anchor with updated stack', () => {
        const description = [
          '<!-- branch-stack -->',
          '',
          '- `main`',
          '  - \\#1 :point\\_left:',
        ].join('\n')
        const output = ['- `main` <!-- branch-stack -->', '  - \\#2 :point\\_left:'].join(
          '\n'
        )

        const actual = injectVisualization(output, description)
        const expected = [
          '- `main` <!-- branch-stack -->',
          '  - \\#2 :point\\_left:',
          '',
        ].join('\n')

        expect(actual).toBe(expected)
      })
    })

    describe('when stack is missing', () => {
      it('should replace standalone anchor with updated stack', () => {
        const description = ['<!-- branch-stack -->', ''].join('\n')
        const output = ['- main <!-- branch-stack -->', '  - \\#2 :point\\_left:'].join(
          '\n'
        )

        const actual = injectVisualization(output, description)
        const expected = [
          '- main <!-- branch-stack -->',
          '  - \\#2 :point\\_left:',
          '',
        ].join('\n')

        expect(actual).toEqual(expected)
      })
    })
  })

  describe('when inline anchor is present', () => {
    it('should replace inline anchor with updated stack', () => {
      const description = [
        '- `main` <!-- branch-stack -->',
        '  - \\#1 :point_left:',
        '',
      ].join('\n')
      const output = ['- `main` <!-- branch-stack -->', '  - \\#2 :point\\_left:'].join(
        '\n'
      )

      const actual = injectVisualization(output, description)
      const expected = [
        '- `main` <!-- branch-stack -->',
        '  - \\#2 :point\\_left:',
        '',
      ].join('\n')

      expect(actual).toBe(expected)
    })
  })

  describe('when anchor is missing', () => {
    describe('when previous stack exists', () => {
      it('should replace previous stack with updated stack', () => {
        const description = ['- `main`', '  - \\#1 :point\\_left:', ''].join('\n')
        const output = ['- `main` <!-- branch-stack -->', '  - \\#2 :point\\_left:'].join(
          '\n'
        )

        const actual = injectVisualization(output, description)
        const expected = [
          '- `main` <!-- branch-stack -->',
          '  - \\#2 :point\\_left:',
          '',
        ].join('\n')

        expect(actual).toBe(expected)
      })
    })
  })

  it('should not delete parts of the description below itself when there is another list', () => {
    const description = [
      '<!-- branch-stack -->',
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
    const output = ['- main <!-- branch-stack -->', '  - \\#1 :point\\_left:'].join('\n')

    const actual = injectVisualization(output, description)
    const expected = [
      '- main <!-- branch-stack -->',
      '  - \\#1 :point\\_left:',
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
    const description = [
      '<!-- branch-stack -->',
      '',
      '- [ ] this checklist',
      '  - [ ] is going to be alright but with an asterisk to start',
      '',
      '## More Description',
      '',
    ].join('\n')
    const output = ['- main <!-- branch-stack -->', '  - \\#1 :point\\_left:'].join('\n')

    const actual = injectVisualization(output, description)
    const expected = [
      '- main <!-- branch-stack -->',
      '  - \\#1 :point\\_left:',
      '',
      '* [ ] this checklist',
      '  - [ ] is going to be alright but with an asterisk to start',
      '',
      '## More Description',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })

  it('should correctly update pull request body when the comment is inline and there is a succeeding list', () => {
    const description = [
      '## Description',
      '',
      '## Stack',
      '',
      '- main <!-- branch-stack -->',
      '  - \\#1 :point\\_left:',
      '',
      '* my list',
      '  - should survive',
      '',
    ].join('\n')
    const output = ['- main <!-- branch-stack -->', '  - \\#2 :point\\_left:'].join('\n')

    const actual = injectVisualization(output, description)
    const expected = [
      '## Description',
      '',
      '## Stack',
      '',
      '- main <!-- branch-stack -->',
      '  - \\#2 :point\\_left:',
      '',
      '* my list',
      '  - should survive',
      '',
    ].join('\n')

    expect(actual).toEqual(expected)
  })
})
