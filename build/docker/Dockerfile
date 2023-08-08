# Build with:
#   docker build -t shaka-player-build /path/to/shaka-player/build/docker
# Run with:
#   docker run -v /path/to/shaka-player:/usr/src --user $(id -u):$(id -g) shaka-player-build
# Run tests with:
#   docker run -v /path/to/shaka-player:/usr/src --user $(id -u):$(id -g) shaka-player-build python3 build/test.py --quick --browsers ChromeHeadless

FROM alpine:3.18

# Install dependencies
RUN apk add --update --no-cache \
  bash chromium chromium-chromedriver git nodejs npm openjdk11-jre-headless python3

WORKDIR /usr/src
ENV HOME /tmp
ENV CHROMEDRIVER_PATH /usr/bin/chromedriver

CMD ["python3", "build/all.py"]
