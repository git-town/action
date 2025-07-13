import * as core from '@actions/core'
import * as github from '@actions/github'
import { injectVisualization } from '../renderer'
import type { Context, Octokit, PullRequest } from '../types'
import type { AbstractLocationAdapter } from './types'

export class DescriptionLocationAdapter implements AbstractLocationAdapter {
  private octokit: Octokit

  constructor(context: Context) {
    this.octokit = context.octokit
  }

  async update(pullRequest: PullRequest, visualization: string) {
    core.startGroup(`Update: PR #${pullRequest.number} (DESCRIPTION)`)
    core.info('Visualization:')
    core.info(visualization)

    const description = injectVisualization(visualization, pullRequest.body ?? '')
    core.info('Description:')
    core.info(description)

    await this.octokit.rest.pulls.update({
      ...github.context.repo,
      pull_number: pullRequest.number,
      body: description,
    })

    core.endGroup()
  }
}
