#!/bin/sh
set -e

echo "Applying Prisma schema..."
node node_modules/prisma/build/index.js db execute --file=./docker/clear-legacy-clicks.sql --schema=./prisma/schema.prisma
node node_modules/prisma/build/index.js db push --skip-generate --schema=./prisma/schema.prisma

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Bootstrapping admin user..."
  node docker/bootstrap-admin.cjs
fi

exec node server.js
