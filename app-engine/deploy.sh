#!/bin/bash

# Stop on error
set -e
# Print commands
set -x

# Go to this directory
cd "$(dirname "$0")"

# Deploy compatibility shim
gcloud app deploy shaka-player-demo/app.yaml --project=shaka-player-demo --version=compat --promote --quiet
