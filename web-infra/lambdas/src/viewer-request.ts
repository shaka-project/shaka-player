import { CloudFrontResponseEvent } from 'aws-lambda'

export async function handler(event: CloudFrontResponseEvent) {
    return event.Records[0].cf.request
}