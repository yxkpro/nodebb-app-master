#!/bin/bash

set -eu

mongo_cli="mongosh ${CLOUDRON_MONGODB_HOST}:${CLOUDRON_MONGODB_PORT}/${CLOUDRON_MONGODB_DATABASE} -u ${CLOUDRON_MONGODB_USERNAME} -p ${CLOUDRON_MONGODB_PASSWORD}"

mongosh --nodb --eval "disableTelemetry()"

echo "=> Creating directories"
mkdir -p /run/nodebb/logs /app/data/public /run/cloudron.{config,node-gyp,cache,npm}

[[ ! -d /app/data/public/uploads ]] && cp -r /app/code/public/uploads.template /app/data/public/uploads

export NODE_ENV=production

# this is in runtimeDirs
chown -R cloudron:cloudron /app/code/node_modules /app/code/build

rm -f /app/data/yarn.lock # older versions used yarn
[[ ! -f /app/data/package.json ]] && cp /app/code/package.json.copy /app/data/package.json
touch /app/data/package-lock.json

chown -R cloudron:cloudron /app/data /run/nodebb /run/cloudron.*

if [[ ! -f /app/data/.setup_done ]]; then
    echo "=> Running initial setup"
    setup="{
        \"url\": \"${CLOUDRON_APP_ORIGIN}\",
        \"admin:username\": \"admin\",
        \"admin:password\": \"changeme123\",
        \"admin:password:confirm\": \"changeme123\",
        \"admin:email\": \"admin@server.local\",
        \"database\": \"mongo\",
        \"mongo:host\": \"${CLOUDRON_MONGODB_HOST}\",
        \"mongo:port\": \"${CLOUDRON_MONGODB_PORT}\",
        \"mongo:username\": \"${CLOUDRON_MONGODB_USERNAME}\",
        \"mongo:password\": \"${CLOUDRON_MONGODB_PASSWORD}\",
        \"mongo:database\": \"${CLOUDRON_MONGODB_DATABASE}\"
    }"

    # this will create a config.json
    cd /app/code && /usr/local/bin/gosu cloudron:cloudron node /app/code/app --setup "${setup}"  --series
    touch /app/data/.setup_done
fi

[[ ! -f /app/data/secret ]] && openssl rand -hex 32 > /app/data/secret
secret=$(cat /app/data/secret)

# Re-create config.json
sed -e "s,##APP_ORIGIN,${CLOUDRON_APP_ORIGIN}," \
    -e "s/##MONGODB_HOST/${CLOUDRON_MONGODB_HOST}/" \
    -e "s/##MONGODB_PORT/${CLOUDRON_MONGODB_PORT}/" \
    -e "s/##MONGODB_USERNAME/${CLOUDRON_MONGODB_USERNAME}/" \
    -e "s/##MONGODB_PASSWORD/${CLOUDRON_MONGODB_PASSWORD}/" \
    -e "s/##MONGODB_DATABASE/${CLOUDRON_MONGODB_DATABASE}/" \
    -e "s/##SECRET/${secret}/" \
    /app/pkg/config.json.template > /run/nodebb/config.json

# _getEnv is needed to work with single quotes in the name. in mongo 5, mongosh can use process.env
if [[ -n "${CLOUDRON_MAIL_SMTP_SERVER:-}" ]]; then
    echo "=> Setting up email"
    ${mongo_cli} --eval "db.objects.update({ _key: 'config' }, { \$set: { 'email:smtpTransport:enabled': '1', 'email:smtpTransport:service': 'nodebb-custom-smtp', 'email:smtpTransport:host': '${CLOUDRON_MAIL_SMTP_SERVER}', 'email:smtpTransport:port': '${CLOUDRON_MAIL_SMTP_PORT}', 'email:smtpTransport:user': '${CLOUDRON_MAIL_SMTP_USERNAME}', 'email:smtpTransport:pass': '${CLOUDRON_MAIL_SMTP_PASSWORD}', 'email:smtpTransport:security': 'NONE', 'email:from': '${CLOUDRON_MAIL_FROM}', 'email:from_name': process.env.CLOUDRON_MAIL_FROM_DISPLAY_NAME || 'NodeBB' } }, { upsert: true })"
fi

echo "=> Bringing package.json up to speed"
series=1 /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb upgrade --package
echo "=> Installing packages"
if ! series=1 /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb upgrade --install; then
    echo "=> Force installing, since sometimes above doesn't work for unknown reasons"
    gosu cloudron:cloudron npm install --omit=dev --force --legacy-peer-deps
    series=1 /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb upgrade --install
fi
echo "=> Updating schema"
series=1 /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb upgrade --schema
echo "=> Building assets"
series=1 /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb upgrade --build

echo "=> Starting NodeBB"
# export NODE_ENV=dev for verbose logging
series=1 exec /usr/local/bin/gosu cloudron:cloudron node /app/code/loader.js --no-daemon --no-silent
