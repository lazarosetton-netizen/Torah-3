import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
export default [
  {
    ignores: ['dist/**/*'] // make sure to include this line to ignore all build files
  },
  firebaseRulesPlugin.configs['flat/recommended']
]
