# Changelog

## 0.10.0 (2025-05-13)

### Changes

- Renamed `callAI` to `callAi` for consistent casing across the library
- Added backward compatibility export to support existing code using `callAI` spelling
- Added tests to ensure backward compatibility works correctly

## 0.5.0 (2024-06-28)

### Features

- Added comprehensive multi-model support for structured JSON output
- Implemented model-specific strategies for different AI providers:
  - OpenAI/GPT models use native JSON schema support
  - Claude models use tool mode for structured output
  - Gemini models with optimized JSON schema handling
  - System message approach for Llama, DeepSeek and other models
- Added automatic strategy selection based on model type and schema requirements
- Improved streaming support with model-specific adaptations
- Enhanced error handling and response processing for various API formats
- Added recursive handling of nested properties in schemas

## 0.4.1 (2024-06-22)

### Fixes

- Improved error handling for both streaming and non-streaming API calls
- Added better error response format consistency
- Addressed TypeScript type issues in tests
- Enhanced test coverage for error conditions

## 0.4.0 (2024-06-22)

### Features

- Added default "result" name for all JSON schemas
- Improved test coverage for schema name handling
- Enhanced documentation for schema name property
- Ensured OpenRouter compatibility with standardized schema format

## 0.3.1 (2024-06-22)

### Improvements

- Added proper support for schema name property in OpenRouter JSON schemas
- Updated documentation to clarify that name is optional but supported
- Ensured examples in documentation consistently show name usage
- Improved JSDoc for Schema interface

## 0.3.0 (2024-06-22)

### Bug Fixes

- Fixed JSON schema structure for OpenRouter API integration
- Removed unnecessary nested `schema` object within the JSON schema
- Removed `provider.require_parameters` field which was causing issues
- Flattened the schema structure to match OpenRouter's expected format
- Improved test assertions to validate the correct schema structure

## 0.2.1 (2024-06-17)

### Improvements

- Enhanced schema handling to better support JSON schema definition
- Added test coverage for complex schema use cases
- Updated documentation with comprehensive examples for structured responses
- Added aliens schema example to show more complex schema usage

## 0.2.0 (2024-06-16)

### Breaking Changes

- Simplified API by moving `schema` parameter into the options object
- Changed streaming to be explicitly opt-in (default is non-streaming)
- Updated return type to be `Promise<string>` for non-streaming and `AsyncGenerator` for streaming
- Removed need for `null` parameter when not using schema

### Improvements

- Improved TypeScript types and documentation
- Reduced code duplication by extracting common request preparation logic
- Enhanced error handling for both streaming and non-streaming modes
- Updated documentation in both README and llms.txt
- Better developer experience with a cleaner API signature

## 0.1.5 (2024-03-20)

- Initial release
- Support for streaming responses
- JSON schema for structured output
- Compatible with OpenRouter and OpenAI API
