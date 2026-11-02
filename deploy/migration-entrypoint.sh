#!/bin/sh
set -eu

node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

if [ "${BOOTSTRAP_DATA:-true}" = "true" ]; then
  node apps/api/dist/prisma/bootstrap-production.js
fi

# Release-time CMS defaults are idempotent and run in this one-shot deployment
# role, never concurrently in API or Worker replicas.
node apps/api/dist/prisma/seed-cms.js
