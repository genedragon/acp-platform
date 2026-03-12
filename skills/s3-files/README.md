# S3 Files Skill for OpenClaw

Easy file sharing between you and your OpenClaw agent using AWS S3.

## Features

- 📤 **Upload files** from agent to S3 with auto-generated download links
- 📥 **Download files** with pre-signed URLs
- 🌐 **Beautiful upload pages** with drag-and-drop for easy browser uploads
- 📱 **Mobile-friendly** interface
- 🔒 **Secure** pre-signed URLs with configurable expiration
- ⚡ **Fast** direct uploads to S3 (no routing through agent)

## Prerequisites

- AWS account with S3 access
- OpenClaw running on EC2 ([8-minute deployment guide](https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock))
- Node.js installed on your OpenClaw instance
- AWS credentials configured (IAM role or environment variables)

## Installation

1. Copy this skill to your OpenClaw workspace:
   ```bash
   mkdir -p ~/.openclaw/workspace/skills/s3-files
   cd ~/.openclaw/workspace/skills/s3-files
   # Copy all files from this repo
   ```

2. Install dependencies:
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   ```

3. Create your config file:
   ```bash
   cp config.json.example config.json
   # Edit config.json with your bucket name and region
   ```

4. Make scripts executable:
   ```bash
   chmod +x *.js
   ```

## AWS Setup

### 1. Create S3 Bucket

```bash
aws s3 mb s3://your-bucket-name --region <your-region>
```

### 2. Configure CORS (Required for Upload Pages)

The upload page feature requires CORS configuration on your S3 bucket. Create a file named `cors.json`:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Apply the CORS configuration:

```bash
aws s3api put-bucket-cors --bucket your-bucket-name --cors-configuration file://cors.json
```

**Note:** For production, restrict `AllowedOrigins` to specific domains instead of `"*"`.

### 3. Configure IAM Permissions

Your OpenClaw instance needs these S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

**Note:** `s3:ListBucket` is optional - the skill works without it by assuming file existence.

## Usage

### Upload a file (agent → S3)
```bash
node upload.js /path/to/file.zip
```
Returns download link automatically.

### Generate download link
```bash
node download-url.js filename.zip 24  # 24 hours expiration
```

### Generate upload page (user → S3)
```bash
node generate-upload-page.js 100  # 100MB max file size
```
Creates a beautiful HTML upload page and returns shareable link.
**Both the page URL and upload credentials expire in 24 hours.**

### Generate raw upload credentials
```bash
node generate-upload-url.js filename.apk 50  # 50MB max
```
Returns URL and form fields for API/cURL usage.

## Configuration

Edit `config.json`:

```json
{
  "bucketName": "your-bucket-name",
  "region": "<your-region>",
  "defaultExpirationHours": 24,
  "maxUploadSizeMB": 100
}
```

**Important:** Replace `<your-region>` with your actual AWS region (e.g., `us-east-1`, `us-west-2`, `eu-west-1`). The region must match where your S3 bucket is located.

## Common Workflows

**User wants to send you a file:**
1. Agent runs: `node generate-upload-page.js 100`
2. Send user the generated link
3. User uploads via browser
4. Agent retrieves from S3 using the upload key

**Note:** Upload pages use presigned POST which assigns a random S3 key (e.g., `uploads/abc123def456`) before the user selects a file. Files uploaded via the upload page will not preserve the original filename or extension. This is generally not a probelm for your agent or bot, but if you do need the file back with an extension, you can just ask your agent/bot to name it accordingly before sending you a download link. 

**Agent wants to send user a file:**
1. Agent runs: `node upload.js /path/to/file`
2. Send user the generated download link
3. Link expires in 24 hours (configurable)

## Security Notes

- Pre-signed URLs are temporary and expire automatically
- Upload pages and their embedded credentials both expire in 24 hours
- Upload pages enforce max file size limits (default 100MB)
- All uploads are restricted to the `uploads/` directory
- File paths are sanitized to prevent path traversal attacks
- Rate limiting: 10 script calls per minute per script (basic protection)
- No public bucket access required
- All transfers use HTTPS

## Limits and Rate Limiting

- **Max file size**: 100MB (configurable in config.json)
- **Rate limit**: 10 calls per minute per script
- **S3 key length**: Max 1024 characters
- **Expiration**: 24 hours for upload pages and credentials

If you hit rate limits, wait 60 seconds before retrying.

## Troubleshooting

**"Access Denied" errors:**
- Check IAM permissions
- Verify bucket name in config.json
- Ensure AWS credentials are configured

**Upload page not working:**
- Check browser console for errors
- Verify CORS is configured on your S3 bucket (see AWS Setup section)
- Verify upload page hasn't expired (24 hours)
- Ensure file size is within limit

**Rate limit errors:**
- Wait 60 seconds before retrying
- Each script has independent rate limiting (10 calls/minute)

## Files

- `upload.js` - Upload files from local filesystem
- `download-url.js` - Generate pre-signed download URLs
- `generate-upload-url.js` - Generate browser upload form data
- `generate-upload-page.js` - Generate beautiful HTML upload page
- `config.json` - Bucket configuration
- `SKILL.md` - Detailed documentation
- `README.md` - This file

## License

MIT

## Contributing

Pull requests welcome! Please test thoroughly before submitting.

## Support

For issues or questions, please open a GitHub issue.
