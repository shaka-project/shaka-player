FROM debian:bullseye

RUN apt update && apt -y upgrade && \
    apt-get -y install curl && \
    curl -sL https://deb.nodesource.com/setup_14.x | bash - && \
    apt-get -y install nodejs python2.7 git && \
    ln -s /usr/bin/python2.7 /usr/bin/python
