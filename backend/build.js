const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const { minify: minifyJS } = require('terser');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const CSS_DIR = path.join(FRONTEND, 'css');
const JS_DIR = path.join(FRONTEND, 'js');

async function build() {
  // Minify CSS
  const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css') && !f.endsWith('.min.css'));
  for (const file of cssFiles) {
    const input = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
    const minified = new CleanCSS({ level: 2 }).minify(input);
    const outName = file.replace('.css', '.min.css');
    fs.writeFileSync(path.join(CSS_DIR, outName), minified.styles, 'utf8');
    console.log(`[Build] CSS: ${file} → ${outName} (${(Buffer.byteLength(input)/1024).toFixed(1)}KB → ${(minified.styles.length/1024).toFixed(1)}KB)`);
  }

  // Minify JS
  const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));
  for (const file of jsFiles) {
    const input = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    const result = await minifyJS(input, { compress: { passes: 2 } });
    const outName = file.replace('.js', '.min.js');
    fs.writeFileSync(path.join(JS_DIR, outName), result.code, 'utf8');
    console.log(`[Build] JS: ${file} → ${outName} (${(Buffer.byteLength(input)/1024).toFixed(1)}KB → ${(result.code.length/1024).toFixed(1)}KB)`);
  }

  // Update index.html to reference minified assets
  const htmlPath = path.join(FRONTEND, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/href="css\/style\.css"/g, 'href="css/style.min.css"');
  html = html.replace(/href="css\/stitch_templates\.css"/g, 'href="css/stitch_templates.min.css"');
  html = html.replace(/src="js\/app\.js"/g, 'src="js/app.min.js"');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('[Build] index.html updated to use minified assets');
}

build().catch(console.error);
