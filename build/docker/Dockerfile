# Alpine was chosen by providing a node container less than 100mb
FROM node:17.7.1-alpine3.15

WORKDIR /usr/src/app

# install dependencies
RUN apk add --update --no-cache openssh git python3 openjdk11-jre-headless
RUN ln -sf python3 /usr/bin/python

# Change to non-root user
USER node

# Python user's setup
RUN mkdir -p /home/node/.local/bin
ENV PATH="$PATH:/home/node/.local/bin"
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

# Prevent proxy timeout error (very slow connections)
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm config rm proxy
RUN npm config rm https-proxy

# Run compilation
CMD [ "python", "build/all.py" ]
