import * as core from '@actions/core'
import * as github from '@actions/github'
import { DirectedGraph } from 'graphology'
import { bfsFromNode, dfsFromNode } from 'graphology-traversal'
import { topologicalSort } from 'graphology-dag'
import type { ListItem, Root } from 'mdast'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { remark } from './remark'

const ANCHOR = '<!-- branch-stack -->'
export const PULL_REQUEST_NODE_REGEX = /#\d+ :point_left:/

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
      core.startGroup(`PR #${stackNode.number}`)

      const stackGraph = getStackGraph(stackNode, repoGraph)
      const output = getOutput(stackGraph, terminatingRefs)

      let description = stackNode.body ?? ''
      description = updateDescription({
        description,
        output,
      })

      try {
        core.info('Updating PR...')
        const response = await octokit.rest.pulls.update({
          ...github.context.repo,
          pull_number: stackNode.number,
          body: description,
        })

        core.info('Updated Body:\n')
        const updatedBody = response.data.body ?? ''
        for (const line of updatedBody.split('\n')) {
          core.info(line)
        }
      } catch (error) {
        failedJobs.push(stackNode.number)

        if (error instanceof Error) {
          core.error(`Unable to update PR: ${error.message}`)
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

export function getOutput(
  graph: DirectedGraph<StackNodeAttributes>,
  terminatingRefs: string[]
) {
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

      if (depth === 0) {
        line += ` ${ANCHOR}`
      }

      lines.push(line)
    },
    { mode: 'directed' }
  )

  return lines.join('\n')
}

export function updateDescription({
  description,
  output,
}: {
  description: string
  output: string
}) {
  const descriptionAst = remark.parse(description)
  const outputAst = remark.parse(output)

  const standaloneAnchorIndex = descriptionAst.children.findIndex(
    (node) => node.type === 'html' && node.value === ANCHOR
  )

  if (standaloneAnchorIndex >= 0) {
    removeUnanchoredBranchStack(descriptionAst)

    descriptionAst.children.splice(standaloneAnchorIndex, 1, ...outputAst.children)
    return remark.stringify(descriptionAst)
  }

  const inlineAnchorIndex = findInlineAnchor(descriptionAst)

  const isMissingAnchor = inlineAnchorIndex === -1
  if (isMissingAnchor) {
    removeUnanchoredBranchStack(descriptionAst)

    descriptionAst.children.push(...outputAst.children)
    return remark.stringify(descriptionAst)
  }

  descriptionAst.children.splice(inlineAnchorIndex, 1, ...outputAst.children)
  return remark.stringify(descriptionAst)
}

function removeUnanchoredBranchStack(descriptionAst: Root) {
  const branchStackIndex = descriptionAst.children.findIndex(
    function matchesBranchStackHeuristic(node) {
      if (node.type !== 'list') {
        return false
      }

      const child = node.children[0]
      if (node.children.length !== 1 || !child) {
        return false
      }

      const result = containsPullRequestNode(child)

      return result
    }
  )

  if (branchStackIndex === -1) {
    return
  }

  descriptionAst.children.splice(branchStackIndex, 1)
}

function containsPullRequestNode(listItem: ListItem) {
  return listItem.children.some((node) => {
    if (node.type === 'list' && node.children.length > 0) {
      return node.children.some(containsPullRequestNode)
    }

    if (node.type !== 'paragraph') {
      return false
    }

    const result = node.children.some(
      (child) => child.type === 'text' && PULL_REQUEST_NODE_REGEX.test(child.value)
    )

    return result
  })
}

function findInlineAnchor(descriptionAst: Root): number {
  return descriptionAst.children.findIndex((node) => {
    if (node.type !== 'list') {
      return
    }

    return node.children.some(containsAnchor)
  })
}

function containsAnchor(listItem: ListItem): boolean {
  return listItem.children.some((node) => {
    if (node.type === 'list') {
      return node.children.some(containsAnchor)
    }

    if (node.type !== 'paragraph') {
      return false
    }

    const result = node.children.some(
      (child) => child.type === 'html' && child.value === ANCHOR
    )

    return result
  })
}
