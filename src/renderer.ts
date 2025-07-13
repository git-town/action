import type { DirectedGraph } from 'graphology'
import { remark as createRemark } from 'remark'
import gfm from 'remark-gfm'
import { topologicalSort } from 'graphology-dag'
import { dfsFromNode } from 'graphology-traversal'
import type { ListItem, Root } from 'mdast'
import { type StackNodeAttributes } from './types'

export const ANCHOR = '<!-- branch-stack -->'
export const PULL_REQUEST_NODE_REGEX = /#\d+ :point_left:/

export const remark = createRemark().use(gfm).data('settings', {
  bullet: '-',
})

export function renderVisualization(
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

export function injectVisualization(visualization: string, content: string) {
  const contentAst = remark.parse(content)
  const visualizationAst = remark.parse(visualization)

  const standaloneAnchorIndex = contentAst.children.findIndex(
    (node) => node.type === 'html' && node.value === ANCHOR
  )

  if (standaloneAnchorIndex >= 0) {
    removeUnanchoredBranchStack(contentAst)

    contentAst.children.splice(standaloneAnchorIndex, 1, ...visualizationAst.children)
    return remark.stringify(contentAst)
  }

  const inlineAnchorIndex = findInlineAnchor(contentAst)

  const isMissingAnchor = inlineAnchorIndex === -1
  if (isMissingAnchor) {
    removeUnanchoredBranchStack(contentAst)

    contentAst.children.push(...visualizationAst.children)
    return remark.stringify(contentAst)
  }

  contentAst.children.splice(inlineAnchorIndex, 1, ...visualizationAst.children)
  return remark.stringify(contentAst)
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
