import * as core from '@actions/core'
import * as github from '@actions/github'
import { main } from './main'
import { inputs } from './inputs'
import { config } from './config'

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

    const [mainBranch, perennialBranches, pullRequests] = await Promise.all([
      inputs.getMainBranch(octokit, config, github.context),
      inputs.getPerennialBranches(octokit, config, github.context),
      inputs.getPullRequests(octokit, github.context),
    ])

    const context = {
      octokit,
      currentPullRequest: inputs.getCurrentPullRequest(github.context),
      pullRequests,
      mainBranch,
      perennialBranches,
      skipSingleStacks: inputs.getSkipSingleStacks(),
    }

    void main(context)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }

    throw error
  }
}
