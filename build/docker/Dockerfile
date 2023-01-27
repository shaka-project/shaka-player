# Build with:
#   docker build -t shaka-player-build /path/to/shaka-player/build/docker
# Run with:
#   docker run -v /path/to/shaka-player:/usr/src --user $(id -u):$(id -g) shaka-player-build

FROM alpine:3.14

# Install dependencies
RUN apk add --update --no-cache \
  bash git nodejs npm openjdk11-jre-headless python3

WORKDIR /usr/src
ENV HOME /tmp

CMD ["python3", "build/all.py"]
