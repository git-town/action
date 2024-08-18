import type { getOctokit } from '@actions/github'
import type { infer as InferType } from 'zod'
import { object, number, string } from 'zod'

export type Octokit = ReturnType<typeof getOctokit>

export const pullRequestSchema = object({
  number: number(),
  baseRefName: string(),
  headRefName: string(),
  body: string().optional(),
})
export type PullRequest = InferType<typeof pullRequestSchema>

export type Context = {
  octokit: Octokit
  mainBranch: string
  currentPullRequest: PullRequest
  pullRequests: PullRequest[]
  perennialBranches: string[]
  skipSingleStacks: boolean
}

export type StackNode =
  | {
      type: 'perennial'
      ref: string
    }
  | ({
      type: 'pull-request'
    } & PullRequest)

export type StackNodeAttributes = StackNode & {
  isCurrent?: true
  shouldPrint?: true
}
