#!/bin/sh
set -e

# Generate a random session secret if not provided
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  export SESSION_SECRET
  echo "Generated SESSION_SECRET: $SESSION_SECRET"
fi

REGISTRY_URL="${REGISTRY_URL:-http://registry:4873}"

echo "Waiting for registry at $REGISTRY_URL ..."
timeout 30 sh -c "until curl -sf ${REGISTRY_URL}/-/ping > /dev/null 2>&1; do sleep 1; done"
echo "Registry ready."

# Create Verdaccio user and capture auth token; if user exists, get a token via basic auth
if [ -z "$REGISTRY_AUTH_TOKEN" ]; then
  # Try creating the user first
  RESP=$(curl -s -X PUT "${REGISTRY_URL}/-/user/org.couchdb.user:dolus" \
    -H 'Content-Type: application/json' \
    -d '{"name":"dolus","password":"dolus","email":"dolus@localhost","type":"user"}')
  TOKEN=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||''))")
  # User already exists — create a token via the npm tokens endpoint
  if [ -z "$TOKEN" ]; then
    RESP=$(curl -s -X POST "${REGISTRY_URL}/-/npm/v1/tokens" \
      -H 'Content-Type: application/json' \
      -u dolus:dolus \
      -d '{"password":"dolus","readonly":false}')
    TOKEN=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||''))")
  fi
  if [ -n "$TOKEN" ]; then
    export REGISTRY_AUTH_TOKEN="$TOKEN"
    echo "Registry user authenticated."
  else
    echo "Warning: could not get registry token. Response: $RESP"
  fi
fi

exec node server.mjs
