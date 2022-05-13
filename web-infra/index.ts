#!/usr/bin/env node
import * as cdk from '@aws-cdk/core'
import { DiscoBucketSite, DiscoBucketProps } from './disco-bucket/package/disco-bucket'
import { CacheCookieBehavior, CacheHeaderBehavior, CachePolicy, CacheQueryStringBehavior } from '@aws-cdk/aws-cloudfront';

// see preinstall.sh for fetching the disco-bucket module
// since no dedicated npm registry exists yet

class ShakaPlayerStack extends cdk.Stack {
    constructor(parent: cdk.App, siteName: string, stair: string, props: cdk.StackProps) {
        super(parent, siteName, props);

        // putting these in cdk.context.json makes it easier to parse it out from a github workflow
        const siteContextProps = this.node.tryGetContext(stair)

        // use most optimized cache policy
        const cachePolicy = new CachePolicy(this, "ShakaPlayerCachePolicy", {
            queryStringBehavior: CacheQueryStringBehavior.all(),
            enableAcceptEncodingGzip: true,
            cookieBehavior: CacheCookieBehavior.none(),
            headerBehavior: CacheHeaderBehavior.allowList("Host", "CloudFront-Viewer-Country"),
        })
        
        const siteDiscoProps: DiscoBucketProps = {
            accountId: props.env?.account || "0101",
            phase: stair,
            hostedZoneName: siteContextProps.hostedZoneName,
            domainName: siteName,
            github: {
                organization: siteContextProps.github.organization,
                repository: siteContextProps.github.repository
            },
            distribution: {
                CachePolicy: cachePolicy
            },
            pagerdutyKey: siteContextProps.pagerdutyKey,
            useWildCardCert: true
            // can attach own cacheHeaderBehaviour of the CDN and other such things here
        };

        // provided props...or override any default settings of cdn or s3 bucket by pasing your own in it
        const site = new DiscoBucketSite(this, siteName, siteDiscoProps)
    }
}

const app = new cdk.App();

// the callers, workflow cdk should pass in cdk -c phase=ENVIRONMENT or like that
// the cdk needs to know is it dev prod or test and needs something
// since global names like s3 buckets would otherwise conflict

const stair = app.node.tryGetContext("phase") || 'dev'
const siteContextProps = app.node.tryGetContext(stair)

const commonTags = app.node.tryGetContext("commonTags")

// could make two stacks to make the gha workflow / cdk pipeline select which stack to deploy
// site name is dev-asite (like dev-dplus dev-roku prod-roku etc)
new ShakaPlayerStack(app, siteContextProps.siteName , stair, {
    // caller decides aws accountId
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
    tags: {
        ...commonTags,
        "Environment": stair,
        "omd_environment": stair
    }
});

app.synth();
