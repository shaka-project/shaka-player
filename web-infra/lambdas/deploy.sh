#!/bin/bash
set -o errexit
[ -d ./build ] || { echo "No build? You have to run npm install and npm run edge:build" ; exit 2 }

cd build
aws s3 cp {origin,viewer}-{request,response}*zip s3://lambdas-dev-dplus-web-waas-disco-api-com/
cd -
