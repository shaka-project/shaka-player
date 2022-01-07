# Github Actions CLI

## Actions
  - 'custom-actions/lint-player/':
    Lints Shaka Player. 
  - 'custom-actions/build-player/'
    Builds Shaka Player.
  - 'custom-actions/test-player/'
    Tests Shaka Player. You can pass in the browser, as well as any arbitrary
    flags you want.

## Workflows
  - 'build_and_test.yaml':
    Lints the player, and builds and tests each combination of OS and browser.