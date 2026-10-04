// Module workers and WebAssembly must reach S3 rather than the SPA document.
export const spaRewriteCode = "function handler(event) { var r = event.request; if (!/\\.(m?js|css|html|json|png|jpe?g|gif|svg|ico|txt|pdf|map|wasm|woff2?|webmanifest)$/i.test(r.uri)) { r.uri = '/index.html'; } return r; }";
