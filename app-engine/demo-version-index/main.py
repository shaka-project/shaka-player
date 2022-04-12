# Shaka Player Version Index - Appspot Entrypoint
# Copyright 2022 Google LLC
# SPDX-License-Identifier: Apache-2.0

# In the App Engine Python 3 runtime, you must have an entrypoint, even if all
# content is static and no routes are defined.  This seems pretty weird, and
# wasn't required in the Python 2 runtime.

from flask import Flask

app = Flask(__name__)
