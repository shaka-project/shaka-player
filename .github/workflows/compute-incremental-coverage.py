#!/usr/bin/env python3
#
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

import argparse
import io
import json
import os
import re
import subprocess
import zipfile

# TODO(joeyparrish): Figure out how to get karma to output relative paths only.
def StripGitDir(path):
  # Convert Windows-style paths to Unix-style paths so we can read coverage
  # data from Windows runners, too.
  path = path.replace('\\', '/')
  # Strip the path to the git clone, leaving only the source path within the
  # repo.
  return re.sub(r'.*?/(lib|ui)/', r'\1/', path)

def RunCommand(args, text=True):
  proc = subprocess.run(args, capture_output=True, text=text)
  if proc.returncode != 0:
    raise RuntimeError("Command failed:", args, proc.stdout, proc.stderr)
  return proc.stdout

def GitHubApi(repo, path, text=True):
  args = ["gh", "api", "/repos/%s/%s" % (repo, path)]
  output = RunCommand(args, text)
  if text:
    return json.loads(output)
  else:
    return output

def GetCoverageArtifacts(repo, run_id):
  # Fetch all artifacts from this run ID.
  api_path = "actions/runs/%s/artifacts" % run_id
  results = GitHubApi(repo, api_path)["artifacts"]
  # Get the one that is named "coverage" (should be the only one).
  artifact = list(filter(lambda x: x["name"] == "coverage", results))[0]

  # Fetch and open the zip file containing the artifacts.
  api_path = "actions/artifacts/%s/zip" % artifact["id"]
  zip_data = GitHubApi(repo, api_path, text=False)
  return zipfile.ZipFile(io.BytesIO(zip_data), 'r')

def CoverageLines(coverage_range):
  start_line = coverage_range["start"]["line"]
  end_line = coverage_range["end"]["line"]

  lines = set()
  for line in range(start_line, end_line + 1):
    lines.add(line)
  return lines

class CoverageDetails(object):
  def __init__(self, file_data):
    json_data = json.loads(file_data)

    self.files = {}

    # The structure is something like:
    # {
    #   "/path/to/lib/player.js": {
    #     "statementMap": { ... },
    #     "fnMap": { ... },
    #     "s": { ... }
    #   }
    # }
    for path, path_data in json_data.items():
      path = StripGitDir(path)

      statement_to_lines = {}
      instrumented_lines = set()

      # The function map is a structure to map where each function is in a
      # source file:
      # {
      #   "0": {
      #     "loc": {
      #       "start": {
      #         "line": 7,
      #         "column": 0
      #       },
      #       "end": {
      #         "line": 8,
      #         "column": 29
      #       }
      #     }
      #   },
      #   ...
      # }
      # We extract function locations and remove them from statement spans
      # below, so that we don't count (for example) class declaration statements
      # as containing all the lines of every method in the class.
      function_locations = []
      for key, value in path_data["fnMap"].items():
        lines = CoverageLines(value["loc"])
        function_locations.append(lines)

      # The statement map is a structure to map where each statement is in a
      # source file:
      # {
      #   "0": {
      #     "start": {
      #       "line": 7,
      #       "column": 0
      #     },
      #     "end": {
      #       "line": 8,
      #       "column": 29
      #     }
      #   },
      #   ...
      # }
      for key, value in path_data["statementMap"].items():
        # All the lines of the statement, which may include other functions or
        # statements.
        lines = CoverageLines(value)

        # Subtract from that the lines of any function that is a subset of
        # these lines.  By excluding entire methods before adding back their
        # child statements, we exclude empty lines in class methods.
        for function_lines in function_locations:
          if function_lines < lines:  # strict subset
            lines -= function_lines  # set subtraction

        # If this statement is inside the range of another statement, remove
        # this inner range from that outer one.  This is important because loops
        # and conditional statements contain their inner branches.
        for older_key, older_lines in statement_to_lines.items():
          # Check for a proper subset (lines contains all elements of
          # child_lines, but child_lines is not an equal set).
          if lines < older_lines:  # strict subset
            statement_to_lines[older_key] -= lines  # set subtraction

        statement_to_lines[key] = lines

      # Whatever is left in any statement, we count as instrumented.
      for key, lines in statement_to_lines.items():
        for line in lines:
          instrumented_lines.add(line)

      # The "s" field is a map from statement numbers to number of times
      # executed.
      executed_lines = set()
      for key, executed in path_data["s"].items():
        if executed:
          for line in statement_to_lines[key]:
            executed_lines.add(line)

      self.files[path] = {
        "instrumented": instrumented_lines,
        "executed": executed_lines,
      }

class PullRequest(object):
  def __init__(self, repo, number):
    data = GitHubApi(repo, "pulls/%d" % number)
    sha = data["merge_commit_sha"]

    self.number = number
    self.changes = {}

    files = GitHubApi(repo, "commits/%s" % sha)["files"]

    for file_data in files:
      # The patch field is missing for binary files.  Skip those.
      if "patch" not in file_data:
        continue

      filename = file_data["filename"]
      patch = file_data["patch"]

      # Parse through the unified diff in "patch" to find the touched line
      # numbers.
      touched_lines = []
      line_number = None
      for line in patch.split("\n"):
        if line[0] == "@":
          # Turns a header like "@@ -749,7 +757,19 @@ foo" into line number 757.
          # Note that the last part of the new file range could be omitted:
          # "@@ -0,0 +1 @@ foo"
          new_file_range = line.split("+")[1].split(" @@")[0]
          line_number = int(new_file_range.split(",")[0])
        elif line[0] == " ":
          line_number += 1
        elif line[0] == "+":
          touched_lines.append(line_number)
          line_number += 1

      self.changes[filename] = touched_lines

def IncrementalCoverage(pr, coverage_details):
  num_changed = 0
  num_covered = 0

  for path in pr.changes:
    if path in coverage_details.files:
      changed_lines = pr.changes[path]
      instrumented_lines = coverage_details.files[path]["instrumented"]
      executed_lines = coverage_details.files[path]["executed"]

      for line in changed_lines:
        # Only count the instrumented lines, not whitespace or comments.
        if line in instrumented_lines:
          num_changed += 1
          if line in executed_lines:
            num_covered += 1

  if num_changed == 0:
    return None
  return num_covered / num_changed

def set_output(name, value):
  path = os.environ.get("GITHUB_OUTPUT")
  if path:
    # Inside GitHub Actions, output the data to a special file GitHub provides.
    with open(path, "a") as f:
      f.write("{}={}\n".format(name, value))
  else:
    # Outside of GitHub Actions, just print the data.
    print("OUTPUT {}={}".format(name, value))

def main():
  parser = argparse.ArgumentParser(
      description="Compute incremental code coverage for a PR",
      formatter_class=argparse.ArgumentDefaultsHelpFormatter)
  parser.add_argument(
      "--repo",
      required=True,
      help="The GitHub repo, such as shaka-project/shaka-player")
  parser.add_argument(
      "--run-id",
      required=True,
      help="The workflow run ID to download coverage data from")
  args = parser.parse_args()

  artifacts = GetCoverageArtifacts(args.repo, args.run_id)
  coverage_details = CoverageDetails(artifacts.read("coverage-details.json"))
  pr_number = json.loads(artifacts.read("pr-number.json"))
  pr = PullRequest(args.repo, pr_number)
  coverage = IncrementalCoverage(pr, coverage_details)

  set_output("pr_number", str(pr_number))
  if coverage is None:
    set_output("coverage", "No instrumented code was changed.")
  else:
    set_output("coverage", "%.2f%%" % (coverage * 100.0))

if __name__ == "__main__":
  main()
