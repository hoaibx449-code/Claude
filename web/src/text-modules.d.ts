// prompt files bundled as text by wrangler (wrangler.jsonc "rules")
declare module '*.md' { const text: string; export default text; }
