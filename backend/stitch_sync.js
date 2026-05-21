const fs = require('fs');
const path = require('path');

// Target paths for generated CSS and JSON configurations
const STITCH_CSS_PATH = path.join(__dirname, '..', 'frontend', 'css', 'stitch_templates.css');
const STITCH_JSON_PATH = path.join(__dirname, 'data', 'stitch_tokens.json');

// Default premium theme tokens synced from Stitch design specifications
const DEFAULT_STITCH_TOKENS = {
  themes: [
    {
      id: "obsidian-aurora",
      name: "Obsidian Aurora",
      description: "Deep galactic charcoal with glowing neon auroral green highlights and frosted-glass layers.",
      colors: {
        background: "oklch(12% 0.015 285)",
        surface: "oklch(16% 0.02 285 / 0.7)",
        border: "oklch(25% 0.03 285 / 0.5)",
        primary: "oklch(78% 0.15 160)",
        primaryGlow: "oklch(78% 0.15 160 / 0.15)",
        secondary: "oklch(65% 0.12 210)",
        text: "oklch(93% 0.01 285)",
        textMuted: "oklch(70% 0.015 285)"
      },
      typography: {
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        headingWeight: "700",
        bodyWeight: "400"
      },
      effects: {
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px 0 oklch(0% 0 0 / 0.3)",
        borderRadius: "16px"
      }
    },
    {
      id: "nebula-fusion",
      name: "Nebula Fusion",
      description: "A cosmic fusion of deep stellar violets and cybernetic magenta accent glows.",
      colors: {
        background: "oklch(10% 0.025 295)",
        surface: "oklch(14% 0.035 295 / 0.75)",
        border: "oklch(22% 0.05 310 / 0.4)",
        primary: "oklch(70% 0.22 330)",
        primaryGlow: "oklch(70% 0.22 330 / 0.2)",
        secondary: "oklch(62% 0.18 260)",
        text: "oklch(95% 0.008 295)",
        textMuted: "oklch(72% 0.015 295)"
      },
      typography: {
        fontFamily: "'Space Grotesk', 'Plus Jakarta Sans', system-ui, sans-serif",
        headingWeight: "800",
        bodyWeight: "400"
      },
      effects: {
        backdropFilter: "blur(24px)",
        boxShadow: "0 12px 40px 0 oklch(270% 0.15 290 / 0.15)",
        borderRadius: "20px"
      }
    },
    {
      id: "cyber-quartz",
      name: "Cyber Quartz (Frosted Light)",
      description: "A high-fidelity frosted quartz light mode with sharp contrasts and premium neo-brutalist accents.",
      colors: {
        background: "oklch(96% 0.005 240)",
        surface: "oklch(100% 0 0 / 0.7)",
        border: "oklch(85% 0.01 240 / 0.8)",
        primary: "oklch(35% 0.1 260)",
        primaryGlow: "oklch(35% 0.1 260 / 0.08)",
        secondary: "oklch(45% 0.08 300)",
        text: "oklch(20% 0.01 240)",
        textMuted: "oklch(48% 0.01 240)"
      },
      typography: {
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        headingWeight: "700",
        bodyWeight: "400"
      },
      effects: {
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 30px 0 oklch(240% 0.02 240 / 0.05)",
        borderRadius: "12px"
      }
    }
  ]
};

/**
 * Ensures the target file directory exists
 */
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

/**
 * Generate CSS stylesheet containing Stitch utility tokens and variables
 * @param {Object} tokens 
 */
function writeCSSStylesheet(tokens) {
  let cssContent = `/* 
  Stitch Dynamic Design System Templates
  AUTOMATICALLY GENERATED - DO NOT MODIFY DIRECTLY
*/

:root {
  /* Default Global Base Styles */
  --transition-smooth: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Space Grotesk', sans-serif;
}
\n`;

  tokens.themes.forEach(theme => {
    cssContent += `/* ==========================================================================
   Theme: ${theme.name} (${theme.id})
   ========================================================================== */
[data-portfolio-theme="${theme.id}"] {
  --bg-primary: ${theme.colors.background};
  --bg-surface: ${theme.colors.surface};
  --border-color: ${theme.colors.border};
  --accent-primary: ${theme.colors.primary};
  --accent-primary-glow: ${theme.colors.primaryGlow};
  --accent-secondary: ${theme.colors.secondary};
  --text-primary: ${theme.colors.text};
  --text-muted: ${theme.colors.textMuted};
  
  --font-family: ${theme.typography.fontFamily};
  --font-weight-heading: ${theme.typography.headingWeight};
  --font-weight-body: ${theme.typography.bodyWeight};
  
  --backdrop-blur: ${theme.effects.backdropFilter};
  --card-shadow: ${theme.effects.boxShadow};
  --radius-standard: ${theme.effects.borderRadius};
}
\n`;
  });

  ensureDirectoryExistence(STITCH_CSS_PATH);
  fs.writeFileSync(STITCH_CSS_PATH, cssContent, 'utf8');
  console.log(`[Stitch Sync] CSS Stylesheet successfully generated at ${STITCH_CSS_PATH}`);
}

/**
 * Write token configuration JSON for dynamic dashboard reads
 * @param {Object} tokens 
 */
function writeTokenJSON(tokens) {
  ensureDirectoryExistence(STITCH_JSON_PATH);
  fs.writeFileSync(STITCH_JSON_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  console.log(`[Stitch Sync] Token JSON successfully updated at ${STITCH_JSON_PATH}`);
}

/**
 * Synchronize design tokens. If new tokens are fetched via MCP, they merge/overwrite defaults.
 * @param {Object} newTokens 
 */
function syncTokens(newTokens = null) {
  let activeTokens = { ...DEFAULT_STITCH_TOKENS };
  
  if (newTokens && Array.isArray(newTokens.themes)) {
    console.log('[Stitch Sync] Custom design tokens detected. Merging specifications...');
    activeTokens.themes = newTokens.themes;
  }

  try {
    writeCSSStylesheet(activeTokens);
    writeTokenJSON(activeTokens);
    return { success: true, count: activeTokens.themes.length };
  } catch (error) {
    console.error('[Stitch Sync] Synchronization failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Automatically sync on execution
syncTokens();

module.exports = {
  syncTokens,
  DEFAULT_STITCH_TOKENS
};
