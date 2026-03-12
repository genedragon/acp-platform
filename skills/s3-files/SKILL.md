# S3 Files Skill

Manage file uploads and downloads with AWS S3 using pre-signed URLs.

## What This Skill Does

- Upload files from local filesystem to S3
- Generate download URLs for files in S3
- Generate browser-friendly upload URLs for users
- Handle file sharing via Telegram/messaging

## Prerequisites

- AWS S3 bucket configured
- EC2 instance IAM role with S3 permissions:
  - `s3:PutObject`
  - `s3:GetObject`
  - `s3:DeleteObject` (optional)
  - `s3:ListBucket` (optional)
- AWS SDK installed: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`

## Configuration

Edit `config.json` in this skill directory:

```json
{
  "bucketName": "your-bucket-name",
  "region": "us-west-2",
  "defaultExpirationHours": 24,
  "maxUploadSizeMB": 100
}
```

## Usage

### Upload a File

```bash
node upload.js /path/to/file.zip [optional-s3-key-name]
```

Returns a download URL automatically.

### Generate Download URL

```bash
node download-url.js s3-key-name [expiration-hours]
```

### Generate Upload URL for User

```bash
node generate-upload-url.js filename [max-size-mb]
```

Returns URL and form fields that a user can use to upload directly to S3.

### Generate Browser Upload Page

```bash
node generate-upload-page.js [max-size-mb]
```

Creates a beautiful, drag-and-drop HTML upload page, uploads it to S3, and returns a shareable link. Perfect for easy file sharing!

## From Agent Chat

Just ask:
- "Upload file.zip to S3"
- "Send me a download link for file.zip"
- "Generate an upload link for the user"

## Files

- `upload.js` - Upload file from local filesystem
- `download-url.js` - Generate pre-signed download URL
- `generate-upload-url.js` - Generate browser upload form data
- `generate-upload-page.js` - **NEW!** Generate beautiful HTML upload page
- `config.json` - Bucket configuration
- `SKILL.md` - This file

## Security Notes

- Pre-signed URLs expire (default 24 hours)
- Upload URLs have size limits (default 100MB)
- Files are private by default
- Only accessible via pre-signed URLs
