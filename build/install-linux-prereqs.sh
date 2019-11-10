#!/bin/bash

# Installs prerequisites for Shaka Player development on Linux:
#  - Git v1.9+ (to check out the code)
#  - Python v2.7 (to run the build scripts)
#  - Java Runtime Environment v8+ (to run the Closure compiler)
#  - Apache (to serve the Shaka Player demo)
#  - NodeJS v9.3 (to run some build deps, such as jsdoc, karma, etc)

# Tested on:
#  - Ubuntu 16.04 LTS (Xenial)
#  - Ubuntu 17.10 (Artful)
#  - Debian 9 (Stretch)
#  - gLinux

# Tested with:
#  - Fresh install, no nodejs/npm
#  - Standard install of nodejs/npm
#  - Previous install/upgrade of nodejs/npm through n or nvm

# Not supported:
#  - Ubuntu 14.04 LTS (Trusty) - Java 7
#  - Debian 8 (Jessie) - Java 7
#  - RHEL/CentOS 6 - python 2.6, git 1.7
#  - RHEL/CentOS 7 - git 1.8


# It's best not to run as root or with sudo, because we need to be able to
# detect node versions installed locally for the user.
if [[ $EUID == 0 ]]; then
  echo "*****" 1>&2
  echo "Please do not run as root." 1>&2
  echo "This script will use sudo when needed." 1>&2
  echo "*****" 1>&2
  exit 1
fi

# Make sure this is an OS we can support.
# "which apt" will return success if apt is found.
if ! which apt &>/dev/null; then
  echo "*****" 1>&2
  echo "Could not find apt.  Unsupported Linux distribution!" 1>&2
  echo "*****" 1>&2
  exit 1
fi

# Exit if any command fails.
set -e

# Install prerequisites other than nodejs.  These package names work for both
# Ubuntu and Debian, and may work for other derivatives as well.
echo "*****" 1>&2
echo "Updating packages and installing git, Python, JRE, and Apache." 1>&2
echo "*****" 1>&2
sudo apt -y update
sudo apt -y install git python2.7 default-jre-headless apache2

# NodeJS in Ubuntu and Debian is often out of date, so we may need to grab a
# newer version.  We require v8+.

if node --version 2>/dev/null | grep -q 'v\([89]\|1[0-9]\)'; then
  echo "*****" 1>&2
  echo "NodeJS v8+ detected.  No update needed." 1>&2
  echo "*****" 1>&2
else
  if node --version &>/dev/null; then
    echo "*****" 1>&2
    echo "Old NodeJS version detected: $(node --version)." 1>&2
    echo "A newer version is needed." 1>&2
    echo "*****" 1>&2
    read -r -p "Remove the existing version and install a new one? [Y/n] "
    if [[ $REPLY =~ ^[Yy] ]] || [[ $REPLY == "" ]]; then
      echo "*****" 1>&2
      echo "Removing existing copies of nodejs." 1>&2
      echo "*****" 1>&2

      # Remove any old packaged copy of nodejs/npm.  Some of these commands may
      # fail, for example if a package does not exist.  Ignore errors here.
      sudo apt -y remove --purge nodejs || true
      sudo apt -y remove --purge nodejs-dev || true
      sudo apt -y remove --purge npm || true
      sudo apt -y autoremove || true

      # Remove any old symlinks or other copies.
      sudo rm -f /usr/local/bin/node{,js} /usr/bin/node{,js}
      sudo rm -f /usr/local/bin/npm /usr/bin/npm

      # Remove any copies installed by "n".
      sudo rm -rf /usr/local/n
      # Remove any copies installed by "nvm".
      if [[ ! -e "$NVM_DIR" ]]; then
        NVM_DIR="$HOME/.nvm"
      fi
      # Safety check: before wiping out NVM_DIR, make sure it contains nvm.sh,
      # so we don't somehow get tricked into rm -rf /
      if [[ -e "$NVM_DIR" ]] && [[ -e "$NVM_DIR"/nvm.sh ]]; then
        rm -rf "$NVM_DIR"
        sed -i '/NVM_DIR/d' ~/.bashrc
      fi
    else
      echo "*****" 1>&2
      echo "You will need to upgrade NodeJS yourself to v8+." 1>&2
      echo "*****" 1>&2
      exit 1
    fi
  else
    echo "*****" 1>&2
    echo "NodeJS not found. We will install an up-to-date version for you." 1>&2
    echo "*****" 1>&2
  fi

  # NodeJS v9.3.0 has npm v5.5.1, which works.  Nodejs v9.4, v9.5, and v9.6 use
  # npm v5.6.0, which seems to be buggy.  So we avoid those and use v9.3.
  # See https://github.com/npm/npm/issues/19394 for details.

  # Fetch a known-good copy of NodeJS from nodesource.com and install it.
  deb_file=$(mktemp --suffix .deb)
  curl -o "$deb_file" \
    http://deb.nodesource.com/node_9.x/pool/main/n/nodejs/nodejs_9.3.0-1nodesource1_amd64.deb
  sudo dpkg -i "$deb_file"
  rm -f "$deb_file"

  echo "*****" 1>&2
  echo "NodeJS v9.3 installed." 1>&2
  echo "*****" 1>&2
fi
