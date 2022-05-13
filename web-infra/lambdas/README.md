
# Lambda Edge repo

Being sub of web-infra/ causes it to be packaged and deployed with cdk as part of disco-bucket

## Building

```
npm run build
```

Also see build.sh
Output is build/origin-request.zip for example

## Deploying

```
npm run build
```

See the github workflow file which uses aws cli to sync to s3 bucket.

### Invalidate cache patterns

Write a file with one line patterns `like /js/*`
`npm run cloudfront:invalidateCaches`

You can put this in your github workflow to happen when a release of new functions or website happens.


