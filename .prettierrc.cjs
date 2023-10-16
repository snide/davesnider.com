module.exports = {
  tabWidth: 2,
  singleQuote: true,
  semi: true,
  trailingComma: 'none',
  printWidth: 120,
  endOfLine: 'auto',
  organizeImportsSkipDestructiveCodeActions: true,
  plugins: [require.resolve('prettier-plugin-astro'), require.resolve('prettier-plugin-svelte')],
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro'
      }
    },
    {
      files: '*.svelte',
      options: {
        parser: 'svelte'
      }
    }
  ]
};
