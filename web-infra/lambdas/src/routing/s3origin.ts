import { CloudFrontRequest } from 'aws-lambda'

export function originPathOfHostSelection(request: CloudFrontRequest, host: string) {
    // origin-route: one s3 bucket per multiple hosts
    // just set the origin.s3.path to request Host as s3 friendly key
    if (request && request.origin && request.origin.s3) {
        // path is the hostname but without . and with /live/
        const deducedPath = "/" + host.split(".").join("-") + "/live"
        const originalBucketDomainName = request.origin.s3.domainName
        request.origin.s3.path = deducedPath
        request.headers.host[0].value = originalBucketDomainName
    }
}