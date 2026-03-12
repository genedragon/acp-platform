#!/bin/bash
set -e

echo "🔨 Rebuilding PVM Lambda packages (callback-free + DynamoDB allowlist)"
echo "======================================================================"

cd "$(dirname "$0")/.."

# Clean old packages
rm -f pvm-*-fixed*.zip api-function*.zip tasks-function*.zip

echo ""
echo "📦 Building API Lambda..."
cd src
zip -q -r ../pvm-api-final.zip . -x "tasks/*" -x "*.md"
cd ..
echo "✓ API Lambda: pvm-api-final.zip ($(du -h pvm-api-final.zip | cut -f1))"

echo ""
echo "📦 Building task Lambdas..."
cd src/tasks

for task in store-request send-approval-email grant-permissions revoke-permissions; do
  zip -q -r ../../pvm-${task}-final.zip ${task}.js db.js config.js jwt.js validator.js node_modules/
  echo "✓ Task: pvm-${task}-final.zip ($(du -h ../../pvm-${task}-final.zip | cut -f1))"
done

cd ../..

echo ""
echo "✅ All packages built!"
echo ""
echo "Packages ready for deployment:"
ls -lh pvm-*-final.zip | awk '{print "  " $9 " - " $5}'
echo ""
echo "Next: Deploy to AWS Lambda functions"
