# How to contribute #

We'd love to accept your patches and contributions to this project.  There are
just a few small guidelines you need to follow.

1. File a bug at https://github.com/google/shaka-player/issues (if there isn't
   one already).  If your patch is going to be large, you should start a
   discussion on the mailing list first to make sure it is in line with our
   design.

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
   that fails without your patch and passes with it.

7. Test all changes in both the compiler and linter with ./build/all.py.
   Patches that do not compile or pass linter checks will not be accepted.

8. Test all changes in the unit and integration tests with ./build/test.py.
   Patches that do not pass unit and integration tests will not be accepted.

9. Finally, push the commits to your fork and submit a [pull request][].

[forking]: https://help.github.com/articles/fork-a-repo
[AUTHORS]: AUTHORS
[CONTRIBUTORS]: CONTRIBUTORS
[well-formed commit messages]: http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html
[pull request]: https://help.github.com/articles/creating-a-pull-request


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

