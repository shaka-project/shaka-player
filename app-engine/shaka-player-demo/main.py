# Shaka Player Demo - Appspot Entrypoint
# Copyright 2022 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Most of the app is served as static content.  Any exceptions go here.

import datetime
import os

from flask import Flask, make_response, redirect, request, send_file


app = Flask(__name__)


# Redirect root requests to /demo.
@app.route('/')
def root():
  return redirect('/demo/', code=302)


# A Doodle-like service to change the poster on certain days.
# All posters are chosen based on the current date in PST.

from posters import VIDEO_POSTERS, VIDEO_DEFAULT, AUDIO_POSTERS, AUDIO_DEFAULT


# Timezone info for PST.
# I'm ignoring DST to avoid complicating the code.
class PST(datetime.tzinfo):
  def utcoffset(self, dt):
    return datetime.timedelta(hours=-8)

  def dst(self, dt):
    return datetime.timedelta(0)

  def tzname(self, dt):
    return 'PST'


def get_poster(poster_map, default_poster):
  now = datetime.datetime.now(PST())
  today = (now.month, now.day)
  today_with_year = (now.month, now.day, now.year)
  midnight = datetime.datetime(now.year, now.month, now.day, tzinfo=PST())
  local_expiration = midnight + datetime.timedelta(days=1)
  max_age = (local_expiration - now).total_seconds()

  # For internal debugging and testing of the poster service, we can override
  # the date.  To set an override, open /assets/poster.jpg and run this in the
  # JS console:
  #   document.cookie="posterdate=10-31"
  # To clear an override, run:
  #   document.cookie="posterdate="
  override = request.cookies.get('posterdate')
  if override:
    override_tuple = [int(x) for x in override.split('-')]
    print('Date override:', repr(override_tuple))

    if len(override_tuple) == 3:
      # Override includes year.
      today_with_year = tuple(override_tuple)
      today = tuple(override_tuple[0:2])
    elif len(override_tuple) == 2:
      # Override does not include year, so add the current year.
      today_with_year = tuple(override_tuple + [now.year])
      today = tuple(override_tuple)
    else:
      # Bad override format.  Ignore the year, but add a response header to
      # indicate that the override failed.  For internal debugging of the
      # poster service.
      print('Bad date override:', override, file=sys.stderr)

  # Prefer a poster for this specific year.
  name = poster_map.get(today_with_year, poster_map.get(today, default_poster))
  path = 'posters/%s' % name

  response = make_response(
      send_file(path, last_modified=midnight, max_age=max_age))

  response.headers['Access-Control-Allow-Origin'] = '*'
  response.headers['Access-Control-Allow-Headers'] = 'If-Modified-Since,Range'
  response.headers['Access-Control-Expose-Headers'] = 'Date'
  response.headers['Access-Control-Max-Age'] = '2592000'

  return response


@app.route('/assets/poster.jpg')
def get_video_poster():
  return get_poster(VIDEO_POSTERS, VIDEO_DEFAULT)

@app.route('/assets/audioOnly.gif')
def get_audio_poster():
  return get_poster(AUDIO_POSTERS, AUDIO_DEFAULT)
