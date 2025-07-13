import type { PullRequest } from '../types'

export type Location = {
  update: (pullRequest: PullRequest, visualization: string) => Promise<void>
}
