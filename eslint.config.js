const js = require("@eslint/js");
const globals = require("globals");
const html = require("eslint-plugin-html");

module.exports = [
  { ignores: ["node_modules/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  { files: ["public/**/*.html"], plugins: { html }, languageOptions: { globals: globals.browser } },
  {
    files: ["tests/**/*.js", "*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.browser } },
  },
];
