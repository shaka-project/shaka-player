/* eslint-disable camelcase */
const fs = require('fs');
const path = require('path');
const shakaBuildHelpers = require('./shakaBuildHelpers');

/** Gets the version of the library from the CHANGELOG.  */
function changelog_version() {
  const content = fs.readFileSync(
      path.join(
          shakaBuildHelpers.get_source_base(),
          'CHANGELOG.md',
      ),
  );

  const match = /^###? \[(.*?)\]\(/m.exec(content);
  return match ? match[1] : '';
}

/** Gets the version of the library from player.js. */
function player_version() {
  const content = fs.readFileSync(
      path.join(
          shakaBuildHelpers.get_source_base(),
          'lib',
          'player.js',
      ),
  );
  const match = /shaka\.Player\.version = '(.*)'/.exec(content);
  return match ? match[1]: '';
}

/** main */
async function main(logger) {
  const changelog = changelog_version();
  const player = player_version();
  const git = await shakaBuildHelpers.git_version();
  const npm = await shakaBuildHelpers.npm_version();
  console.log('git version: ', git);
  console.log('npm version: ', npm);
  console.log('player version: ', player);
  console.log('changelog version: ', changelog);

  let ret = 0;
  if (git.includes('dirty')) {
    logger.error('Git version is dirty.');
    ret = 1;
  } else if (git.includes('unknown')) {
    logger.error('Git version is not a tag.');
    ret = 1;
  } else if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9]+)?$/.exec(git)) {
    logger.error('Git version is a malformed release version.');
    logger.error('It should be a \'v\', followed by three numbers');
    logger.error('separated by dots, optionally followed by a hyphen');
    logger.error('and a pre-release identifier.  See http://semver.org/');
    ret = 1;
  }

  if ('v' + npm !== git) {
    logger.error('NPM version does not match git version.');
    ret = 1;
  }

  if (player !== git + '-uncompiled') {
    logger.error('Player version does not match git version.');
    ret = 1;
  }
  if ('v' + changelog != git) {
    logger.error('Changelog version does not match git version.');
    ret = 1;
  }

  return ret;
}

if (require.main == module) {
  shakaBuildHelpers.run_main(main);
}
