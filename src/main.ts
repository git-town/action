import * as core from '@actions/core'
import * as github from '@actions/github'
import { DirectedGraph } from 'graphology'
import { bfsFromNode, dfsFromNode } from 'graphology-traversal'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { renderVisualization, injectVisualization } from './renderer'

export async function main({
  octokit,
  currentPullRequest,
  pullRequests,
  mainBranch,
  perennialBranches,
  skipSingleStacks,
}: Context) {
  const repoGraph = new DirectedGraph<StackNodeAttributes>()

  repoGraph.mergeNode(mainBranch, {
    type: 'perennial',
    ref: mainBranch,
  })

  perennialBranches.forEach((perennialBranch) => {
    repoGraph.mergeNode(perennialBranch, {
      type: 'perennial',
      ref: perennialBranch,
    })
  })

  const openPullRequests = pullRequests.filter(
    (pullRequest) => pullRequest.state === 'open'
  )

  openPullRequests.forEach((openPullRequest) => {
    repoGraph.mergeNode(openPullRequest.head.ref, {
      type: 'pull-request',
      ...openPullRequest,
    })
  })

  openPullRequests.forEach((openPullRequest) => {
    const hasExistingBase = repoGraph.hasNode(openPullRequest.base.ref)
    if (hasExistingBase) {
      repoGraph.mergeDirectedEdge(openPullRequest.base.ref, openPullRequest.head.ref)

      return
    }

    const basePullRequest = pullRequests.find(
      (basePullRequest) => basePullRequest.head.ref === openPullRequest.base.ref
    )
    if (basePullRequest?.state === 'closed') {
      repoGraph.mergeNode(openPullRequest.base.ref, {
        type: 'pull-request',
        ...basePullRequest,
      })
      repoGraph.mergeDirectedEdge(openPullRequest.base.ref, openPullRequest.head.ref)

      return
    }

    repoGraph.mergeNode(openPullRequest.base.ref, {
      type: 'orphan-branch',
      ref: openPullRequest.base.ref,
    })
    repoGraph.mergeDirectedEdge(openPullRequest.base.ref, openPullRequest.head.ref)
  })

  const terminatingRefs = [mainBranch, ...perennialBranches]

  const stackGraph = getStackGraph(currentPullRequest, repoGraph)

  const shouldSkip = () => {
    const neighbors = stackGraph.neighbors(currentPullRequest.head.ref)
    const allPerennialBranches = stackGraph.filterNodes(
      (_, nodeAttributes) => nodeAttributes.type === 'perennial'
    )

    return (
      skipSingleStacks &&
      neighbors.length === 1 &&
      allPerennialBranches.includes(neighbors.at(0) || '')
    )
  }

  if (shouldSkip()) {
    return
  }

  const jobs: Array<() => Promise<void>> = []
  const failedJobs: number[] = []

  stackGraph.forEachNode((_, stackNode) => {
    if (stackNode.type !== 'pull-request' || !stackNode.shouldPrint) {
      return
    }

    jobs.push(async () => {
      try {
        core.startGroup(`PR #${stackNode.number}`)

        const stackGraph = getStackGraph(stackNode, repoGraph)
        const visualization = renderVisualization(stackGraph, terminatingRefs)

        core.info('--- Visualization ---')
        core.info('')
        visualization.split('\n').forEach(core.info)
        core.info('')
        core.info('--- End visualization ---')
        core.info('')

        let description = stackNode.body ?? ''
        description = injectVisualization(visualization, description)

        core.info('--- Updated description ---')
        core.info('')
        description.split('\n').forEach(core.info)
        core.info('')
        core.info('--- End updated description ---')
        core.info('')

        core.info('Updating PR via GitHub API...')
        const response = await octokit.rest.pulls.update({
          ...github.context.repo,
          pull_number: stackNode.number,
          body: description,
        })
        core.info('✅ Done')
        core.info('')

        core.info('--- API response ---')
        core.info('')
        const updatedBody = response.data.body ?? ''
        updatedBody.split('\n').forEach(core.info)
        core.info('')
        core.info('--- End API response ---')
      } catch (error) {
        failedJobs.push(stackNode.number)

        if (error instanceof Error) {
          core.error(`Unable to update PR: ${error.message}`)
        } else {
          core.error(String(error))
        }
      } finally {
        core.endGroup()
      }
    })
  })

  await Promise.allSettled(jobs.map((job) => job()))

  if (failedJobs.length > 0) {
    core.setFailed(
      `Action failed for ${failedJobs.map((pullRequestNumber) => `#${pullRequestNumber}`).join(', ')}`
    )
  }
}

export function getStackGraph(
  pullRequest: PullRequest,
  repoGraph: DirectedGraph<StackNodeAttributes>
) {
  const stackGraph = repoGraph.copy() as DirectedGraph<StackNodeAttributes>
  stackGraph.setNodeAttribute(pullRequest.head.ref, 'isCurrent', true)

  bfsFromNode(
    stackGraph,
    pullRequest.head.ref,
    (ref, attributes) => {
      stackGraph.setNodeAttribute(ref, 'shouldPrint', true)
      return attributes.type === 'perennial' || attributes.type === 'orphan-branch'
    },
    { mode: 'inbound' }
  )

  dfsFromNode(
    stackGraph,
    pullRequest.head.ref,
    (ref) => {
      stackGraph.setNodeAttribute(ref, 'shouldPrint', true)
    },
    { mode: 'outbound' }
  )

  stackGraph.forEachNode((ref, stackNode) => {
    if (!stackNode.shouldPrint) {
      stackGraph.dropNode(ref)
    }
  })

  return stackGraph
}
