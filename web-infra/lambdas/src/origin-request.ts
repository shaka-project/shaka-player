import { i0v } from './utils/lang-util'
import { originPathOfHostSelection } from './routing/s3origin'

import { CloudFrontRequestEvent } from 'aws-lambda'

export async function handler(event: CloudFrontRequestEvent) {
    const request = event.Records[0].cf.request
    try {
        const { headers } = request
        const host: string = i0v(headers['host'])

        if (host.startsWith("pr-")) {
            console.log("==== origin-request nonprod request! ===")
            console.log(JSON.stringify(request))
        }
        
        originPathOfHostSelection(request, host)

        if (host.startsWith("pr-")) {
            console.log("---=== returning request ===---")
            console.log(JSON.stringify(request))
        }
        // onwards to origin
        return request
    } catch (_err) {
        console.log("err: " + _err)
        return request
    }
}