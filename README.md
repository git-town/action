<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/git-town/git-town/main/website/src/logo.svg">
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/git-town/git-town/main/website/src/logo-dark.svg">
    <img alt="Git Town logo" src="https://raw.githubusercontent.com/git-town/git-town/main/website/src/logo.svg">
  </picture>
</p>

# Git Town Action V1

This action visualizes your stacked changes when proposing pull requests on GitHub:

![](./docs/example-visualization.png)

This allows you to easily see all related PRs for a given pull request, where
you are in the stack, as well as navigate between PRs in a stack.

It is designed to work out of the box with [Git Town](https://github.com/git-town/git-town) v12+,
but also supports previous versions via [manual configuration](#manual-configuration).

## What's New

Please refer to the [release page](https://github.com/git-town/action/releases/latest) for
the latest release notes.

## Getting Started

### Create the GitHub Actions Workflow File

Create a workflow file called `git-town.yml` under `.github/workflows` with the following
contents:

```yaml
name: Git Town

on:
  pull_request:
    branches:
      - '**'

jobs:
  git-town:
    name: Display the branch stack
    runs-on: ubuntu-latest

    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
      - uses: git-town/action@v1
```

Once this workflow is committed, the action will visualize your stacked changes
whenever a pull request is created or updated. It also will automatically read
your `.git-branches.toml` file to determine the main and perennial branches for
your repository.

### Modify the Pull Request Template

By default, the action will append the visualization to the bottom of the PR description.
If you are using a [pull request template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository),
you can specify the location of the visualization in the template by adding a [HTML comment](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#hiding-content-with-comments)
that contains `branch-stack` inside of it:

```md
## Stack

<!-- branch-stack --> 👈 Add this!

## Checklist

[ ] Foo
[ ] Bar
[ ] Baz
```

The action will look for this comment and insert the visualization underneath the comment
when it runs.

It will also leave behind the comment, so that the next time it runs, it will
be able to use it again to update the visualization:

```md
## Stack

- `main` <!-- branch-stack --> 👈 Still there!
  - \#1 :point_left:
    - \#2

## Checklist

[ ] Foo
[ ] Bar
[ ] Baz
```

## Manual Configuration

If you are using Git Town v11 and below, or are setting up the action for a repository
that doesn't have a `.git-branches.toml`, you will need to tell the action what the
main branch and perennial branches are for your repository.

### Main Branch

The main branch is the default parent branch for new feature branches, and can be
specified using the `main-branch` input:

```yaml
- uses: git-town/action@v1
  with:
    main-branch: 'main'
```

The action will default to your repository's default branch, which it fetches via
the GitHub REST API.

### Perennial Branches

Perennial branches are long lived branches and are never shipped.

There are two ways to specify perennial branches: explicitly or via regex. This can
be done with the `perennial-branches` and `perennial-regex` inputs respectively:

```yaml
- uses: git-town/action@v1
  with:
    perennial-branches: |
      dev
      staging
      prod
    perennial-regex: '^release-.*$'
```

Both inputs can be used at the same time. The action will merge the perennial
branches given into a single, de-duplicated list.

## Customization

### Skip Single Stacks

If you don't want the stack visualization to appear on pull requests which are **not** part
of a stack, add `skip-single-stacks: true` to the action's inputs.

A pull request is considered to be **not** a part of a stack if:
- It has no child pull requests.
- It's parent is the main branch or a perennial branch.

```yaml
- uses: git-town/action@v1
  with:
    skip-single-stacks: true
```

### History Limit

In order to accurately visualize stacked changes, the action needs to fetch _all_ open
and closed pull requests. However, this can increase the runtime of the action for
larger/older repositories.

If you're experiencing long runtimes, the `history-limit` input can be configured to
limit the total number of closed pull requests fetched by the action:

```yaml
- uses: git-town/action@v1
  with:
    history-limit: '500' # Only fetch the latest 500 closed pull requests
```

> [!WARNING]
> You may encounter inaccuracies in the visualization when customizing `history-limit` as
> open pull requests may refer to closed pull requests not fetched within the configured
> limits.

## Common Issues

### Visualization missing on pull requests from forked repositories

When creating pull requests from forked repositories, the "Allow edits by maintainers" option
enables contributors to grant/deny maintainers direct push access to the forked branch. The
problem with this option is that it also overrides the permissions granted to the action's
`GITHUB_TOKEN`. If edit access is not granted to maintainers, the action will not be
able to sync the visualization to the pull request description.

To work around this, you can create a [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
with write access to pull requests, store it as a repository secret, and then pass
it into the actions's `github-token` input to grant it sufficient permissions:

```yaml
  steps:
    - uses: actions/checkout@v4
    - uses: git-town/action@v1
      with:
        github-token: ${{ secrets.GIT_TOWN_PAT }} # 👈 Add this to `git-town.yml`
```

## Reference

```yaml
inputs:
  github-token:
    required: true
    default: ${{ github.token }}
  main-branch:
    required: false
    default: ''
  perennial-branches:
    required: false
    default: ''
  perennial-regex:
    required: false
    default: ''
  skip-single-stacks:
    required: false
    default: false
  history-limit:
    required: false
    default: '0'
```


## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
