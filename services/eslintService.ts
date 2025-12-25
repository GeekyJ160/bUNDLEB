import { Linter } from 'eslint';

const linter = new Linter();

export const performStaticLint = (code: string) => {
  try {
    // Basic browser-friendly ESLint configuration
    const config: any = {
      rules: {
        'no-unused-vars': 'warn',
        'no-undef': 'error',
        'no-console': 'warn',
        'semi': ['error', 'always'],
        'eqeqeq': 'warn',
        'curly': 'error',
        'no-debugger': 'error',
        'no-const-assign': 'error',
        'no-dupe-keys': 'error',
      },
      env: {
        browser: true,
        es6: true,
      },
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    };

    const messages = linter.verify(code, config);
    return messages;
  } catch (error) {
    console.error('ESLint execution failed:', error);
    return [];
  }
};