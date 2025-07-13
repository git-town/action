import * as core from '@actions/core'
import type * as github from '@actions/github'
import type { Endpoints } from '@octokit/types'
import { pullRequestSchema } from './types'
import type { PullRequest, Octokit } from './types'
import type { Config } from './config'
import { locationInputSchema, type LocationInput } from './locations/types'

export const inputs = {
  getToken() {
    return core.getInput('github-token', { required: true, trimWhitespace: true })
  },

  getLocation(): LocationInput {
    const location = core.getInput('location', { required: false, trimWhitespace: true })

    try {
      return locationInputSchema.parse(location)
    } catch {
      core.setFailed(`Invalid 'location' input: ${location}`)
      process.exit(1)
    }
  },

  getSkipSingleStacks() {
    const input = core.getBooleanInput('skip-single-stacks', {
      required: false,
      trimWhitespace: true,
    })

    core.startGroup('Inputs: Skip single stacks')
    core.info(input.toString())
    core.endGroup()

    return input
  },

  getHistoryLimit(): number {
    const input = core.getInput('history-limit', {
      required: false,
      trimWhitespace: true,
    })
    const historyLimit = Number.parseInt(input, 10)

    core.startGroup('Inputs: History limit')
    core.info(input)
    core.endGroup()

    return historyLimit
  },

  async getMainBranch(
    octokit: Octokit,
    config: Config | undefined,
    context: typeof github.context
  ): Promise<string> {
    const {
      data: { default_branch: defaultBranch },
    } = await octokit.rest.repos.get({
      ...context.repo,
    })

    const mainBranchInput = core.getInput('main-branch', {
      required: false,
      trimWhitespace: true,
    })

    core.startGroup('Inputs: Main branch from input')
    core.info(mainBranchInput)
    core.endGroup()

    let mainBranch = defaultBranch
    mainBranch = config?.branches?.main ?? mainBranch
    mainBranch = mainBranchInput !== '' ? mainBranchInput : mainBranch

    return mainBranch
  },

  async getRemoteBranches(octokit: Octokit, context: typeof github.context) {
    const remoteBranches = await octokit.paginate(
      'GET /repos/{owner}/{repo}/branches',
      {
        ...context.repo,
        per_page: 100,
      },
      (response) => response.data.map((branch) => branch.name)
    )

    core.startGroup('Inputs: Remote branches')
    core.info(JSON.stringify(remoteBranches))
    core.endGroup()

    return remoteBranches
  },

  async getPerennialBranches(
    config: Config | undefined,
    remoteBranches: string[]
  ): Promise<string[]> {
    let explicitBranches: string[] = []
    explicitBranches = config?.branches?.perennials ?? explicitBranches
    const perennialBranchesInput = core.getMultilineInput('perennial-branches', {
      required: false,
      trimWhitespace: true,
    })
    explicitBranches =
      perennialBranchesInput.length > 0 ? perennialBranchesInput : explicitBranches

    core.startGroup('Inputs: Explicit branches')
    core.info(JSON.stringify(explicitBranches))
    core.endGroup()

    let perennialRegex: string | undefined
    perennialRegex = config?.branches?.['perennial-regex'] ?? perennialRegex
    const perennialRegexInput = core.getInput('perennial-regex', {
      required: false,
      trimWhitespace: true,
    })
    perennialRegex = perennialRegexInput !== '' ? perennialRegexInput : perennialRegex

    const perennialBranches = [
      ...explicitBranches,
      ...remoteBranches.filter((branch) =>
        perennialRegex ? RegExp(perennialRegex).test(branch) : false
      ),
    ]

    core.startGroup('Inputs: Perennial branches')
    core.info(JSON.stringify(perennialBranches))
    core.endGroup()

    // De-dupes return value
    return [...new Set(perennialBranches)]
  },

  getCurrentPullRequest(context: typeof github.context) {
    try {
      const pullRequest = pullRequestSchema.parse(context.payload.pull_request)

      core.startGroup('Inputs: Current pull request')
      core.info(JSON.stringify(pullRequest))
      core.endGroup()

      return pullRequest
    } catch (error) {
      core.setFailed(`Unable to determine current pull request from action payload`)
      throw error
    }
  },

  async getPullRequests(
    octokit: Octokit,
    context: typeof github.context,
    historyLimit: number
  ) {
    function toPullRequest(
      item: Endpoints['GET /repos/{owner}/{repo}/pulls']['response']['data'][number]
    ): PullRequest {
      return {
        number: item.number,
        base: { ref: item.base.ref },
        head: { ref: item.head.ref },
        body: item.body ?? undefined,
        state: item.state,
      }
    }

    let closedPullRequestCount = 0

    const [openPullRequests, closedPullRequests] = await Promise.all([
      octokit.paginate(
        'GET /repos/{owner}/{repo}/pulls',
        {
          ...context.repo,
          state: 'open',
          per_page: 100,
        },
        (response) => response.data.map(toPullRequest)
      ),

      octokit.paginate(
        'GET /repos/{owner}/{repo}/pulls',
        {
          ...context.repo,
          state: 'closed',
          per_page: 100,
        },
        (response, done) => {
          closedPullRequestCount += response.data.length

          if (historyLimit > 0 && closedPullRequestCount >= historyLimit) {
            done()
          }

          return response.data.map(toPullRequest)
        }
      ),
    ])

    const pullRequests = [...openPullRequests, ...closedPullRequests]
    pullRequests.sort((a, b) => b.number - a.number)

    core.startGroup('Inputs: Pull requests')
    core.info(
      JSON.stringify(pullRequests.map(({ body: _, ...pullRequest }) => pullRequest))
    )
    core.endGroup()

    return pullRequests
  },
}
