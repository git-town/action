import * as core from '@actions/core'
import type * as github from '@actions/github'
import { pullRequestSchema } from './types'
import type { PullRequest, Octokit } from './types'
import type { Config } from './config'

export const inputs = {
  getToken() {
    return core.getInput('github-token', { required: true, trimWhitespace: true })
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

    let mainBranch = defaultBranch
    mainBranch = config?.branches?.main ?? mainBranch
    mainBranch = mainBranchInput !== '' ? mainBranchInput : mainBranch

    return mainBranch
  },

  async getPerennialBranches(
    octokit: Octokit,
    config: Config | undefined,
    context: typeof github.context
  ): Promise<string[]> {
    const { data } = await octokit.rest.repos.listBranches({ ...context.repo })
    const repoBranches = data.map((branch) => branch.name)

    let explicitBranches: string[] = []
    explicitBranches = config?.branches?.perennials ?? explicitBranches
    const perennialBranchesInput = core.getMultilineInput('perennial-branches', {
      required: false,
      trimWhitespace: true,
    })
    explicitBranches =
      perennialBranchesInput.length > 0 ? perennialBranchesInput : explicitBranches

    let perennialRegex: string | undefined
    perennialRegex = config?.branches?.perennialRegex ?? perennialRegex
    const perennialRegexInput = core.getInput('perennial-regex', {
      required: false,
      trimWhitespace: true,
    })
    perennialRegex = perennialRegexInput !== '' ? perennialRegexInput : perennialRegex

    const perennialBranches = [
      ...explicitBranches,
      ...repoBranches.filter((branch) =>
        perennialRegex ? RegExp(perennialRegex).test(branch) : false
      ),
    ]

    // De-dupes return value
    return [...new Set(perennialBranches)]
  },

  getCurrentPullRequest(context: typeof github.context) {
    try {
      const pullRequest:
        | {
            number: number
            base?: { ref?: string }
            head?: { ref?: string }
          }
        | undefined = context.payload.pull_request

      return pullRequestSchema.parse({
        number: pullRequest?.number,
        baseRefName: pullRequest?.base?.ref,
        headRefName: pullRequest?.head?.ref,
      })
    } catch (error) {
      core.setFailed(`Unable to determine current pull request from action payload`)
      throw error
    }
  },

  async getPullRequests(octokit: Octokit, context: typeof github.context) {
    return octokit.paginate(
      'GET /repos/{owner}/{repo}/pulls',
      {
        ...context.repo,
        state: 'open',
        per_page: 100,
      },
      (response) =>
        response.data.map(
          (item): PullRequest => ({
            number: item.number,
            baseRefName: item.base.ref,
            headRefName: item.head.ref,
            body: item.body ?? undefined,
          })
        )
    )
  },
}
