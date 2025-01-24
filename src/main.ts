import * as core from '@actions/core'
import * as github from '@actions/github'
import { DirectedGraph } from 'graphology'
import { bfsFromNode, dfsFromNode } from 'graphology-traversal'
import { topologicalSort } from 'graphology-dag'
import type { BlockContent, DefinitionContent, List, Paragraph, RootContent } from 'mdast'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { remark } from './remark'

const ANCHOR = '<!-- branch-stack -->'

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

  stackGraph.forEachNode((_, stackNode) => {
    if (stackNode.type !== 'pull-request' || !stackNode.shouldPrint) {
      return
    }

    jobs.push(async () => {
      core.info(`Updating stack details for PR #${stackNode.number}`)

      const stackGraph = getStackGraph(stackNode, repoGraph)
      const output = getOutput(stackGraph, terminatingRefs)

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

const findNewAnchorIndex = (descriptionAst: ReturnType<typeof remark.parse>) => {
  const listChildren = descriptionAst.children
    .map((node, originalIndex) => [node, originalIndex] as const)
    .filter(([node]) => node.type === 'list')

  const [, listChildWithAnchorIdx] =
    (listChildren as Array<[List, number]>).find(([node]) => {
      const listItems = node.children
      const maybeFirstListItemParagraph = listItems[0]?.children[0] as
        | Paragraph
        | undefined
      return maybeFirstListItemParagraph?.children.some(
        (node) => node.type === 'html' && node.value === ANCHOR
      )
    }) ?? []

  return listChildWithAnchorIdx
}

const isListType = (
  listAstNode: RootContent | undefined | BlockContent | DefinitionContent
): listAstNode is List => listAstNode?.type === 'list'

const nearestListContainsPrs = (listAst: RootContent | undefined) => {
  if (!listAst || !isListType(listAst)) return false

  if (listAst.children.length > 1) {
    return false
  }

  const subList = listAst.children[0]?.children[1]

  if (!isListType(subList)) return false

  const firstItemParagraphNode = subList.children[0]?.children[0]
  if (firstItemParagraphNode?.type !== 'paragraph') return false

  const sublistFirstItemParagraphText = firstItemParagraphNode.children[0]
  if (sublistFirstItemParagraphText?.type !== 'text') return false

  return /^#\d+/.test(sublistFirstItemParagraphText.value)
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

  const anchorIndex =
    findNewAnchorIndex(descriptionAst) ??
    descriptionAst.children.findIndex(
      (node) => node.type === 'html' && node.value === ANCHOR
    )

  const isMissingAnchor = anchorIndex === -1
  if (isMissingAnchor) {
    descriptionAst.children.push(...outputAst.children)

    return remark.stringify(descriptionAst)
  }

  // if the anchor is the last ast node, set nearestListIndex to anchorIndex for proper splicing
  let nearestListIndex =
    anchorIndex === descriptionAst.children.length - 1 ? anchorIndex : anchorIndex + 1

  if (
    descriptionAst.children[nearestListIndex]?.type !== 'list' ||
    !nearestListContainsPrs(descriptionAst.children[nearestListIndex])
  ) {
    nearestListIndex = anchorIndex
  }

  descriptionAst.children.splice(
    anchorIndex,
    nearestListIndex - anchorIndex + 1,
    ...outputAst.children
  )

  return remark.stringify(descriptionAst)
}
