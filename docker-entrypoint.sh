#!/bin/sh
set -e

echo "Applying Prisma schema..."
node node_modules/prisma/build/index.js db execute --file=./docker/clear-legacy-clicks.sql --schema=./prisma/schema.prisma
# Unique indexes (e.g. referrals.public_id) trigger a data-loss warning even when
# the column is nullable and existing rows are NULL. Accept it so the container
# can start; the backfill below fills unique lead IDs afterwards.
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss --schema=./prisma/schema.prisma

echo "Zeroing refund hold and releasing held commissions..."
node node_modules/prisma/build/index.js db execute --file=./docker/zero-refund-hold.sql --schema=./prisma/schema.prisma

echo "Backfilling lead public IDs..."
node docker/backfill-lead-ids.cjs

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Bootstrapping admin user..."
  node docker/bootstrap-admin.cjs
fi

exec node server.js
