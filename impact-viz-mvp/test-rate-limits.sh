#!/bin/bash

# Test script for rate limiting
# Run this from the project root: bash test-rate-limits.sh

echo "🧪 Testing Rate Limits..."
echo ""

# Test 1: Auth endpoint rate limit (should fail after 10 attempts)
echo "Test 1: Auth endpoint rate limiting (should block after 10 attempts)"
echo "Making 12 requests to /api/auth/session..."

for i in {1..12}; do
  response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/session \
    -H "Content-Type: application/json" \
    -d '{"access_token":"fake","refresh_token":"fake"}')

  status_code=$(echo "$response" | tail -1)

  if [ "$status_code" -eq 429 ]; then
    echo "  ✅ Request $i: Got 429 (rate limited) - PASS"
    break
  elif [ $i -le 10 ]; then
    echo "  ✓ Request $i: Status $status_code (within limit)"
  else
    echo "  ❌ Request $i: Got $status_code, expected 429 - FAIL"
  fi
done

echo ""
echo "Test 2: AI endpoint requires authentication"
echo "Making request to /api/ai/chat without auth..."

response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"portfolioId":"test","message":"hello"}')

status_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

if [ "$status_code" -eq 401 ]; then
  echo "  ✅ Got 401 Unauthorized - PASS"
  echo "  Response: $body"
else
  echo "  ❌ Got $status_code, expected 401 - FAIL"
fi

echo ""
echo "Test 3: AI transcribe endpoint requires authentication"
echo "Making request to /api/ai/transcribe without auth..."

response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/ai/transcribe \
  -H "Content-Type: application/json")

status_code=$(echo "$response" | tail -1)

if [ "$status_code" -eq 401 ]; then
  echo "  ✅ Got 401 Unauthorized - PASS"
else
  echo "  ❌ Got $status_code, expected 401 - FAIL"
fi

echo ""
echo "✨ Rate limit tests complete!"
echo ""
echo "Note: To test authenticated requests work normally,"
echo "log into your app and check that AI features work as expected."
