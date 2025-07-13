import type { infer as InferType } from 'zod'
import { z } from 'zod'
import type { PullRequest } from '../types'

export const locationInputSchema = z.enum(['description', 'comment'])
export type LocationInput = InferType<typeof locationInputSchema>

export type Location = {
  update: (pullRequest: PullRequest, visualization: string) => Promise<void>
}
