#!/bin/bash

dir=$(dirname "$BASH_SOURCE")/..

set -e
"$dir"/build/test.py "$@"
