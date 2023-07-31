# Selenium Grid Config

Shaka Player's test runner (Karma) can be directed to run tests on a Selenium
grid.  For this, you need a config file that defines what browsers are
available, and how to request them via WebDriver.

For a fully-worked, detailed example, see the config for the private grid in
our lab at [build/shaka-lab.yaml](https://github.com/shaka-project/shaka-player/blob/main/build/shaka-lab.yaml)

## Usage

```sh
python build/test.py \
    --grid-config grid-config.yaml \
    --grid-address selenium-hub-hostname:4444
```

## Syntax

The config file is written in YAML.  We chose YAML because it has two big
advantages over JSON:

1. You can add comments
2. You can define variables (with YAML "anchors") to factor out common configs

### Variables

You can define any common variables in the `vars` section, then refer to them
elsewhere.  For example:

```yaml
vars:
  # Generates an "anchor" with the given name.  Later, you can inject the
  # contents of the variable with "*name".
  firefox_config: &firefox_config
    moz:firefoxOptions:
      # Override Firefox default preferences in the temporary profile created
      # for each test run.
      prefs:
        # Overrides Selenium's explicit default setting, to allow Firefox to
        # install the Widevine CDM on demand.
        media.gmp-manager.updateEnabled: true
        # Overrides Firefox's Linux-specific default setting to disable DRM.
        media.eme.enabled: true

# These three browser definitions share the same config from above.
FirefoxMac:
  browser: firefox
  os: Mac
  extra_configs:
    - *firefox_config

FirefoxWindows:
  browser: firefox
  os: Windows
  extra_configs:
    - *firefox_config

FirefoxLinux:
  browser: firefox
  os: Linux
  extra_configs:
    - *firefox_config
```

### Browsers

Each top-level key in the config file (except for `vars`) is the name of a
browser made available to Karma.  Within each of those keys are the following:

 - `browser`: The name of the browser.  This is case-sensitive, and must match
       the string and case used by Selenium.
 - `os` (optional): The name of the OS.  This is case-INsensitive, and must
       match the name of the platform as used by Selenium.  For Generic
       WebDriver Server, this can be omitted or set to the name of the host
       platform.
 - `version` (optional): The version of the browser.  This is case-sensitive,
       and must match the string and case used in the Selenium node config.
 - `disabled` (optional): If true, this browser is disabled and will not be
       used unless explicitly requested.
 - `extra_configs` (optional): An array of dictionaries of extra configs which
       will be merged with the WebDriver launcher config in Karma.

Examples of basic desktop browsers definitions:

```yaml
ChromeMac:
  browser: chrome
  os: Mac

FirefoxMac:
  browser: firefox
  os: Mac

Safari:
  browser: safari
  os: Mac

SafariTP:
  browser: safari
  os: Mac
  extra_configs:
    - safari.options:
        technologyPreview: true

ChromeWindows:
  browser: chrome
  os: Windows

FirefoxWindows:
  browser: firefox
  os: Windows

Edge:
  browser: msedge
  os: Windows

ChromeLinux:
  browser: chrome
  os: Linux

FirefoxLinux:
  browser: firefox
  os: Linux
```

### Composing configs

You can define variables for browser configs that can be composed together in
`extra_configs`.  For example, below you will see some basic definitions for
Chrome arguments and parameters, and then an additional config with an argument
that is only needed for some platforms.  `karma.conf.js` will merge those
argument lists intelligently when it loads the YAML config.

```yaml
vars:
  basic_chrome_config: &basic_chrome_config
    goog:chromeOptions:
      args:
        # Normally, Chrome disallows autoplaying videos in many cases.  Enable
        # it for testing.
        - "--autoplay-policy=no-user-gesture-required"

      # Instruct chromedriver not to disable component updater.
      excludeSwitches:
        - "disable-component-update"

  headless_chrome_config: &headless_chrome_config
    goog:chromeOptions:
      args:
        # Run in headless mode.
        - "--headless"

ChromeLinux:
  browser: chrome
  os: Mac
  extra_configs:
    - *basic_chrome_config

ChromeWindows:
  browser: chrome
  os: Mac
  extra_configs:
    - *basic_chrome_config

ChromeMac:
  browser: chrome
  os: Mac
  # Take the parameters and arguments for basic_chrome_config, then append the
  # arguments for headless_chrome_config.
  extra_configs:
    - *basic_chrome_config
    - *headless_chrome_config
```
