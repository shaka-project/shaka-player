This directory contains the scripts used to build and test Shaka Player.  These
scripts can run on any platform that supports python v2.7 and JRE 7+.

* `all.py` simply runs `gendeps.py`, `check.py`, and `build.py`.  Will forward
  `--force` to `build.py`.
* `build.py` builds the compiled library.  This will fail if there are syntax
  or type errors.
* `check.py` will check all the files for style violations and will check the
  tests for type errors (but will not produce any compiled output).
* `checkversion.py` is used internally as part of our release process.
* `docs.py` will build the documentation.  The output will be in `docs/api`.
* `gendeps.py` will create `deps.js` which is required to use the uncompiled
  library.
* `shakaBuildHelpers.py` is a utility library used by these scripts.
* `stats.py` will read the compiled library and source map to get information
  about the size of the compiled library.
* `test.py` will run the unit/integration tests.

All the scripts here use two environment variables:

* `PRINT_ARGUMENTS` if set, will print the command-line to subprocesses.
* `RAUSE_INTERRUPT` if set, will raise interrupts rather than swallowing them.

```shell
$ PRINT_ARGUMENTS=1 build.py
git -C /path/to/shaka describe --tags --dirty
Compiling the library...
java -jar /path/to/shaka/third_party/closure/compiler.jar --language_in ...
```

## Configurable Build

`build.py` is used to compile the library and can also be used to produce
customized builds that contain only the features that your app requires.
`build.py` accepts an optional argument `--name` which will set the name of
the build, defaulting to `compiled`.  All other arguments are treated as
commands describing what to include in the build.  If nothing is given, it
will use `+@complete`.

A command is either an addition or a subtraction.  An addition is prefixed with
a `+`; a subtraction with a `-`.  An addition will add the JavaScript file (or
build file) to the resulting library while a subtraction will remove it.  After
the first character, there is either the path to a JavaScript file, or a `@`
followed by the name of a build file.

Build files are the files found in `build/types/`.  These files are simply a
newline separated list of commands to execute.  So if the `+@complete` command
is given, it will open the complete file and run it (which may in turn open
other build files).  Subtracting a build file will reverse all actions applied
by the given file.  So `-@networking` will remove all the networking plugins.

```shell
# Examples:
build.py +@complete
build.py +@complete -@networking
build.py --name custom +@manifests +@networking +../my_plugin.js
```

## Test

`test.py` accepts some arguments, but mostly will forward them to `karma`.  You
can run `karma start --help` to get more info about the karma test runner. If
you don't have karma installed, it will be installed by `npm install` and will
be found in `node_modules/.bin`.

`test.py` has two arguments that it handles directly.  `--force` will cause
the build to run even if there are no changes detected to the source code.
`--no-build` will not build the library even if it does not exist.  Note that
some integration tests will not run without the compiled library present.

There are also several custom arguments that are handled in JavaScript by
`karma.conf.js` or the tests themselves (via `shaka.test.Util.getClientArg`).
These arguments can be passed in using `test.py` or using `karma start`
directly:
* `--quick` will only run unit tests, skipping integration tests.
* `--enable-logging` will enable console logging.  Logs will be printed to
  the console.  It also accepts a value for the log level `--enable-logging=1`,
  defaulting to 3.  See [lib/debug/log.js][] for the log levels (you must
  pass the number).
* `--external` will run integration tests against external assets.  This will
  take an extremely long time to run, and requires a fast and reliable internet
  connection.
* `--uncompiled` will run integration tests using the uncompiled library instead
  of the compiled version.

The `karma` argument `--browsers` will set the browsers used to run the tests
(e.g. `--browsers Chrome,Firefox`).  If you don't pass any arguments, `test.py`
will choose a defaults based on your platform.  However, if you pass any
arguments to `test.py`, it will not choose browsers and you *must* pass
`--browsers`.

[lib/debug/log.js]: https://github.com/google/shaka-player/blob/master/lib/debug/log.js

## Stats

`stats.py` is used to print various stats about the compiled library.  This is
used internally to determine dependencies and to determine the size of the
compiled library.

Before running the script, you have to compile it first.  Then you need to pass
either the name of the build (e.g. `compiled`) or the path to the `.map` file.
You will also need to pass some arguments to determine the output you want.
You must pass exactly one of the following:

* `-c` or `--class-deps` will print dependencies between classes.
* `-f` or `--function-deps` will print dependencies between functions.
* `-s` or `--function-sizes` will print the compiled size of the functions.
* `-t` or `--all-tokens` will print all the tokens in the source map.

For `--class-deps` and `--function-deps` you can also output in DOT format.
This format can be used to produce visual graphs of the dependencies.  Passing
in `-d` or `--dot-format` will output in DOT format.  Then the output can be
piped into another program to produce the output.  For example using `graphviz`:

```shell
stats.py -c -d | fdb -Goverlap=prism | neato -n2 -Tsvg > out.svg
```
