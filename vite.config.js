import {defineConfig} from 'vite';

const contentPolicy=[
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

export default defineConfig({
  base: './',
  build: {
    license: {fileName: 'third-party-notices.md'}
  },
  plugins: [{
    name: 'viewer-content-policy',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: {'http-equiv': 'Content-Security-Policy', content: contentPolicy},
      injectTo: 'head-prepend'
    }]
  }]
});
