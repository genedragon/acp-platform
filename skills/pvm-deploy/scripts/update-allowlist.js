#!/usr/bin/env node
/**
 * Update PVM Permission Allowlist
 * 
 * Standalone administrative tool to update the allowlist in DynamoDB.
 * Requires AWS credentials with dynamodb:GetItem and dynamodb:PutItem
 * permissions on the pvm-allowlist table.
 * 
 * SECURITY: This script runs with IAM credentials (not via API).
 * No API key needed - human operator must have AWS IAM permissions.
 * 
 * Usage:
 *   node scripts/update-allowlist.js                    # Interactive mode
 *   node scripts/update-allowlist.js --file new.json    # From file
 *   node scripts/update-allowlist.js --view             # View current
 *   node scripts/update-allowlist.js --region us-west-2 # Specify region
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  GetCommand,
  PutCommand 
} = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const regionIndex = args.indexOf('--region');
const region = regionIndex >= 0 && args[regionIndex + 1] ? args[regionIndex + 1] : 'us-west-2';

const fileIndex = args.indexOf('--file');
const filePath = fileIndex >= 0 && args[fileIndex + 1] ? args[fileIndex + 1] : null;

const viewMode = args.includes('--view');

const TABLE_NAME = 'pvm-allowlist';
const AUDIT_TABLE = 'pvm-audit-logs';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Create readline interface for interactive prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function getCurrentAllowlist() {
  console.log(`Fetching current allowlist from ${TABLE_NAME}...`);
  
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: 'current' }
    });
    
    const response = await docClient.send(command);
    
    if (!response.Item) {
      throw new Error('Allowlist not found in DynamoDB. Run create-allowlist-table.js first.');
    }
    
    return response.Item;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Table ${TABLE_NAME} does not exist. Run scripts/create-allowlist-table.js first.`);
    }
    throw error;
  }
}

function displayAllowlist(allowlist) {
  console.log('\n=== Current Allowlist ===');
  console.log(`Version: ${allowlist.version || 'unknown'}`);
  console.log(`Updated: ${allowlist.updatedAt || 'unknown'}`);
  console.log(`Updated By: ${allowlist.updatedBy || 'unknown'}`);
  console.log(`Description: ${allowlist.description || 'none'}`);
  console.log('\nAllowed Actions:');
  allowlist.allowedActions.forEach((action, i) => {
    console.log(`  ${i + 1}. ${action}`);
  });
  console.log('\nDenied Actions:');
  allowlist.deniedActions.forEach((action, i) => {
    console.log(`  ${i + 1}. ${action}`);
  });
  console.log();
}

function validateAllowlist(allowlist) {
  const errors = [];
  
  if (!allowlist.allowedActions || !Array.isArray(allowlist.allowedActions)) {
    errors.push('allowedActions must be an array');
  } else if (allowlist.allowedActions.length === 0) {
    errors.push('allowedActions cannot be empty');
  } else {
    allowlist.allowedActions.forEach((action, i) => {
      if (typeof action !== 'string' || action.trim() === '') {
        errors.push(`allowedActions[${i}] is invalid: "${action}"`);
      }
    });
  }
  
  if (!allowlist.deniedActions || !Array.isArray(allowlist.deniedActions)) {
    errors.push('deniedActions must be an array');
  } else if (allowlist.deniedActions.length === 0) {
    errors.push('deniedActions cannot be empty');
  } else {
    allowlist.deniedActions.forEach((action, i) => {
      if (typeof action !== 'string' || action.trim() === '') {
        errors.push(`deniedActions[${i}] is invalid: "${action}"`);
      }
    });
  }
  
  return errors;
}

async function updateAllowlist(newAllowlist, currentVersion) {
  const version = (currentVersion || 0) + 1;
  
  const allowlistItem = {
    id: 'current',
    allowedActions: newAllowlist.allowedActions,
    deniedActions: newAllowlist.deniedActions,
    description: newAllowlist.description || 'Allowlist for PVM - approved IAM actions',
    version: version,
    updatedAt: new Date().toISOString(),
    updatedBy: process.env.USER || process.env.USERNAME || 'admin-script'
  };
  
  console.log(`\nWriting new allowlist (version ${version}) to DynamoDB...`);
  
  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: allowlistItem
    });
    
    await docClient.send(command);
    console.log('✓ Allowlist updated successfully');
    
    // Log to audit table
    await logAudit({
      request_id: `allowlist-update-${Date.now()}`,
      action: 'ALLOWLIST_UPDATED',
      actor: process.env.USER || process.env.USERNAME || 'admin-script',
      details: {
        version: version,
        previous_version: currentVersion || 0,
        allowed_actions_count: newAllowlist.allowedActions.length,
        denied_actions_count: newAllowlist.deniedActions.length,
        allowed_actions: newAllowlist.allowedActions,
        denied_actions: newAllowlist.deniedActions,
        timestamp: new Date().toISOString()
      }
    });
    
    return allowlistItem;
  } catch (error) {
    console.error('✗ Failed to update allowlist:', error.message);
    
    // Log failed attempt
    await logAudit({
      request_id: `allowlist-update-failed-${Date.now()}`,
      action: 'ALLOWLIST_UPDATE_FAILED',
      actor: process.env.USER || process.env.USERNAME || 'admin-script',
      details: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }).catch(err => console.error('Failed to log error:', err));
    
    throw error;
  }
}

async function logAudit(entry) {
  try {
    const command = new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        ...entry,
        timestamp: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
      }
    });
    
    await docClient.send(command);
  } catch (error) {
    console.warn('Warning: Failed to write audit log:', error.message);
    // Don't fail the operation if audit logging fails
  }
}

async function interactiveUpdate(currentAllowlist) {
  console.log('\n=== Interactive Update Mode ===');
  console.log('Edit the allowlist by adding/removing actions.\n');
  
  displayAllowlist(currentAllowlist);
  
  const choice = await prompt('What would you like to do?\n  1. Add allowed action\n  2. Remove allowed action\n  3. Add denied action\n  4. Remove denied action\n  5. Update description\n  6. Save and exit\n  7. Cancel\n\nChoice: ');
  
  const newAllowlist = {
    allowedActions: [...currentAllowlist.allowedActions],
    deniedActions: [...currentAllowlist.deniedActions],
    description: currentAllowlist.description
  };
  
  switch (choice.trim()) {
    case '1': {
      const action = await prompt('Enter action to allow (e.g., s3:GetObject): ');
      if (action.trim()) {
        newAllowlist.allowedActions.push(action.trim());
        console.log(`✓ Added: ${action.trim()}`);
      }
      return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
    }
    
    case '2': {
      const index = await prompt('Enter number to remove (1-based): ');
      const idx = parseInt(index) - 1;
      if (idx >= 0 && idx < newAllowlist.allowedActions.length) {
        const removed = newAllowlist.allowedActions.splice(idx, 1);
        console.log(`✓ Removed: ${removed[0]}`);
      } else {
        console.log('Invalid index');
      }
      return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
    }
    
    case '3': {
      const action = await prompt('Enter action to deny (e.g., iam:*): ');
      if (action.trim()) {
        newAllowlist.deniedActions.push(action.trim());
        console.log(`✓ Added: ${action.trim()}`);
      }
      return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
    }
    
    case '4': {
      const index = await prompt('Enter number to remove (1-based): ');
      const idx = parseInt(index) - 1;
      if (idx >= 0 && idx < newAllowlist.deniedActions.length) {
        const removed = newAllowlist.deniedActions.splice(idx, 1);
        console.log(`✓ Removed: ${removed[0]}`);
      } else {
        console.log('Invalid index');
      }
      return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
    }
    
    case '5': {
      const desc = await prompt('Enter new description: ');
      if (desc.trim()) {
        newAllowlist.description = desc.trim();
        console.log('✓ Description updated');
      }
      return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
    }
    
    case '6': {
      // Validate before saving
      const errors = validateAllowlist(newAllowlist);
      if (errors.length > 0) {
        console.error('\n✗ Validation errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        console.log();
        return await interactiveUpdate({ ...currentAllowlist, ...newAllowlist });
      }
      
      // Show changes
      console.log('\n=== Proposed Changes ===');
      displayAllowlist(newAllowlist);
      
      const confirm = await prompt('Save these changes? (yes/no): ');
      if (confirm.toLowerCase() === 'yes') {
        return newAllowlist;
      } else {
        console.log('Changes discarded');
        return null;
      }
    }
    
    case '7': {
      console.log('Cancelled');
      return null;
    }
    
    default: {
      console.log('Invalid choice');
      return await interactiveUpdate(currentAllowlist);
    }
  }
}

async function main() {
  try {
    console.log('=== PVM Allowlist Update Tool ===\n');
    console.log(`Region: ${region}`);
    console.log(`Table: ${TABLE_NAME}\n`);
    
    // Get current allowlist
    const currentAllowlist = await getCurrentAllowlist();
    
    // View mode - just display and exit
    if (viewMode) {
      displayAllowlist(currentAllowlist);
      rl.close();
      process.exit(0);
    }
    
    let newAllowlist;
    
    // File mode - load from JSON file
    if (filePath) {
      console.log(`Loading allowlist from: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      newAllowlist = JSON.parse(fileContent);
      
      console.log('✓ File loaded successfully\n');
      
      // Validate
      const errors = validateAllowlist(newAllowlist);
      if (errors.length > 0) {
        console.error('✗ Validation errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        rl.close();
        process.exit(1);
      }
      
      // Show current vs new
      console.log('=== Current Allowlist ===');
      displayAllowlist(currentAllowlist);
      
      console.log('=== New Allowlist (from file) ===');
      displayAllowlist(newAllowlist);
      
      const confirm = await prompt('Apply these changes? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('Cancelled');
        rl.close();
        process.exit(0);
      }
    } else {
      // Interactive mode
      newAllowlist = await interactiveUpdate(currentAllowlist);
      
      if (!newAllowlist) {
        rl.close();
        process.exit(0);
      }
    }
    
    // Update in DynamoDB
    const updated = await updateAllowlist(newAllowlist, currentAllowlist.version);
    
    console.log('\n=== Update Complete ===');
    console.log(`New version: ${updated.version}`);
    console.log(`Updated at: ${updated.updatedAt}`);
    console.log('\nLambda functions will load the new allowlist on next cold start');
    console.log('or within 5 minutes (cache TTL).');
    
    rl.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    
    if (error.name === 'AccessDeniedException') {
      console.error('\nYou need IAM permissions for:');
      console.error('  - dynamodb:GetItem on pvm-allowlist');
      console.error('  - dynamodb:PutItem on pvm-allowlist');
      console.error('  - dynamodb:PutItem on pvm-audit-logs (optional)');
    }
    
    rl.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { getCurrentAllowlist, updateAllowlist, validateAllowlist };
