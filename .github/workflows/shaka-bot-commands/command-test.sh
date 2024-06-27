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

# The test command implementation.
# Assumes that lib.sh has been loaded and all required variables are set.

if ! check_permissions; then
  reply "Only maintainers may start lab tests."
  exit 0
fi

# These are passed to the lab testing workflow.
WORKFLOW_ARGS=( "pr=$PR_NUMBER" )

case "${SHAKA_BOT_ARGUMENTS[0]}" in
  # CE devices only.
  ce) WORKFLOW_ARGS+=( "browser_filter=Tizen ChromecastUltra ChromecastGTV ChromeAndroid" ) ;;

  # No command argument, no extra workflow arguments.
  "") ;;

  *)
    reply "Unrecognized test argument: ${SHAKA_BOT_ARGUMENTS[0]}"
    exit 1
    ;;
esac

if start_workflow selenium-lab-tests.yaml "${WORKFLOW_ARGS[@]}"; then
  (
    echo "Lab tests started with arguments:"
    for arg in "${WORKFLOW_ARGS[@]}"; do
      echo " - \`$arg\`"
    done
  ) | reply_from_pipe
else
  (
    echo "I failed to start the lab test workflow."
    echo ""
    echo "Please check GitHub Actions logs for details."
  ) | reply_from_pipe

  # Fail this workflow to make it easier to find the right run
  # and its logs.
  exit 1
fi
