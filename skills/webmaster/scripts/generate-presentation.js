#!/usr/bin/env node
/**
 * WebMaster v6 - Presentation Generator
 * Generates a reveal.js presentation from a simple JSON/Markdown definition
 * 
 * Usage:
 *   node generate-presentation.js <definition-file> <output-dir> [options]
 *   node generate-presentation.js --from-markdown <markdown-file> <output-dir> [options]
 * 
 * Options:
 *   --theme <name>       Theme name (default: black). Available: beige, black, blood, dracula,
 *                         league, moon, night, serif, simple, sky, solarized, white
 *   --transition <type>  Slide transition (default: slide). Options: none, fade, slide, convex, concave, zoom
 *   --title <title>      Presentation title (overrides definition)
 *   --author <name>      Author name
 *   --auto-slide <ms>    Auto-advance slides (milliseconds, 0=disabled)
 */

const fs = require('fs');
const path = require('path');
const { generateQRDataUrl, generateQRSvg } = require('./generate-qr');

const SKILL_DIR = path.resolve(__dirname, '..');
const REVEAL_TEMPLATE_DIR = path.join(SKILL_DIR, 'templates', 'reveal');

const AVAILABLE_THEMES = [
  'beige', 'black', 'black-contrast', 'blood', 'dracula',
  'league', 'moon', 'night', 'serif', 'simple', 'sky',
  'solarized', 'white', 'white-contrast'
];

const AVAILABLE_TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'];

/**
 * Generate a reveal.js presentation
 * @param {Object} definition - Presentation definition
 * @param {string} outputDir - Output directory
 * @param {Object} options - Generation options
 */
async function generatePresentation(definition, outputDir, options = {}) {
  const {
    theme = 'black',
    transition = 'slide',
    autoSlide = 0,
    controls = true,
    progress = true,
    hash = true,
    plugins = ['highlight', 'notes', 'markdown', 'search', 'zoom']
  } = options;

  // Validate theme
  if (!AVAILABLE_THEMES.includes(theme)) {
    throw new Error(`Unknown theme: "${theme}". Available: ${AVAILABLE_THEMES.join(', ')}`);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy reveal.js dist files
  console.log('📦 Copying reveal.js assets...');
  copyDirSync(REVEAL_TEMPLATE_DIR, path.join(outputDir, 'reveal'));

  // Build slides HTML (async for QR code generation)
  const slidesHtml = await buildSlidesHtml(definition.slides || []);

  // Build plugin imports
  const pluginImports = plugins.map(p => {
    const pluginMap = {
      'highlight': { path: 'reveal/plugin/highlight.js', name: 'RevealHighlight' },
      'notes': { path: 'reveal/plugin/notes.js', name: 'RevealNotes' },
      'markdown': { path: 'reveal/plugin/markdown.js', name: 'RevealMarkdown' },
      'search': { path: 'reveal/plugin/search.js', name: 'RevealSearch' },
      'zoom': { path: 'reveal/plugin/zoom.js', name: 'RevealZoom' },
      'math': { path: 'reveal/plugin/math.js', name: 'RevealMath' }
    };
    return pluginMap[p] || null;
  }).filter(Boolean);

  const pluginScripts = pluginImports.map(p => `    <script src="${p.path}"></script>`).join('\n');
  const pluginNames = pluginImports.map(p => p.name).join(', ');

  // Generate index.html
  const title = definition.title || options.title || 'Presentation';
  const author = definition.author || options.author || '';
  const description = definition.description || '';
  const customCss = definition.customCss || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${author ? `<meta name="author" content="${escapeHtml(author)}">` : ''}
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  <link rel="stylesheet" href="reveal/reset.css">
  <link rel="stylesheet" href="reveal/reveal.css">
  <link rel="stylesheet" href="reveal/theme/${theme}.css" id="theme">
  <!-- Code syntax highlighting -->
  <link rel="stylesheet" href="reveal/plugin/highlight/monokai.css">
  ${customCss ? `<style>\n${customCss}\n  </style>` : ''}
</head>
<body>
  <div class="reveal">
    <div class="slides">
${slidesHtml}
    </div>
  </div>

  <script src="reveal/reveal.js"></script>
${pluginScripts}
  <script>
    Reveal.initialize({
      hash: ${hash},
      controls: ${controls},
      progress: ${progress},
      transition: '${transition}',
      ${autoSlide ? `autoSlide: ${autoSlide},` : ''}
      plugins: [${pluginNames}]
    });
  </script>
</body>
</html>`;

  const indexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(indexPath, html);
  console.log(`✅ Generated: ${indexPath}`);

  // Copy any local assets referenced in the definition
  if (definition.assets) {
    const assetsDir = path.join(outputDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    for (const asset of definition.assets) {
      if (fs.existsSync(asset.src)) {
        const dest = path.join(assetsDir, asset.name || path.basename(asset.src));
        fs.copyFileSync(asset.src, dest);
        console.log(`📎 Copied asset: ${dest}`);
      }
    }
  }

  const fileCount = countFiles(outputDir);
  console.log(`\n🎉 Presentation generated!`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Theme: ${theme}`);
  console.log(`   Transition: ${transition}`);
  console.log(`   Slides: ${(definition.slides || []).length}`);
  console.log(`   Files: ${fileCount}`);
  console.log(`\n💡 Preview locally: open ${indexPath} in a browser`);
  console.log(`💡 Deploy: node deploy.js ${outputDir} <site-name> <owner> --type presentation`);

  return { outputDir, indexPath, slideCount: (definition.slides || []).length, fileCount };
}

/**
 * Build HTML for all slides
 */
async function buildSlidesHtml(slides) {
  const results = [];
  for (const slide of slides) {
    if (slide.vertical) {
      const innerParts = [];
      for (const s of slide.vertical) {
        innerParts.push(await buildSlideHtml(s, 8));
      }
      results.push(`      <section>\n${innerParts.join('\n')}\n      </section>`);
    } else {
      results.push(await buildSlideHtml(slide, 6));
    }
  }
  return results.join('\n');
}

/**
 * Build HTML for a single slide
 */
async function buildSlideHtml(slide, indent) {
  const pad = ' '.repeat(indent);
  const attrs = [];

  if (slide.background) attrs.push(`data-background="${escapeHtml(slide.background)}"`);
  if (slide.backgroundImage) attrs.push(`data-background-image="${escapeHtml(slide.backgroundImage)}"`);
  if (slide.backgroundVideo) attrs.push(`data-background-video="${escapeHtml(slide.backgroundVideo)}"`);
  if (slide.backgroundIframe) attrs.push(`data-background-iframe="${escapeHtml(slide.backgroundIframe)}"`);
  if (slide.transition) attrs.push(`data-transition="${escapeHtml(slide.transition)}"`);
  if (slide.autoAnimate) attrs.push(`data-auto-animate`);
  if (slide.state) attrs.push(`data-state="${escapeHtml(slide.state)}"`);

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';

  // Handle different content types
  let content = '';

  if (slide.markdown) {
    // Markdown slide
    content = `${pad}  <section data-markdown>\n${pad}    <textarea data-template>\n${slide.markdown}\n${pad}    </textarea>\n${pad}  </section>`;
    return content;
  }

  if (slide.html) {
    // Raw HTML slide
    content = slide.html;
  } else {
    // Structured slide
    const parts = [];

    if (slide.title) {
      const titleTag = slide.titleSize === 'small' ? 'h3' : slide.titleSize === 'large' ? 'h1' : 'h2';
      parts.push(`${pad}  <${titleTag}>${slide.title}</${titleTag}>`);
    }

    if (slide.subtitle) {
      parts.push(`${pad}  <h4>${slide.subtitle}</h4>`);
    }

    // Handle text[] + animations[] schema (index-based: text[0], text[1], ...)
    if (slide.text) {
      const animMap = {};
      if (slide.animations) {
        for (const anim of slide.animations) {
          const fragIndex = anim.click !== undefined ? anim.click : 1;
          const rawEffect = anim.effect || 'fade-in';
          const effect = rawEffect.toLowerCase().includes('appear') ? 'fade-in' : rawEffect.toLowerCase().split(',')[0].trim() || 'fade-in';
          const elements = anim.element ? [anim.element] : (anim.elements || []);
          for (const ref of elements) {
            if (ref.startsWith('text[')) animMap[ref] = { fragmentIndex: fragIndex, effect };
          }
        }
      }
      for (let i = 0; i < slide.text.length; i++) {
        const rendered = String(slide.text[i])
          .replace(/<red>(.*?)<\/red>/g, '<span style="color:#e74c3c">$1</span>')
          .replace(/<green>(.*?)<\/green>/g, '<span style="color:#2ecc71">$1</span>');
        const anim = animMap[`text[${i}]`];
        if (anim) {
          parts.push(`${pad}  <p class="fragment ${anim.effect}" data-fragment-index="${anim.fragmentIndex}">${rendered}</p>`);
        } else {
          parts.push(`${pad}  <p>${rendered}</p>`);
        }
      }
    }

    if (slide.content) {
      if (typeof slide.content === 'string') {
        parts.push(`${pad}  <p>${slide.content}</p>`);
      } else if (Array.isArray(slide.content)) {
        for (const item of slide.content) {
          if (typeof item === 'string') {
            parts.push(`${pad}  <p>${item}</p>`);
          } else if (item.type === 'list') {
            const listItems = item.items.map(li => `${pad}      <li>${li}</li>`).join('\n');
            const tag = item.ordered ? 'ol' : 'ul';
            parts.push(`${pad}    <${tag}>\n${listItems}\n${pad}    </${tag}>`);
          } else if (item.type === 'code') {
            const lang = item.language || '';
            const dataLineNumbers = item.lineNumbers ? ` data-line-numbers="${item.lineNumbers}"` : '';
            parts.push(`${pad}    <pre><code class="language-${lang}" data-trim${dataLineNumbers}>\n${escapeHtml(item.code)}\n${pad}    </code></pre>`);
          } else if (item.type === 'image') {
            const imgAttrs = [];
            if (item.alt) imgAttrs.push(`alt="${escapeHtml(item.alt)}"`);
            if (item.width) imgAttrs.push(`width="${item.width}"`);
            if (item.height) imgAttrs.push(`height="${item.height}"`);
            parts.push(`${pad}    <img src="${escapeHtml(item.src)}" ${imgAttrs.join(' ')}>`);
          } else if (item.type === 'quote') {
            parts.push(`${pad}    <blockquote>${item.text}${item.cite ? `<br><small>— ${item.cite}</small>` : ''}</blockquote>`);
          } else if (item.type === 'fragment') {
            const fragClass = item.effect || 'fade-in';
            parts.push(`${pad}    <p class="fragment ${fragClass}">${item.text}</p>`);
          } else if (item.type === 'qr') {
            // QR code block — generates inline data URL or SVG
            const qrData = item.data || item.url || item.text || '';
            const qrSize = item.size || 300;
            const qrLabel = item.label || '';
            const qrDark = item.dark || '#000000';
            const qrLightRaw = item.light || '#FFFFFF';
            // Handle 'transparent' keyword — qrcode lib needs hex with alpha
            const qrLight = qrLightRaw === 'transparent' ? '#00000000' : qrLightRaw;
            try {
              const dataUrl = await generateQRDataUrl(qrData, {
                size: qrSize,
                dark: qrDark,
                light: qrLight,
                margin: item.margin !== undefined ? item.margin : 2
              });
              parts.push(`${pad}    <div class="qr-code" style="text-align:center;">`);
              parts.push(`${pad}      <img src="${dataUrl}" alt="QR: ${escapeHtml(qrData)}" width="${qrSize}" height="${qrSize}" style="image-rendering:pixelated;">`);
              if (qrLabel) {
                parts.push(`${pad}      <p style="font-size:0.6em;margin-top:0.3em;opacity:0.7;">${escapeHtml(qrLabel)}</p>`);
              }
              parts.push(`${pad}    </div>`);
            } catch (qrErr) {
              parts.push(`${pad}    <p style="color:red;">⚠️ QR generation failed: ${escapeHtml(qrErr.message)}</p>`);
            }
          }
        }
      }
    }

    if (slide.notes) {
      const notesHtml = Array.isArray(slide.notes) ? slide.notes.join('<br>') : slide.notes;
      parts.push(`${pad}  <aside class="notes">${notesHtml}</aside>`);
    }

    content = parts.join('\n');
  }

  return `${pad}<section${attrStr}>\n${content}\n${pad}</section>`;
}

/**
 * Parse Markdown into a presentation definition
 * Uses --- as slide separator and ---- as vertical slide separator
 */
function markdownToDefinition(markdownContent, options = {}) {
  const lines = markdownContent.split('\n');
  const slides = [];
  let currentSlide = [];
  let title = options.title || '';
  let author = options.author || '';

  // Extract front matter if present (simple YAML-like)
  let i = 0;
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const match = lines[i].match(/^(\w+):\s*(.+)/);
      if (match) {
        if (match[1] === 'title') title = match[2].trim();
        if (match[1] === 'author') author = match[2].trim();
      }
      i++;
    }
    i++; // skip closing ---
  }

  // Parse slides (--- separator)
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      if (currentSlide.length > 0) {
        slides.push({ markdown: currentSlide.join('\n').trim() });
        currentSlide = [];
      }
    } else {
      currentSlide.push(line);
    }
  }
  if (currentSlide.length > 0) {
    slides.push({ markdown: currentSlide.join('\n').trim() });
  }

  return { title, author, slides };
}

/**
 * Copy directory recursively
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) count += countFiles(path.join(dir, e.name));
    else count++;
  }
  return count;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generatePresentation, markdownToDefinition, AVAILABLE_THEMES, AVAILABLE_TRANSITIONS };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage:');
    console.error('  generate-presentation.js <definition.json> <output-dir> [options]');
    console.error('  generate-presentation.js --from-markdown <slides.md> <output-dir> [options]');
    console.error('');
    console.error('Options:');
    console.error(`  --theme <name>         Theme (${AVAILABLE_THEMES.join(', ')})`);
    console.error(`  --transition <type>    Transition (${AVAILABLE_TRANSITIONS.join(', ')})`);
    console.error('  --title <title>        Presentation title');
    console.error('  --author <name>        Author name');
    console.error('  --auto-slide <ms>      Auto-advance (milliseconds)');
    process.exit(1);
  }

  // Parse args
  const fromMarkdown = args.includes('--from-markdown');
  const fileIdx = fromMarkdown ? args.indexOf('--from-markdown') + 1 : 0;
  const outIdx = fileIdx + 1;
  const inputFile = args[fileIdx];
  const outputDir = args[outIdx];

  const getOpt = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const options = {
    theme: getOpt('--theme') || 'black',
    transition: getOpt('--transition') || 'slide',
    title: getOpt('--title') || undefined,
    author: getOpt('--author') || undefined,
    autoSlide: getOpt('--auto-slide') ? parseInt(getOpt('--auto-slide')) : 0
  };

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  let definition;
  if (fromMarkdown) {
    const md = fs.readFileSync(inputFile, 'utf8');
    definition = markdownToDefinition(md, options);
  } else {
    definition = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  }

  if (options.title) definition.title = options.title;
  if (options.author) definition.author = options.author;

  try {
    generatePresentation(definition, outputDir, options);
  } catch (err) {
    console.error(`❌ Generation failed: ${err.message}`);
    process.exit(1);
  }
}
