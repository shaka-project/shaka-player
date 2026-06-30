# Shaka Player Demo - Appspot Compatibility Shim
# Copyright 2016 Google LLC
# SPDX-License-Identifier: Apache-2.0

# The hosted demo on App Engine has been shut down.  This service is now just a
# best-effort compatibility shim: it inspects the requested host and path and
# forwards old appspot URLs to their equivalents on GitHub Pages.
#
# This deployment is the *default* version/service for the shaka-player-demo
# project, so App Engine routes requests for every now-deleted version subdomain
# (nightly-dot-, support-dot-, v2-4-7-dot-, ...) here, preserving the original
# Host header.  We branch on that Host header plus the path to decide where to
# send each request.
#
# Hash fragments (e.g. /demo/#asset=...) are never sent to the server, so the
# /demo/ paths can't be redirected at the HTTP level.  Those render an
# interstitial page whose JavaScript reads the hash, translates any outdated
# parameters into the current format, and forwards the user on.

from flask import Flask, redirect, render_template, request


app = Flask(__name__)


# GitHub Pages targets.  Docs, support, and posters only exist on the main site.
MAIN_SITE = 'https://shaka-project.github.io/shaka-player/'
RELEASE_SITE = 'https://shaka-project.github.io/shaka-player-release/'
DOCS_API = MAIN_SITE + 'docs/api/'
SUPPORT = MAIN_SITE + 'support.html'
POSTER = MAIN_SITE + 'demo/poster.png'
AUDIO_POSTER = MAIN_SITE + 'demo/poster-audio.gif'

# The old demo fetched this for clock sync.  Akamai's endpoint sends permissive
# CORS headers, which is why it was chosen as the in-app replacement, so it is
# safe to forward old cross-origin XHRs there via a redirect.
TIME = 'https://time.akamai.com/?ms&iso'

# A handful of archived version subdomains linked to an upgrade tutorial that
# has since been split and renamed per version range.  Map those specific links
# to their new homes; anything else under /docs/api/ falls through to the
# generic docs forward below.
UPGRADE_TUTORIALS = {
    'v2-4-7': DOCS_API + 'tutorial-upgrade-old-to-24.html',
    'v2-5-23': DOCS_API + 'tutorial-upgrade-24-to-25.html',
    'v3-0-15': DOCS_API + 'tutorial-upgrade-25-to-30.html',
}


def version_prefix(host):
  """Return the archived-version subdomain prefix (e.g. 'v2-4-7'), or None."""
  suffix = '-dot-shaka-player-demo.appspot.com'
  if host.endswith(suffix):
    label = host[:-len(suffix)]
    if label.startswith('v'):
      return label
  return None


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def compat(path):
  host = request.host.split(':')[0].lower()
  path = '/' + path

  # The nightly subdomain mirrored the main branch; everything else (including
  # the bare domain) maps to the latest release.
  site = MAIN_SITE if host.startswith('nightly-dot-') else RELEASE_SITE

  # Static assets that old demo builds still try to load.
  if path == '/assets/poster.jpg':
    return redirect(POSTER, code=302)
  if path == '/assets/audioOnly.gif':
    return redirect(AUDIO_POSTER, code=302)
  if path == '/time.txt':
    return redirect(TIME, code=302)

  # Documentation.
  if path == '/docs/api/tutorial-upgrade.html':
    target = UPGRADE_TUTORIALS.get(version_prefix(host))
    if target:
      return redirect(target, code=302)
  if path.startswith('/docs/api/'):
    return redirect(DOCS_API + path[len('/docs/api/'):], code=302)

  # The support page had a subdomain-base redirect that we carry forward here.
  if host.startswith('support-dot-'):
    return redirect(SUPPORT, code=302)

  # The demo itself, which lives under /demo/ on the new sites too.  Hash params
  # can only be translated client-side, so render the interstitial and let its
  # JavaScript append the translated fragment to this target.  We must point
  # straight at /demo/ rather than the site root, whose own redirect to /demo/
  # would drop the fragment we just translated.
  if path in ('/demo/', '/demo/index.html'):
    return render_template('interstitial.html', target=site + 'demo/')

  # Everything else: forward to the same path on the appropriate demo site, so
  # direct requests for a library file, image, etc. land on their equivalent.
  # The bare domain reduces to the site root, which is the demo's new home.
  return redirect(site + path.lstrip('/'), code=302)
