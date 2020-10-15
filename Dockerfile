FROM alpine:3.12

RUN apk add --update nodejs npm python2 && ln -s /usr/bin/python2 /usr/bin/python
