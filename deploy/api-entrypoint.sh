#!/bin/sh
set -eu

exec node apps/api/dist/src/main.js
