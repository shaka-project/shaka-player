# Alpine was chosen by providing a node container less than 100mb
FROM node:17.7.1-alpine3.15

WORKDIR /usr/src/app

# Install dependencies
RUN apk add --update --no-cache openssh git python3 openjdk11-jre-headless
RUN ln -sf python3 /usr/bin/python

# Change to non-root user
USER node

# Prevent proxy timeout error (very slow connections)
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm config rm proxy
RUN npm config rm https-proxy

# Run compilation
CMD [ "python", "build/all.py" ]
