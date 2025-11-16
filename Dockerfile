FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code /app/pkg
WORKDIR /app/code

# renovate: datasource=github-releases depName=NodeBB/NodeBB versioning=semver extractVersion=^v(?<version>.+)$
ARG NODEBB_VERSION=4.6.1

RUN curl -L https://github.com/NodeBB/NodeBB/archive/v${NODEBB_VERSION}.tar.gz | tar -xz --strip-components 1 -f -
RUN cp /app/code/install/package.json /app/code/package.json
RUN npm install --omit=dev

# only package.json is preserved because nodebb doesn't seem to use lock files
RUN mv /app/code/package.json /app/code/package.json.copy && ln -s /app/data/package.json /app/code/package.json && \
    mv /app/code/package-lock.json /app/code/package-lock.json.copy && ln -s /app/data/package-lock.json /app/code/package-lock.json && \
    mv /app/code/public/uploads /app/code/public/uploads.template && ln -s /app/data/public/uploads /app/code/public/uploads && \
	rm -rf /app/code/logs && ln -sf /run/nodebb/logs /app/code/logs && \
	ln -s /run/nodebb/config.json /app/code/config.json

COPY config.json.template start.sh /app/pkg/

CMD [ "/app/pkg/start.sh" ]
