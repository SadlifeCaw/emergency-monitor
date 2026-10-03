import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'state/**',
      // Hentede skills er tredjepartsmateriale (bl.a. p5.js-eksempler).
      // De laeses af agenten, ikke af vores byggekaede.
      '.claude/skills/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Husreglen om immutabilitet: motoren maa aldrig mutere sit input.
      'no-param-reassign': ['error', { props: true }],
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `const { [id]: _fjernet, ...rest } = objekt` er den maade en noegle
        // fjernes uden mutation. Bindingen bruges aldrig; det er pointen.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      complexity: ['warn', 12],
      'max-lines-per-function': ['warn', 50],
      'max-lines': ['warn', 400],
      'max-depth': ['warn', 4],
    },
  },
  {
    /*
     * Tilstandsbaerende fabrikker - sproget ville normalt bruge en klasse.
     * Reglen om funktionslaengde er skrevet mod funktioner, der goer for meget;
     * her er hver enkelt hjaelper 5-15 linjer, og laengden kommer af, at de bor
     * i den samme lukning som den tilstand, de aendrer. At bryde dem op
     * yderligere ville kraeve mutation af parametre, som en anden husregel
     * forbyder med god grund.
     *
     * Undtagelsen gaelder kun de to filer. Alle andre steder haandhaeves
     * graensen, og den har fanget rigtige problemer undervejs.
     */
    files: [
      'server/src/drift/natvagt.ts',
      'admin/src/alarmpanel.ts',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // Tegnelaget. `no-param-reassign` findes for at beskytte domaenedata mod
    // utilsigtet mutation - og den regel haandhaeves stadig i motoren, hvor den
    // betyder noget. Men et DOM-element og en CanvasRenderingContext2D ER
    // foranderlige tegneflader; at saette ctx.fillStyle eller element.className
    // er selve API'et. Reglen staar af her, eksplicit og afgraenset.
    files: [
      'display/src/paneler/**/*.ts',
      'display/src/kort/sweep.ts',
      'admin/src/langtryk.ts',
      'display/src/glitch.ts',
      'admin/src/alarmpanel.ts',
    ],
    rules: { 'no-param-reassign': 'off' },
  },
  {
    files: ['**/test/**', '**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-lines': 'off' },
  },
);
