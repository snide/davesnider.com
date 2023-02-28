module.exports = {
  tabWidth: 2,
  singleQuote: true,
  semi: true,
  trailingComma: "none",
  printWidth: 120,
  endOfLine: "auto",
  organizeImportsSkipDestructiveCodeActions: true,
  plugins: [require.resolve("prettier-plugin-astro")],
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
};
