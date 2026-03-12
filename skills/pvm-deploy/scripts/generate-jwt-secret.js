#!/usr/bin/env node
// Generate and store JWT secret in AWS Secrets Manager

const { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const region = process.env.AWS_REGION || 'us-west-2';
const secretName = process.env.JWT_SECRET_NAME || 'pvm/jwt-secret';
const client = new SecretsManagerClient({ region });

async function generateAndStoreSecret() {
  console.log('Generating JWT secret...');
  
  // Generate 256-bit random secret
  const secret = crypto.randomBytes(32).toString('base64');
  
  console.log('Secret generated (first 10 chars):', secret.substring(0, 10) + '...');
  console.log('Secret length:', secret.length);
  
  // Check if secret already exists
  try {
    const getCommand = new GetSecretValueCommand({ SecretId: secretName });
    await client.send(getCommand);
    console.log(`✓ Secret '${secretName}' already exists`);
    console.log('To rotate, use AWS Secrets Manager console or CLI');
    return;
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
    // Secret doesn't exist, create it
  }
  
  // Create secret in Secrets Manager
  console.log(`Creating secret '${secretName}'...`);
  
  const createCommand = new CreateSecretCommand({
    Name: secretName,
    Description: 'JWT signing secret for Permissions Vending Machine',
    SecretString: secret,
    Tags: [
      { Key: 'Application', Value: 'PVM' },
      { Key: 'Purpose', Value: 'JWT-Signing' }
    ]
  });
  
  try {
    const response = await client.send(createCommand);
    console.log('✓ Secret created successfully');
    console.log('ARN:', response.ARN);
    console.log('\nSet this environment variable:');
    console.log(`JWT_SECRET_ARN=${response.ARN}`);
  } catch (error) {
    if (error.name === 'ResourceExistsException') {
      console.log(`✓ Secret '${secretName}' already exists`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('=== PVM JWT Secret Setup ===\n');
  
  try {
    await generateAndStoreSecret();
    console.log('\n=== Setup complete ===');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateAndStoreSecret };
