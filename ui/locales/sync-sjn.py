#!/usr/bin/env python3
#
# Copyright 2024 Google LLC
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

"""Sync sjn translations from sjn-translations.yaml to sjn.json

sjn-translations.yaml tracks the original strings, their nearest translatable
equivalents, the romanized Sindarin, and the Tengwar-encoded Sindarin.  All
translation work for sjn happens there, and this script updates sjn.json
accordingly.
"""

import json
import os
import yaml

base_path = os.path.dirname(__file__)
source_path = os.path.join(base_path, "sjn-translations.yaml")
destination_path = os.path.join(base_path, "sjn.json")

with open(source_path) as f:
  source = yaml.safe_load(f)

destination = {}
for item in source["translations"]:
  destination[item["key"]] = item["sjn"]

with open(destination_path, "w") as f:
  f.write(json.dumps(destination, ensure_ascii=False, indent=2) + '\n')
