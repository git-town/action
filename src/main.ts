import { DirectedGraph } from 'graphology'
import { bfsFromNode, dfsFromNode } from 'graphology-traversal'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { renderVisualization } from './renderer'
import { createLocationAdapter } from './locations/factory'

export async function main(context: Context) {
  const {
    currentPullRequest,
    pullRequests,
    mainBranch,
    perennialBranches,
    skipSingleStacks,
  } = context
  const repoGraph = new DirectedGraph<StackNodeAttributes>()

  // Add main branch as node to repo graph
  repoGraph.mergeNode(mainBranch, {
    type: 'perennial',
    ref: mainBranch,
  })

  // Add all known perennial branches as nodes to repo graph
  perennialBranches.forEach((perennialBranch) => {
    repoGraph.mergeNode(perennialBranch, {
      type: 'perennial',
      ref: perennialBranch,
    })
  })

  // Add open pull requests as nodes to repo graph
  const openPullRequests = pullRequests.filter(
    (pullRequest) => pullRequest.state === 'open'
  )
  openPullRequests.forEach((openPullRequest) => {
    repoGraph.mergeNode(openPullRequest.head.ref, {
      type: 'pull-request',
      ...openPullRequest,
    })
  })

  // Link stacked pull requests with edges in repo graph
  openPullRequests.forEach((openPullRequest) => {
    const hasExistingBase = repoGraph.hasNode(openPullRequest.base.ref)
    if (hasExistingBase) {
      repoGraph.mergeDirectedEdge(openPullRequest.base.ref, openPullRequest.head.ref)

      return
    }

    // Attempt to link pull requests whose base pull request is already closed.
    // This may fail if the `history-limit` input is set and the base is not
    // present in the action's retrieved pull requests.
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

  stackGraph.forEachNode((_, stackNode) => {
    if (stackNode.type !== 'pull-request' || !stackNode.shouldPrint) {
      return
    }

    jobs.push(async () => {
      const stackGraph = getStackGraph(stackNode, repoGraph)
      const visualization = renderVisualization(stackGraph, terminatingRefs)

      const location = createLocationAdapter(context)
      await location.update(stackNode, visualization)
    })
  })

  await Promise.all(jobs.map((job) => job()))
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
