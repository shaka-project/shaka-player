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

# The help command implementation.
# Assumes that lib.sh has been loaded and all required variables are set.

# Using single quotes to avoid executing the things in backticks, which are
# really markdown.
(
  echo 'I honor the following commands from anyone:'
  echo ' - `@shaka-bot help`: Show this help message'
  echo ''
  echo 'I honor the following commands from maintainers only:'
  echo ' - `@shaka-bot test`: Start lab tests on all devices'
  echo ' - `@shaka-bot test ce`: Start lab tests on CE devices only (no desktop browsers)'
) | reply_from_pipe
