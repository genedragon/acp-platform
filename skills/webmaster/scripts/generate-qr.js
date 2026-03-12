#!/usr/bin/env node
/**
 * WebMaster v6 - QR Code Generator
 * 
 * Generates QR codes as PNG files, SVG files, data URLs (for embedding), or terminal output.
 * 
 * Usage:
 *   node generate-qr.js <text-or-url> [output-file] [options]
 *   node generate-qr.js --terminal <text-or-url>
 * 
 * Options:
 *   --format png|svg|dataurl   Output format (default: png, or inferred from filename)
 *   --size <pixels>            Image size (default: 512)
 *   --terminal                 Display in terminal (no file)
 *   --dark <color>             Dark module color (default: #000000)
 *   --light <color>            Light module color (default: #FFFFFF)
 *   --margin <cells>           Quiet zone margin (default: 2)
 *   --ec L|M|Q|H               Error correction level (default: M)
 *   --label <text>             Label text below QR code (PNG/SVG only)
 *   --help                     Show help
 * 
 * Examples:
 *   node generate-qr.js "https://example.com"
 *   node generate-qr.js "https://example.com" qr.svg --format svg
 *   node generate-qr.js "https://example.com" --format dataurl
 *   node generate-qr.js --terminal "https://example.com"
 */

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  format: 'png',
  size: 512,
  dark: '#000000',
  light: '#FFFFFF',
  margin: 2,
  errorCorrectionLevel: 'M'
};

/**
 * Generate a QR code
 * @param {string} data - Text or URL to encode
 * @param {Object} options - Generation options
 * @returns {Object} { filePath, dataUrl, svg, format }
 */
async function generateQR(data, options = {}) {
  const {
    outputPath,
    format = inferFormat(outputPath) || DEFAULTS.format,
    size = DEFAULTS.size,
    dark = DEFAULTS.dark,
    light = DEFAULTS.light,
    margin = DEFAULTS.margin,
    errorCorrectionLevel = DEFAULTS.errorCorrectionLevel,
    terminal = false
  } = options;

  const qrOptions = {
    errorCorrectionLevel,
    margin,
    width: size,
    color: { dark, light }
  };

  if (terminal) {
    const qrString = await QRCode.toString(data, { type: 'terminal', small: true });
    return { terminal: qrString, data };
  }

  if (format === 'dataurl') {
    const dataUrl = await QRCode.toDataURL(data, { ...qrOptions, type: 'image/png' });
    if (outputPath) {
      ensureDir(outputPath);
      fs.writeFileSync(outputPath, dataUrl);
    }
    return { dataUrl, data, format: 'dataurl' };
  }

  if (format === 'svg') {
    const svgString = await QRCode.toString(data, { ...qrOptions, type: 'svg' });
    const finalPath = outputPath || `qr-${Date.now()}.svg`;
    ensureDir(finalPath);
    fs.writeFileSync(finalPath, svgString);
    return { filePath: path.resolve(finalPath), data, format: 'svg', svg: svgString };
  }

  // Default: PNG
  const finalPath = outputPath || `qr-${Date.now()}.png`;
  ensureDir(finalPath);
  await QRCode.toFile(finalPath, data, { ...qrOptions, type: 'png' });
  return { filePath: path.resolve(finalPath), data, format: 'png' };
}

/**
 * Generate a QR code as an inline data URL (for embedding in HTML)
 * @param {string} data - Text or URL to encode
 * @param {Object} options - Generation options
 * @returns {string} data:image/png;base64,... URL
 */
async function generateQRDataUrl(data, options = {}) {
  const {
    size = DEFAULTS.size,
    dark = DEFAULTS.dark,
    light = DEFAULTS.light,
    margin = DEFAULTS.margin,
    errorCorrectionLevel = DEFAULTS.errorCorrectionLevel
  } = options;

  return QRCode.toDataURL(data, {
    errorCorrectionLevel,
    margin,
    width: size,
    color: { dark, light }
  });
}

/**
 * Generate QR code as SVG string (for inline embedding)
 * @param {string} data - Text or URL to encode
 * @param {Object} options - Generation options
 * @returns {string} SVG markup
 */
async function generateQRSvg(data, options = {}) {
  const {
    size = DEFAULTS.size,
    dark = DEFAULTS.dark,
    light = DEFAULTS.light,
    margin = DEFAULTS.margin,
    errorCorrectionLevel = DEFAULTS.errorCorrectionLevel
  } = options;

  return QRCode.toString(data, {
    type: 'svg',
    errorCorrectionLevel,
    margin,
    width: size,
    color: { dark, light }
  });
}

function inferFormat(filepath) {
  if (!filepath) return null;
  const ext = path.extname(filepath).toLowerCase();
  if (ext === '.svg') return 'svg';
  if (ext === '.png') return 'png';
  if (ext === '.txt') return 'dataurl';
  return null;
}

function ensureDir(filepath) {
  const dir = path.dirname(filepath);
  if (dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { generateQR, generateQRDataUrl, generateQRSvg, DEFAULTS };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
QR Code Generator (WebMaster v6)

Usage:
  node generate-qr.js <text-or-url> [output-file] [options]
  node generate-qr.js --terminal <text-or-url>

Options:
  --format png|svg|dataurl   Output format (default: png)
  --size <pixels>            Image width (default: 512)
  --terminal                 Display in terminal
  --dark <color>             Dark color (default: #000000)
  --light <color>            Light color (default: #FFFFFF)
  --margin <cells>           Quiet zone (default: 2)
  --ec L|M|Q|H               Error correction (default: M)

Examples:
  node generate-qr.js "https://example.com"
  node generate-qr.js "https://example.com" my-qr.svg
  node generate-qr.js "https://example.com" --format dataurl
  node generate-qr.js --terminal "Hello World"
`);
    process.exit(0);
  }

  const terminalMode = args[0] === '--terminal';
  const getOpt = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  let data, outputPath;
  if (terminalMode) {
    data = args[1];
  } else {
    // First non-flag arg is data, second non-flag arg is output path
    const positional = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') === false || (!a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1]?.startsWith('--'))));
    data = args[0];
    // Find second positional (not preceded by a flag)
    for (let i = 1; i < args.length; i++) {
      if (!args[i].startsWith('--') && !args[i - 1]?.startsWith('--')) {
        outputPath = args[i];
        break;
      }
    }
  }

  if (!data) {
    console.error('❌ Error: No text or URL provided');
    process.exit(1);
  }

  const options = {
    terminal: terminalMode,
    outputPath,
    format: getOpt('--format') || undefined,
    size: getOpt('--size') ? parseInt(getOpt('--size')) : undefined,
    dark: getOpt('--dark') || undefined,
    light: getOpt('--light') || undefined,
    margin: getOpt('--margin') ? parseInt(getOpt('--margin')) : undefined,
    errorCorrectionLevel: getOpt('--ec') || undefined
  };

  // Clean undefined values
  Object.keys(options).forEach(k => options[k] === undefined && delete options[k]);

  generateQR(data, options)
    .then(result => {
      if (result.terminal) {
        console.log('\n' + result.terminal);
        console.log(`✅ QR code for: ${result.data}\n`);
      } else if (result.dataUrl) {
        if (result.filePath) {
          console.log(`✅ Data URL saved to: ${result.filePath}`);
        } else {
          console.log(result.dataUrl);
        }
        console.log(`📄 Content: ${result.data}`);
      } else {
        console.log(`✅ QR code generated: ${result.filePath}`);
        console.log(`📄 Content: ${result.data}`);
        console.log(`📐 Format: ${result.format.toUpperCase()}`);
      }
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}
