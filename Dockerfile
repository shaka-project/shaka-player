FROM alpine:edge

RUN apk update && apk add nodejs npm python2 git openjdk8
