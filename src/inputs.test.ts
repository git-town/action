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
  const octokit = {
    rest: {
      repos: {
        listBranches: async () => ({
          data: [
            {
              name: 'main',
              commit: { sha: '', url: '' },
              protection: false,
            },
            {
              name: 'release-v1.0.0',
              commit: { sha: '', url: '' },
              protection: false,
            },
            {
              name: 'v1.0.0',
              commit: { sha: '', url: '' },
              protection: false,
            },
          ],
        }),
      },
    },
  } as unknown as Octokit
  const config: Config = {
    branches: {
      perennials: ['dev', 'staging', 'prod'],
      'perennial-regex': '^release-.*$',
    },
  }
  const context = {
    repo: {},
  } as unknown as typeof github.context

  it('should default to no branches', async () => {
    const perennialBranches = await inputs.getPerennialBranches(
      octokit,
      undefined,
      context
    )

    expect(perennialBranches).toStrictEqual([])
  })

  it('should override default with config', async () => {
    const perennialBranches = await inputs.getPerennialBranches(octokit, config, context)

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

    const perennialBranches = await inputs.getPerennialBranches(octokit, config, context)

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
        },
      },
    } as unknown as typeof github.context

    const currentPullRequest = inputs.getCurrentPullRequest(validContext)

    expect(currentPullRequest).toStrictEqual({
      number: 100,
      baseRefName: 'main',
      headRefName: 'feat/git-town-action',
    })
  })

  it('should throw an error when current pull request not found in action payload', () => {
    const invalidContext = {
      payload: {},
    } as unknown as typeof github.context

    expect(() => inputs.getCurrentPullRequest(invalidContext)).toThrow()
  })
})
