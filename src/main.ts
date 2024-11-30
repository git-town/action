import * as core from '@actions/core'
import * as github from '@actions/github'
import { DirectedGraph } from 'graphology'
import { bfsFromNode, dfsFromNode } from 'graphology-traversal'
import { topologicalSort } from 'graphology-dag'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { remark } from './remark'

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
    const hasExistingBasePullRequest = repoGraph.hasNode(openPullRequest.base.ref)
    if (hasExistingBasePullRequest) {
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

  const getStackGraph = (pullRequest: PullRequest) => {
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

    return DirectedGraph.from(stackGraph.toJSON())
  }

  const getOutput = (graph: DirectedGraph<StackNodeAttributes>) => {
    const lines: string[] = []

    // `dfs` is bugged and doesn't traverse in topological order.
    // `dfsFromNode` does, so we'll do the topological sort ourselves
    // start traversal from the root.
    const rootRef = topologicalSort(graph)[0]

    dfsFromNode(
      graph,
      rootRef,
      (_, stackNode, depth) => {
        if (!stackNode.shouldPrint) return

        const tabSize = depth * 2
        const indentation = new Array(tabSize).fill(' ').join('')

        let line = indentation

        if (stackNode.type === 'orphan-branch') {
          line += `- \`${stackNode.ref}\` - :warning: No PR associated with branch`
        }

        if (stackNode.type === 'perennial' && terminatingRefs.includes(stackNode.ref)) {
          line += `- \`${stackNode.ref}\``
        }

        if (stackNode.type === 'pull-request') {
          line += `- #${stackNode.number}`
        }

        if (stackNode.isCurrent) {
          line += ' :point_left:'
        }

        lines.push(line)
      },
      { mode: 'directed' }
    )

    return lines.join('\n')
  }

  const stackGraph = getStackGraph(currentPullRequest)

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
      core.info(`Updating stack details for PR #${stackNode.number}`)

      const stackGraph = getStackGraph(stackNode)
      const output = getOutput(stackGraph)

      let description = stackNode.body ?? ''
      description = updateDescription({
        description,
        output,
      })

      await octokit.rest.pulls.update({
        ...github.context.repo,
        pull_number: stackNode.number,
        body: description,
      })
    })
  })

  await Promise.allSettled(jobs.map((job) => job()))
}

export function updateDescription({
  description,
  output,
}: {
  description: string
  output: string
}) {
  const ANCHOR = '<!-- branch-stack -->'

  const descriptionAst = remark.parse(description)
  const outputAst = remark.parse(`${ANCHOR}\n${output}`)

  const anchorIndex = descriptionAst.children.findIndex(
    (node) => node.type === 'html' && node.value === ANCHOR
  )

  const isMissingAnchor = anchorIndex === -1
  if (isMissingAnchor) {
    descriptionAst.children.push(...outputAst.children)

    return remark.stringify(descriptionAst)
  }

  let nearestListIndex = anchorIndex

  for (let i = anchorIndex; i < descriptionAst.children.length; i += 1) {
    const node = descriptionAst.children[i]

    if (node?.type === 'list') {
      nearestListIndex = i
      break
    }
  }

  descriptionAst.children.splice(
    anchorIndex,
    nearestListIndex - anchorIndex + 1,
    ...outputAst.children
  )

  return remark.stringify(descriptionAst)
}
