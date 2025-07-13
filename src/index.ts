import * as core from '@actions/core'
import * as github from '@actions/github'
import { main } from './main'
import { inputs } from './inputs'
import { config } from './config'
import type { Context } from './types'

void run()

async function run() {
  try {
    const validTriggers = ['pull_request', 'pull_request_target']

    if (!validTriggers.includes(github.context.eventName)) {
      core.setFailed(
        `Action only supports the following triggers: ${validTriggers.map((trigger) => `\`${trigger}\``).join(', ')}`
      )
      return
    }

    const octokit = github.getOctokit(inputs.getToken())

    const location = inputs.getLocation()
    const skipSingleStacks = inputs.getSkipSingleStacks()
    const historyLimit = inputs.getHistoryLimit()
    const [mainBranch, remoteBranches, pullRequests] = await Promise.all([
      inputs.getMainBranch(octokit, config, github.context),
      inputs.getRemoteBranches(octokit, github.context),
      inputs.getPullRequests(octokit, github.context, historyLimit),
    ])
    const perennialBranches = await inputs.getPerennialBranches(config, remoteBranches)

    const context = {
      octokit,
      currentPullRequest: inputs.getCurrentPullRequest(github.context),
      pullRequests,
      mainBranch,
      perennialBranches,
      skipSingleStacks,
      location,
    } satisfies Context

    void main(context)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }

    throw error
  }
}
