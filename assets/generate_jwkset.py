#!/usr/bin/env python
#
# Copyright 2014 Google Inc.
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

import base64
import binascii
import sys

#TEST_KEY_ID = "0123456789012345"
#TEST_KEY = "ebdd62f16814d27b68ef122afce4ae3c"

key_id = base64.b64encode(sys.argv[1]).rstrip("=")
key = base64.b64encode(binascii.unhexlify(sys.argv[2])).rstrip("=")

jwk = '{"kty":"oct","alg":"A128KW","kid":"%s","k":"%s"}' % (key_id, key)
jwk_set = '{"keys":[%s]}' % jwk
sys.stdout.write(jwk_set)
