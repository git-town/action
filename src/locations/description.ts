import * as github from '@actions/github'
import { injectVisualization } from '../renderer'
import type { Context, Octokit, PullRequest } from '../types'
import type { Target } from './types'

export class DescriptionTarget implements Target {
  private octokit: Octokit

  constructor(context: Context) {
    this.octokit = context.octokit
  }

  async update(pullRequest: PullRequest, visualization: string) {
    const description = injectVisualization(visualization, pullRequest.body ?? '')

    await this.octokit.rest.pulls.update({
      ...github.context.repo,
      pull_number: pullRequest.number,
      body: description,
    })
  }
}
