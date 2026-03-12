#!/usr/bin/env node
/**
 * WebMaster v4 - Asset Validator
 * Scans HTML files for referenced assets and verifies they exist
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract asset references from HTML content
 */
function extractAssetReferences(htmlContent, htmlFile) {
  const references = new Set();
  
  // Patterns to match
  const patterns = [
    // Images: <img src="...">
    /<img[^>]+src=["']([^"']+)["']/gi,
    // CSS: <link rel="stylesheet" href="...">
    /<link[^>]+href=["']([^"']+\.css)["']/gi,
    // JavaScript: <script src="...">
    /<script[^>]+src=["']([^"']+)["']/gi,
    // Background images in inline styles
    /style=["'][^"']*url\(['"]?([^'")\s]+)['"]?\)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const ref = match[1];
      
      // Skip external URLs, data URLs, and absolute paths starting with /
      if (ref.startsWith('http://') || 
          ref.startsWith('https://') || 
          ref.startsWith('data:') ||
          ref.startsWith('//')) {
        continue;
      }
      
      // For root-relative paths (starting with /), strip leading slash
      const cleanRef = ref.startsWith('/') ? ref.substring(1) : ref;
      
      references.add(cleanRef);
    }
  }
  
  return Array.from(references);
}

/**
 * Find all HTML files in directory
 */
function findHtmlFiles(dir) {
  const htmlFiles = [];
  
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath);
        }
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return htmlFiles;
}

/**
 * Validate all assets in a directory
 */
function validateAssets(siteDir, options = {}) {
  const { verbose = false } = options;
  
  console.log('🔍 Validating assets...\n');
  
  const htmlFiles = findHtmlFiles(siteDir);
  
  if (htmlFiles.length === 0) {
    console.log('⚠️  No HTML files found');
    return { valid: true, missing: [], warnings: [] };
  }
  
  const missingAssets = [];
  const warnings = [];
  let totalReferences = 0;
  
  for (const htmlFile of htmlFiles) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    const references = extractAssetReferences(htmlContent, htmlFile);
    totalReferences += references.length;
    
    if (verbose && references.length > 0) {
      console.log(`📄 ${path.relative(siteDir, htmlFile)}: ${references.length} reference(s)`);
    }
    
    for (const ref of references) {
      const htmlDir = path.dirname(htmlFile);
      const assetPath = path.resolve(htmlDir, ref);
      
      if (!fs.existsSync(assetPath)) {
        missingAssets.push({
          file: path.relative(siteDir, htmlFile),
          missing: ref,
          expectedPath: path.relative(siteDir, assetPath)
        });
      }
    }
    
    // Check for images without dimensions
    const imgTags = htmlContent.match(/<img[^>]+>/g) || [];
    for (const tag of imgTags) {
      const hasWidth = /width=/.test(tag) || /style=.*width/.test(tag);
      const hasHeight = /height=/.test(tag) || /style=.*height/.test(tag);
      const src = tag.match(/src=["']([^"']+)["']/)?.[1];
      
      if (!hasWidth && !hasHeight && src) {
        warnings.push({
          file: path.relative(siteDir, htmlFile),
          warning: `Image without dimensions: ${src} (may not display correctly)`
        });
      }
    }
  }
  
  console.log(`✅ Scanned ${htmlFiles.length} HTML file(s), ${totalReferences} asset reference(s)\n`);
  
  if (missingAssets.length > 0) {
    console.log(`❌ Found ${missingAssets.length} missing asset(s):\n`);
    for (const { file, missing, expectedPath } of missingAssets) {
      console.log(`   ${file}:`);
      console.log(`      Missing: ${missing}`);
      console.log(`      Expected at: ${expectedPath}\n`);
    }
  }
  
  if (warnings.length > 0 && verbose) {
    console.log(`⚠️  ${warnings.length} warning(s):\n`);
    for (const { file, warning } of warnings) {
      console.log(`   ${file}: ${warning}`);
    }
    console.log('');
  }
  
  return {
    valid: missingAssets.length === 0,
    missing: missingAssets,
    warnings,
    stats: {
      htmlFiles: htmlFiles.length,
      totalReferences,
      missingCount: missingAssets.length,
      warningCount: warnings.length
    }
  };
}

module.exports = { validateAssets };

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: validate-assets.js <site-directory> [--verbose]');
    console.error('');
    console.error('Example:');
    console.error('  validate-assets.js ./my-site --verbose');
    process.exit(1);
  }
  
  const siteDir = args[0];
  const verbose = args.includes('--verbose');
  
  if (!fs.existsSync(siteDir)) {
    console.error(`❌ Directory not found: ${siteDir}`);
    process.exit(1);
  }
  
  const result = validateAssets(siteDir, { verbose });
  
  if (!result.valid) {
    console.log('❌ Asset validation failed');
    console.log('\n💡 Fix missing assets before deployment:');
    console.log('   1. Add missing files to the site directory');
    console.log('   2. Remove broken references from HTML');
    console.log('   3. Use --force flag to deploy anyway (not recommended)\n');
    process.exit(1);
  }
  
  console.log('✅ Asset validation passed!\n');
  process.exit(0);
}
