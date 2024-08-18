import * as core from '@actions/core'
import type * as github from '@actions/github'
import { pullRequestSchema } from './types'
import type { PullRequest, Octokit } from './types'
import type { Config } from './config'

export const inputs = {
  getToken() {
    return core.getInput('github-token', { required: true, trimWhitespace: true })
  },

  getSkipSingleStacks() {
    core.startGroup('Inputs: Skip single stacks')
    const input = core.getBooleanInput('skip-single-stacks', { required: false })
    core.info(input.toString())
    core.endGroup()
    return input
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

  async getPerennialBranches(
    octokit: Octokit,
    config: Config | undefined,
    context: typeof github.context
  ): Promise<string[]> {
    const [{ data: unprotectedBranches }, { data: protectedBranches }] =
      await Promise.all([
        octokit.rest.repos.listBranches({ ...context.repo }),
        octokit.rest.repos.listBranches({ ...context.repo, protected: true }),
      ])

    core.startGroup('Inputs: Remote branches')
    core.info(`Unprotected: ${JSON.stringify(unprotectedBranches)}`)
    core.info(`Protected: ${JSON.stringify(protectedBranches)}`)
    core.endGroup()

    const repoBranches = [...unprotectedBranches, ...protectedBranches].map(
      (branch) => branch.name
    )

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
      ...repoBranches.filter((branch) =>
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
      const pullRequest:
        | {
            number: number
            base?: { ref?: string }
            head?: { ref?: string }
          }
        | undefined = context.payload.pull_request

      core.startGroup('Inputs: Current pull request')
      core.info(JSON.stringify(pullRequest))
      core.endGroup()

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
    const pullRequests = await octokit.paginate(
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

    core.startGroup('Inputs: Pull requests')
    core.info(
      JSON.stringify(pullRequests.map(({ body: _, ...pullRequest }) => pullRequest))
    )
    core.endGroup()

    return pullRequests
  },
}
