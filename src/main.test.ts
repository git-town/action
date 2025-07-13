import { describe, it, beforeEach, expect, vi } from 'vitest'
import { DirectedGraph } from 'graphology'
import { getStackGraph } from './main'
import type { PullRequest, StackNodeAttributes } from './types'

beforeEach(() => {
  vi.unstubAllEnvs()
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
