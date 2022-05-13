#!/bin/bash
set -o errexit
[ -d node_modules ] || npm install
for f in src/{viewer,origin}-{request,response}.ts ; do
    baseName="$(basename "$f" | cut -f1 -d.)"
    node_modules/esbuild/bin/esbuild --bundle --minify --platform=node --target=node14 --outdir=build/"${baseName}"/ "$f"
    cd build/"${baseName}"/ ; zip ../${baseName}.zip ${baseName}.js ; cd - # package to zip step
done 
