import { describe, beforeEach, it, expect, vi } from 'vitest'
import type * as github from '@actions/github'
import { inputs } from './inputs'
import type { Octokit } from './types'
import type { Config } from './config'

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('getMainBranch', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('should default to default branch', async () => {
    const octokit = {
      rest: {
        repos: {
          get: async () => ({
            data: {
              default_branch: 'master',
            },
          }),
        },
      },
    } as unknown as Octokit
    const config: Config = {}
    const context = {
      repo: {},
    } as unknown as typeof github.context

    const mainBranch = await inputs.getMainBranch(octokit, config, context)

    expect(mainBranch).toBe('master')
  })

  it('should override default with config', async () => {
    const octokit = {
      rest: {
        repos: {
          get: async () => ({
            data: {
              default_branch: 'master',
            },
          }),
        },
      },
    } as unknown as Octokit
    const config: Config = {
      branches: {
        main: 'main',
      },
    }
    const context = {
      repo: {},
    } as unknown as typeof github.context

    const mainBranch = await inputs.getMainBranch(octokit, config, context)

    expect(mainBranch).toBe('main')
  })

  it('should override config with inputs', async () => {
    vi.stubEnv('INPUT_MAIN-BRANCH', 'prod')

    const octokit = {
      rest: {
        repos: {
          get: async () => ({
            data: {
              default_branch: 'master',
            },
          }),
        },
      },
    } as unknown as Octokit
    const config = {
      branches: {
        main: 'main',
      },
    }
    const context = {
      repo: {},
    } as unknown as typeof github.context

    const mainBranch = await inputs.getMainBranch(octokit, config, context)

    expect(mainBranch).toBe('prod')
  })
})

describe('getPerennialBranches', () => {
  const remoteBranches = ['main', 'release-v1.0.0', 'v1.0.0']
  const config: Config = {
    branches: {
      perennials: ['dev', 'staging', 'prod'],
      'perennial-regex': '^release-.*$',
    },
  }

  it('should default to no branches', async () => {
    const perennialBranches = await inputs.getPerennialBranches(undefined, remoteBranches)

    expect(perennialBranches).toStrictEqual([])
  })

  it('should override default with config', async () => {
    const perennialBranches = await inputs.getPerennialBranches(config, remoteBranches)

    expect(perennialBranches).toStrictEqual(['dev', 'staging', 'prod', 'release-v1.0.0'])
  })

  it('should override config with inputs', async () => {
    vi.stubEnv(
      'INPUT_PERENNIAL-BRANCHES',
      `
        test
        uat
        live
      `
    )
    vi.stubEnv('INPUT_PERENNIAL-REGEX', '^v.*$')

    const perennialBranches = await inputs.getPerennialBranches(config, remoteBranches)

    expect(perennialBranches).toStrictEqual(['test', 'uat', 'live', 'v1.0.0'])
  })
})

describe('getCurrentPullRequest', () => {
  it('should return current pull request from action payload', () => {
    const validContext = {
      payload: {
        pull_request: {
          number: 100,
          base: { ref: 'main' },
          head: { ref: 'feat/git-town-action' },
          state: 'open',
        },
      },
    } as unknown as typeof github.context

    const currentPullRequest = inputs.getCurrentPullRequest(validContext)

    expect(currentPullRequest).toStrictEqual({
      number: 100,
      base: { ref: 'main' },
      head: { ref: 'feat/git-town-action' },
      state: 'open',
    })
  })

  it('should throw an error when current pull request not found in action payload', () => {
    const invalidContext = {
      payload: {},
    } as unknown as typeof github.context

    expect(() => inputs.getCurrentPullRequest(invalidContext)).toThrow()
  })
})
