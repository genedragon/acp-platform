#!/usr/bin/env node
const { S3Client } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const crypto = require('crypto');
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

function sanitizeFilename(filename) {
  if (!filename) return null;
  
  return filename
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255);
}

async function generateUploadUrl(filename, maxSizeMB) {
  rateLimiter.check();
  
  const maxSize = maxSizeMB || config.maxUploadSizeMB;
  const sanitized = sanitizeFilename(filename);
  const randomId = crypto.randomBytes(8).toString('hex');
  const key = sanitized ? `uploads/${randomId}-${sanitized}` : `uploads/${randomId}`;
  
  console.log(`📤 Generating upload URL...`);
  console.log(`📏 Max file size: ${maxSize} MB`);
  console.log(`⏰ Expiration: 1 hour\n`);

  try {
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: config.bucketName,
      Key: key,
      Conditions: [
        ['content-length-range', 0, maxSize * 1024 * 1024],
      ],
      Expires: 3600, // 1 hour
    });

    console.log(`✅ Upload form generated!\n`);
    console.log(`POST URL: ${url}`);
    console.log(`\nForm fields (include these in your POST request):`);
    console.log(JSON.stringify(fields, null, 2));
    console.log(`\n📝 To upload, POST a multipart/form-data request with:`);
    console.log(`   - All the fields above as hidden inputs`);
    console.log(`   - A file input named "file"`);
    console.log(`\n💡 Example cURL command:`);
    
    const curlFields = Object.entries(fields)
      .map(([k, v]) => `-F "${k}=${v}"`)
      .join(' ');
    console.log(`curl ${curlFields} -F "file=@yourfile.ext" "${url}"`);

    return { url, fields, key };
  } catch (err) {
    console.error('❌ Failed to generate upload URL');
    throw new Error('Operation failed');
  }
}

// CLI usage
if (require.main === module) {
  const filename = process.argv[2];
  const maxSizeMB = parseInt(process.argv[3]) || config.maxUploadSizeMB;

  generateUploadUrl(filename, maxSizeMB).catch(err => {
    process.exit(1);
  });
}

module.exports = { generateUploadUrl };
