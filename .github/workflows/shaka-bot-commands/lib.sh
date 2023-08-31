# Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Utilities for handling @shaka-bot commands.

# Ignore case in all string comparisons.
shopt -s nocasematch

function check_required_variable() {
  local VAR_NAME="$1"

  # The ! syntax here is Bash variable indirection.
  if [[ -z "${!VAR_NAME}" ]]; then
    echo "Missing environment variable: $VAR_NAME"
    exit 1
  fi
}

# Leaving a comment requires a token with "repo" scope.
function reply() {
  echo "@$COMMENTER: $@" | \
      gh issue comment "$PR_NUMBER" -R "$THIS_REPO" -F -
}

# Leaving a comment requires a token with "repo" scope.
function reply_from_pipe() {
  (echo -n "@$COMMENTER: "; cat /dev/stdin) | \
      gh issue comment "$PR_NUMBER" -R "$THIS_REPO" -F -
}

# Checking permissions requires a token with "repo" and "org:read" scopes, and
# write access.
function check_permissions() {
  # Check permissions: this API call fails if the commenter has no special
  # permissions on the repo.
  gh api "/repos/$THIS_REPO/collaborators/$COMMENTER"
}

# Starting a workflow requires a token with "repo" scope and write access.
function start_workflow() {
  local WORKFLOW="$1"
  shift
  gh workflow run "$WORKFLOW" -R "$THIS_REPO" "$@"
}

function parse_command() {
  # Tokenize the comment by whitespace.
  local TOKENS=( $COMMENT_BODY )

  local INDEX
  for ((INDEX=0; INDEX < ${#TOKENS[@]}; INDEX++)); do
    if [[ "${TOKENS[i]}" == "@shaka-bot" ]]; then
      echo "${TOKENS[i+1]}"
      return 0
    fi
  done

  return 1
}
