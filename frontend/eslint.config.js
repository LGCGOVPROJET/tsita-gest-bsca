import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML est interdit.' },
        { selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]", message: 'innerHTML/outerHTML interdits (XSS).' },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'insertAdjacentHTML interdit (XSS).' },
        { selector: "NewExpression[callee.name='Function']", message: 'new Function interdit.' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'localStorage', message: 'Aucun stockage local de données sensibles (auth par cookie).' },
        { object: 'sessionStorage', message: 'Aucun stockage de session navigateur (codes de suivi, jetons).' },
        { object: 'document', property: 'write', message: 'document.write interdit.' },
      ],
    },
  },
);
