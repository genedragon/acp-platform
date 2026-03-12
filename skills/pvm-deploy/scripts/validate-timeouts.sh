#!/bin/bash
# Validate that polling script timeout matches state machine timeout

STATE_MACHINE_FILE="docs/step-functions-state-machine.json"
POLLING_SCRIPT="scripts/pvm_agent_poll.py"

echo "🔍 Validating timeout configuration..."
echo ""

# Extract timeouts (first number only)
STATE_TIMEOUT=$(grep '"TimeoutSeconds"' "$STATE_MACHINE_FILE" | head -1 | grep -o '[0-9]\+' | head -1)
SCRIPT_TIMEOUT=$(grep 'APPROVAL_TIMEOUT_SECONDS =' "$POLLING_SCRIPT" | grep -o '[0-9]\+' | head -1)

echo "State Machine timeout: ${STATE_TIMEOUT}s"
echo "Polling Script timeout: ${SCRIPT_TIMEOUT}s"
echo ""

if [ "$STATE_TIMEOUT" = "$SCRIPT_TIMEOUT" ]; then
    echo "✅ Timeouts match! Both set to ${STATE_TIMEOUT}s ($(($STATE_TIMEOUT / 3600)) hours)"
    exit 0
else
    echo "❌ MISMATCH! Timeouts do not match:"
    echo "   State machine: ${STATE_TIMEOUT}s ($(($STATE_TIMEOUT / 3600)) hours)"
    echo "   Polling script: ${SCRIPT_TIMEOUT}s ($(($SCRIPT_TIMEOUT / 3600)) hours)"
    echo ""
    echo "Fix: Update APPROVAL_TIMEOUT_SECONDS in $POLLING_SCRIPT to $STATE_TIMEOUT"
    exit 1
fi
