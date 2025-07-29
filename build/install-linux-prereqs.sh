#!/bin/bash

# Installs prerequisites for Shaka Player development on Linux:
#  - Git v1.9+ (to check out the code)
#  - Python v3.5+ (to run the build scripts)
#  - Java Runtime Environment v21+ (to run the Closure compiler)
#  - Apache (to serve the Shaka Player demo)
#  - NodeJS v18+ (to run some build deps, such as jsdoc, karma, etc)

# Tested on:
#  - Ubuntu 22.04 LTS (Jammy)
#  - Debian 11 (Bullseye)
#  - gLinux

# Tested with:
#  - Fresh install, no nodejs/npm
#  - Standard install of nodejs/npm
#  - Previous install/upgrade of nodejs/npm through n or nvm

# Not supported:
#  - Ubuntu 18.04 LTS (Bionic) - No extrepo to get updated Java build
#  - Debian 10 (Buster) - No extrepo to get updated Java build
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
sudo apt -y install apache2 curl extrepo git python3
sudo extrepo enable zulu-openjdk
sudo apt -y update
sudo apt -y install zulu21-jre

# NodeJS in Ubuntu and Debian is often out of date, so we may need to grab a
# newer version.  We require v18+.

if node --version 2>/dev/null | grep -q 'v\(1[8-9]\|[2-9][0-9]\)'; then
  echo "*****" 1>&2
  echo "NodeJS v18+ detected.  No update needed." 1>&2
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
      sudo apt -y remove --purge libnode || true
      sudo apt -y remove --purge libnode64 || true
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
      echo "You will need to upgrade NodeJS yourself to v18+." 1>&2
      echo "*****" 1>&2
      exit 1
    fi
  else
    echo "*****" 1>&2
    echo "NodeJS not found. We will install an up-to-date version for you." 1>&2
    echo "*****" 1>&2
  fi

  set -x
  available_node_version=$(apt-cache show nodejs \
      | grep '^Version:' | head -1 | cut -f 2 -d ' ')
  available_node_major_version=$(echo "$available_node_version" \
      | cut -f 1 -d '.')
  if [[ $available_node_major_version -lt 18 ]]; then
    # Use nodesource.com for NodeJS v18.
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs

    echo "*****" 1>&2
    echo "NodeJS v18.x installed from nodesource." 1>&2
    echo "*****" 1>&2
  else
    sudo apt -y install nodejs npm
    echo "*****" 1>&2
    echo "NodeJS v$available_node_version installed from your distro." 1>&2
    echo "*****" 1>&2
  fi
fi
