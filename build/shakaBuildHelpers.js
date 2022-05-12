/* eslint-disable camelcase */
/* eslint-disable consistent-return */
const fs = require('fs');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);


/** */
function get_source_base() {
  return path.resolve(__dirname, '..');
}

/** Gets the version of the library from git. */
async function git_version() {
  // Check if the shaka-player source base directory has '.git' file.
  const git_path = path.join(get_source_base(), '.git');
  if (!fs.existsSync(git_path)) {
    throw Error('no .git file is in the shaka-player repository.');
  }
  const cmd_line = [
    'git', '-C', get_source_base(), 'describe', '--tags', '--dirty',
  ];
  try {
    const {stdout} = await exec(cmd_line.join(' '));
    return stdout.trim();
  } catch (_) {
    throw Error('Unable to determine library version!');
  }
}

/** Gets the version of the library from NPM. */
async function npm_version(is_dirty=false) {
  const cmd_line = ['npm', '--prefix', get_source_base(), 'ls', 'shaka-player'];
  try {
    await exec(cmd_line.join(' '));
  } catch (e) {
    const match = /shaka-player@(.*) /.exec(e.stdout);
    if (match) {
      return match[1] + (is_dirty ? '-npm-dirty' : '');
    }
    throw Error('Unable to determine library version!');
  }
}

/** run main with logger */
function run_main(main) {
  main({
    error: (message) => console.error('[ERROR]', message),
  });
}

module.exports = {
  get_source_base,
  git_version,
  npm_version,
  run_main,
};
