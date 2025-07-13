import type { PullRequest } from '../types'

export type Target = {
  update: (pullRequest: PullRequest, visualization: string) => Promise<void>
}
