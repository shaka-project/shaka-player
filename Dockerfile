FROM alpine:edge

RUN apk update && apk add nodejs npm python3 git openjdk8
