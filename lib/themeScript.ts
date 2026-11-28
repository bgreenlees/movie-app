// The inline script in app/layout.tsx that applies a saved theme before paint. With
// no choice saved, there's no data-theme and globals.css follows prefers-color-scheme.
//
// It lives here so the page CSP can allow it by its SHA-256 hash (lib/securityHeaders.ts)
// instead of 'unsafe-inline'. The hash is computed from this exact string, so editing
// the script updates the policy automatically.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

let themeScriptHash: Promise<string> | undefined;

/**
 * The CSP source for THEME_SCRIPT, e.g. `'sha256-…'`. Uses Web Crypto so it works in
 * middleware whichever runtime (Edge or Node.js) it runs on. Computed once per instance.
 */
export function themeScriptHashSource(): Promise<string> {
  themeScriptHash ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(THEME_SCRIPT))
    .then((digest) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
  return themeScriptHash;
}
