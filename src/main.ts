import * as core from '@actions/core'
import * as github from '@actions/github'
import { MultiDirectedGraph } from 'graphology'
import { bfsFromNode, dfs, dfsFromNode } from 'graphology-traversal'
import type { PullRequest, Context, StackNodeAttributes } from './types'
import { remark } from './remark'
import { inputs } from './inputs'

export async function main({
  octokit,
  mainBranch,
  perennialBranches,
  currentPullRequest,
  pullRequests,
}: Context) {
  const repoGraph = new MultiDirectedGraph<StackNodeAttributes>()

  repoGraph.addNode(mainBranch, {
    type: 'perennial',
    ref: mainBranch,
  })

  perennialBranches.forEach((perennialBranch) => {
    repoGraph.addNode(perennialBranch, {
      type: 'perennial',
      ref: perennialBranch,
    })
  })

  pullRequests.forEach((pullRequest) => {
    repoGraph.addNode(pullRequest.headRefName, {
      type: 'pull-request',
      ...pullRequest,
    })
  })

  pullRequests.forEach((pullRequest) => {
    repoGraph.addDirectedEdge(pullRequest.baseRefName, pullRequest.headRefName)
  })

  const getStackGraph = (pullRequest: PullRequest) => {
    const stackGraph = repoGraph.copy() as MultiDirectedGraph<StackNodeAttributes>
    stackGraph.setNodeAttribute(pullRequest.headRefName, 'isCurrent', true)

    bfsFromNode(
      stackGraph,
      pullRequest.headRefName,
      (ref, attributes) => {
        stackGraph.setNodeAttribute(ref, 'shouldPrint', true)
        return attributes.type === 'perennial'
      },
      {
        mode: 'inbound',
      }
    )

    dfsFromNode(
      stackGraph,
      pullRequest.headRefName,
      (ref) => {
        stackGraph.setNodeAttribute(ref, 'shouldPrint', true)
      },
      { mode: 'outbound' }
    )

    return stackGraph
  }

  const getOutput = (graph: MultiDirectedGraph<StackNodeAttributes>) => {
    const lines: string[] = []
    const terminatingRefs = [mainBranch, ...perennialBranches]

    dfs(
      graph,
      (_, stackNode, depth) => {
        if (!stackNode.shouldPrint) return

        const tabSize = depth * 2
        const indentation = new Array(tabSize).fill(' ').join('')

        let line = indentation

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

  const jobs: Array<() => Promise<void>> = []

  const isStack = (stackGraph: MultiDirectedGraph<StackNodeAttributes>) => {
    let isStack = false

    const graph = stackGraph.copy() as MultiDirectedGraph<StackNodeAttributes>

    dfs(
      graph,
      (_, attr, depth) => {
        if (attr.type === 'pull-request') {
          core.info(`iterating depth: ${depth} ${attr.number}`)
          if (depth > 1) {
            isStack = true
          }
        }

        return false
      },
      { mode: 'directed' }
    )

    core.info(`isStack: ${isStack}`)

    return isStack
  }

  // if (inputs.getSkipSingleStacks() && !isStack(stackGraph)) {
  //   return
  // }

  getStackGraph(currentPullRequest).forEachNode((_, stackNode) => {
    if (stackNode.type !== 'pull-request' || !stackNode.shouldPrint) {
      return
    }

    jobs.push(async () => {
      core.info(`Updating stack details for PR #${stackNode.number}`)

      const sg = getStackGraph(stackNode)

      if (inputs.getSkipSingleStacks()) {
        if (!isStack(sg)) {
          return Promise.resolve()
        }
      }

      const output = getOutput(sg)

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
