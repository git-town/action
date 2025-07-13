import * as core from '@actions/core'
import * as github from '@actions/github'
import { ANCHOR, injectVisualization } from '../renderer'
import type { Context, Octokit, PullRequest } from '../types'
import type { AbstractLocationAdapter } from './types'

export class CommentLocationAdapter implements AbstractLocationAdapter {
  private octokit: Octokit

  constructor(context: Context) {
    this.octokit = context.octokit
  }

  async update(pullRequest: PullRequest, visualization: string) {
    core.startGroup(`Update: PR #${pullRequest.number} (COMMENT)`)
    core.info('Visualization:')
    core.info(visualization)

    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: pullRequest.number,
    })

    const existingComment = comments.find((comment) => comment.body?.includes(ANCHOR))
    if (existingComment) {
      const content = injectVisualization(visualization, existingComment.body ?? '')

      await this.octokit.rest.issues.updateComment({
        ...github.context.repo,
        comment_id: existingComment.id,
        issue_number: pullRequest.number,
        body: content,
      })
    } else {
      const content = injectVisualization(visualization, '')

      await this.octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: pullRequest.number,
        body: content,
      })
    }

    core.endGroup()
  }
}
