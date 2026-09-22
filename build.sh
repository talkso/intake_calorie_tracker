#!/bin/sh
# Everything the app is, and nothing else, gathered into one directory for Cloudflare
# to publish.
#
# Publishing the repository root directly would have been simpler, but it would also
# have put .git on the open internet - the whole history, readable by anyone with the
# URL. Wrangler's .assetsignore did not hold it back when that was tried, and its own
# count of what it had read did not match what was there, so there was no way to be
# sure. Naming what ships is checkable; naming what does not was not.
set -e
rm -rf dist
mkdir -p dist
cp index.html app.js styles.css fonts.css sw.js manifest.webmanifest dist/
cp -R fonts icons dist/
echo "dist holds $(find dist -type f | wc -l) files"
