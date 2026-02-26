# How to contribute #

We'd love to accept your patches and contributions to this project.  There are
just a few small guidelines you need to follow.

1. File a bug at https://github.com/shaka-project/shaka-player/issues (if there
   isn't one already).  If your patch is going to be large, you should start a
   discussion on GitHub first.

   Leave a comment to let us know that you are working on a PR for the issue.
   We'll assign the issue to you.

2. For legal reasons, all contributors must sign a Contributor License
   Agreement, either for an individual or corporation, before a patch can be
   accepted.  (See below.)

3. Follow the normal process of [forking][] the project, and setup a new
   branch to work in.  It's important that each group of changes be done in
   separate branches in order to ensure that a pull request only includes the
   commits related to that bug or feature.

4. Add an entry to the [AUTHORS][] and [CONTRIBUTORS][] files with your name
   and email.  For corporate contributions, AUTHORS should contain an entry
   for your company.

5. Do your best to have [well-formed commit messages][] for each change.
   This provides consistency throughout the project, and ensures that commit
   messages are able to be formatted properly by various git tools.

6. Add or modify unit or integration tests for any new or modified
   functionality in your patch.  For bug fixes, try to write a regression test
   that fails without your patch and passes with it. Our tests are written with
   [Jasmine](https://jasmine.github.io/).

7. Test all changes in both the compiler and linter with:
```sh
   python3 build/all.py
```
   Patches that do not compile or pass linter checks will not be accepted.

8. Test all changes in the unit and integration tests with:
```sh
   python3 build/test.py
```
   Patches that do not pass unit and integration tests will not be accepted.

9. Finally, push the commits to your fork and submit a [pull request][].

[forking]: https://help.github.com/articles/fork-a-repo
[AUTHORS]: AUTHORS
[CONTRIBUTORS]: CONTRIBUTORS
[well-formed commit messages]: http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html
[pull request]: https://help.github.com/articles/creating-a-pull-request


## AI-Assisted Contributions ##

We welcome contributions that were written or assisted by AI coding agents (such
as Claude Code, GitHub Copilot, Cursor, or similar tools).  However, any commit
that involved AI assistance must say so clearly.

The preferred convention is a **git trailer** in the commit message:

```
Co-authored-by: Claude Code <noreply@anthropic.com>
```

Git trailers are lines at the end of the commit message body, separated from the
body by a blank line, in `Key: Value` format.  GitHub renders `Co-authored-by`
trailers natively, showing the tool as a co-author on the commit and pull
request.

Other tools have their own canonical addresses — use whatever the tool provides,
or follow the same pattern:

```
Co-authored-by: GitHub Copilot <copilot@github.com>
Co-authored-by: Cursor <cursor@anysphere.com>
```

If you used multiple tools or a tool doesn't have a canonical address, a
`Co-authored-by` line with a descriptive name is fine:

```
Co-authored-by: Claude Code (claude-sonnet-4-6) <noreply@anthropic.com>
```

**Why this matters:** Attribution helps reviewers calibrate their review effort,
gives the project an honest record of how the code was produced, and keeps us
compliant with the CLA requirement that contributions be your own original work
(or clearly attributed when they are not).

Note that the CLA still applies to AI-assisted contributions: by submitting a
pull request you are attesting that you reviewed the AI-generated code, that you
take responsibility for it, and that you have the right to submit it under the
project's license.

## Contributor License Agreement ##

Contributions to any Google project must be accompanied by a Contributor
License Agreement.  This is not a copyright **assignment**, it simply gives
Google permission to use and redistribute your contributions as part of the
project.

  * If you are an individual writing original source code and you're sure you
    own the intellectual property, then you'll need to sign an [individual
    CLA][].

  * If you work for a company that wants to allow you to contribute your work,
    then you'll need to sign a [corporate CLA][].

You generally only need to submit a CLA once, so if you've already submitted
one (even if it was for a different project), you probably don't need to do it
again.

[individual CLA]: https://developers.google.com/open-source/cla/individual
[corporate CLA]: https://developers.google.com/open-source/cla/corporate

