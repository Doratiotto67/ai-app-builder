export { 
  validateImports, 
  generateComponentStub, 
  validateAndCompleteFiles,
  type ExtractedFile,
  type ImportValidationResult,
  type MissingImport,
} from './validate-imports';

export {
  fixJSXSyntax,
  validateAndFixFile,
  fixAllFiles,
  type SyntaxFixResult,
} from './syntax-fixer';

