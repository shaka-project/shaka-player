#!/bin/bash
set -o errexit
rm -rf disco-bucket || true
mkdir -p disco-bucket || true
fileName="disco-bucket-3.14.2-2318149262-4563b27d29861cd1648dc1e76037adfec74cd316.tgz"
curl -H "X-JFrog-Art-Api:$JFROG_TOKEN" \
	"https://discovery.jfrog.io/artifactory/generic-local/disco-bucket/$fileName" \
	-o "disco-bucket/$fileName"
cd disco-bucket
ls -latr 
file "$fileName" || true
tar -xf "$fileName"
