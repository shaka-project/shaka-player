import { CloudFrontResponseEvent } from 'aws-lambda'
import { i0v } from './utils/lang-util'

/**
 * The main point of business is to perform cache invalidation
 * 
 * @param event the lambda edge event parameter
 * @param config the configuration object
 * @param clientId the client id
 * @param envId the environment id
 */
export async function handler(event: CloudFrontResponseEvent) {
    const response = event.Records[0].cf.response
    const request = event.Records[0].cf.request;
    try {
        const { headers } = response
        const host: string = i0v(headers['host'])
        const headerCacheControl = 'Cache-Control'
        const nonProdTImeToLive = 60 * 5; // 5 minutes
        const indexTimeToLive = 60 * 30; // 30 min

        // all index.html have low cache, the lower the higher s3 costs
        // should be low enough but too high can lead to users/clients
        // getting old or broken version too long
        if (request.uri.endsWith("index.html")) {
            headers[headerCacheControl.toLowerCase()] = [{
                key: headerCacheControl,
                value: `public, max-age=${indexTimeToLive}`,
            }]
        }

        if (host.startsWith("pr-")) {
            console.log("==== viewer-response response! ===")
            console.log(JSON.stringify(response))

            // Set the cache-control header for OK statuses
            // pr- have very low cache-time, so that devs dont need to wait too long on
            // PR commits being visible, since pr- domains do not have high traffic
            if (response.status === '200') {
                headers[headerCacheControl.toLowerCase()] = [{
                    key: headerCacheControl,
                    value: `public, max-age=${nonProdTImeToLive}`,
                }];
            }
        }
    } catch (_err) {
        console.log("err: " + _err)
        return response
    }
    return event.Records[0].cf.response;
}
