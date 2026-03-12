#!/usr/bin/env node
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('./config.json');

const s3Client = new S3Client({ region: config.region });

// Simple rate limiter
const rateLimiter = {
  calls: [],
  maxCalls: 10,
  windowMs: 60000, // 1 minute
  
  check() {
    const now = Date.now();
    this.calls = this.calls.filter(time => now - time < this.windowMs);
    
    if (this.calls.length >= this.maxCalls) {
      const oldestCall = this.calls[0];
      const waitTime = Math.ceil((this.windowMs - (now - oldestCall)) / 1000);
      console.error(`❌ Rate limit exceeded. Wait ${waitTime}s`);
      throw new Error('Rate limit exceeded');
    }
    
    this.calls.push(now);
  }
};

async function generateDownloadUrl(key, expirationHours) {
  rateLimiter.check();
  
  const hours = expirationHours || config.defaultExpirationHours;
  const expiresIn = hours * 3600;

  console.log(`🔗 Generating download URL...`);
  console.log(`⏰ Expiration: ${hours} hours`);

  try {
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    console.log(`\n✅ Download URL:\n${url}`);
    return url;
  } catch (err) {
    console.error('❌ Failed to generate download URL');
    throw new Error('Operation failed');
  }
}

// CLI usage
if (require.main === module) {
  const key = process.argv[2];
  const hours = parseInt(process.argv[3]) || config.defaultExpirationHours;

  if (!key) {
    console.error('Usage: node download-url.js <s3-key> [expiration-hours]');
    process.exit(1);
  }

  generateDownloadUrl(key, hours).catch(err => {
    process.exit(1);
  });
}

module.exports = { generateDownloadUrl };
