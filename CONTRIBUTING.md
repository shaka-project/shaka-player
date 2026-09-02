# How to Contribute

We'd love to accept your patches and contributions to this project. There are just a few guidelines to follow.


## Filing Issues

Before starting work on a significant change, we recommend filing or finding an issue first. This lets us discuss the approach and avoid duplicated effort. For small bug fixes, jumping straight to a PR is fine.


## Submitting a Pull Request

All submissions, including submissions by project members, require review via GitHub pull request.


## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Commit messages and PR titles should use a type prefix such as `fix:`, `feat:`, `chore:`, etc. These feed directly into automated changelog generation and semantic versioning, so the message should describe the user-visible impact, not the implementation detail.

Because the PR title generates the changelog entry, your PR title should reflect what a user needs to know about the change.  So we would prefer `fix: Avoid uncaught exceptions when loading encrypted content` (says what was wrong from a user perspective) over `fix: Refactor internal error handling in FooLoader` (describes the internal changes, not the observable changes).


## Code Style and Tests

Before submitting a pull request, make sure your changes pass the project's linter and test suite. Details on how to run these can be found in the project's README, `AGENTS.md`, or via standard commands like `npm run lint` and `npm test`.


## AI-Assisted Contributions

Contributions written or assisted by AI coding agents are welcome. Any commit that involved AI assistance must include attribution in the commit message. See [`AGENT-ATTRIBUTION.md`](AGENT-ATTRIBUTION.md) for the required format.

**Why this matters:** Attribution helps reviewers calibrate their review effort, gives the project an honest record of how the code was produced, and ensures the human submitting the PR has reviewed and takes responsibility for the changes.


## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.
