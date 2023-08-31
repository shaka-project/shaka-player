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

# Handle @shaka-bot commands commented on PRs.

# Run everything from the folder in which this script lives.
cd "$(dirname "$0")"

# Load utils.
. lib.sh

# Check required environment variables passed from the workflow.
# If running this manually while testing changes, supply these.
check_required_variable GH_TOKEN      # With repo & org:read scope, write access
check_required_variable THIS_REPO     # like shaka-project/shaka-player
check_required_variable COMMENTER     # like joeyparrish
check_required_variable PR_NUMBER     # like 1234
check_required_variable COMMENT_BODY  # like "@shaka-bot howdy"

if [[ "$COMMENTER" == "shaka-bot" ]]; then
  # Exclude comments by shaka-bot, who will sometimes use its own name.
  exit 0
fi

# Parse the command.  Outputs to globals SHAKA_BOT_COMMAND and
# SHAKA_BOT_ARGUMENTS (array).
parse_command

if [[ "$SHAKA_BOT_COMMAND" == "" ]]; then
  # No command found.
  exit 0
fi

echo "PR $PR_NUMBER, detected command $SHAKA_BOT_COMMAND"

case "$SHAKA_BOT_COMMAND" in
  help) . command-help.sh ;;
  test) . command-test.sh ;;
  *) echo "Unknown command!" ;;
esac
