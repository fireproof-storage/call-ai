# Test List

## schema-result.test.ts

Tests structured data responses using schema definitions with different AI models.

- **OpenAI schema test**: ✅ PASS - Successfully returns valid structured data with schema
- **Claude schema test**: ❌ FAIL - Timeout after 30 seconds
- **OpenAI tool mode test**: ✅ PASS - Successfully supports tool mode when enabled

## schema-handling.test.ts

Tests schema handling strategies across different AI models.

- **Schema implementation method test**: ❌ FAIL - Error reading json property from undefined
- **Model-specific schema strategies test**: ✅ PASS - All models successfully use their optimal schema approach by default

## callai.integration.test.ts

Integration tests across multiple AI providers with various request types.

- **OpenAI streaming tests**: ✅ PASS - Successfully streams structured data responses
- **Claude tool mode tests**: ❌ PARTIAL - Warning about streaming with tool mode
- **DeepSeek tests**: ✅ PASS - Successfully returns structured data
- **Gemini tests**: ✅ PASS - Successfully streams and returns structured data
- **Llama3 tests**: ✅ PASS - Returns structured data correctly
- **GPT-4o json_schema test**: ❌ FAIL - API error with required schema fields
- **Various model system message tests**: ✅ PASS - All tested models handle system messages correctly

## openai-wire.test.ts

Tests for OpenAI API wire protocol implementation.

- **JSON schema request formatting**: ✅ PASS - Correctly formats OpenAI JSON schema requests
- **JSON schema response handling**: ✅ PASS - Correctly handles OpenAI responses with JSON schema
- **JSON schema streaming**: ✅ PASS - Correctly handles OpenAI streaming with JSON schema
- **GPT-4o schema handling**: ✅ PASS - Uses JSON schema format for GPT-4o with schema handling
- **OpenAI tool mode support**: ✅ PASS - Supports tool mode for OpenAI models when enabled

## openai-tool-integration.test.ts

Tests integration of schema handling with OpenAI and Claude APIs.

- **Claude structured data test**: ❌ FAIL - Timeout after 30 seconds
- **OpenAI structured data test**: ✅ PASS - Successfully returns structured data with schema
- **OpenAI useToolMode test**: ✅ PASS - Successfully returns valid structured data with tool mode option

## unit.test.ts

Unit tests for the core functions of the callAi library.

- **API key requirement tests**: ✅ PASS - Properly handles API key requirements for both streaming and non-streaming
- **Request parameter tests**: ✅ PASS - Correctly formats POST request parameters
- **Schema handling tests**: ✅ PASS - Correctly processes various schema formats and structures
- **Error handling tests**: ✅ PASS - Properly handles errors during API calls
- **Streaming tests**: ✅ PASS - Correctly implements streaming functionality with schemas

## gemini-wire.test.ts

Tests for Gemini API wire protocol implementation.

- **JSON schema format test**: ✅ PASS - Uses JSON schema format by default for Gemini with schema
- **Response handling test**: ✅ PASS - Correctly handles Gemini responses with schema
- **System messages test**: ✅ PASS - Correctly passes through system messages
- **System message response test**: ✅ PASS - Correctly handles responses with system messages
- **Response format schema test**: ✅ PASS - Correctly handles schema when response_format is supported

## claude-wire.test.ts

Tests for Claude API wire protocol implementation.

- **System message approach test**: ❌ FAIL - Expected system message role but got user role
- **Tool mode test**: ✅ PASS - Uses native tool mode with Claude for schema handling
- **JSON response handling test**: ✅ PASS - Correctly handles Claude JSON responses
- **Schema response handling test**: ✅ PASS - Correctly handles Claude responses with schema
- **System message passing test**: ✅ PASS - Correctly passes through system messages
- **System message response test**: ✅ PASS - Correctly handles Claude responses with system message

## llama3-wire.test.ts

Tests for Llama3 API wire protocol implementation.

- **System message approach test**: ✅ PASS - Uses system message approach for Llama3 with schema
- **Response handling test**: ✅ PASS - Correctly handles Llama3 responses with schema

## gpt4turbo-wire.test.ts

Tests for GPT-4 Turbo API wire protocol implementation.

- **System message approach test**: ✅ PASS - Uses system message approach for GPT-4 Turbo with schema
- **Response handling test**: ✅ PASS - Correctly handles GPT-4 Turbo responses with schema

## deepseek-wire.test.ts

Tests for DeepSeek API wire protocol implementation.

- **System message approach test**: ✅ PASS - Uses system message approach for DeepSeek with schema
- **Response handling test**: ✅ PASS - Correctly handles DeepSeek responses with schema

## openai-weather-wire.test.ts

Tests for OpenAI weather wire protocol implementation with complex schemas.

- **JSON schema format test**: ✅ PASS - Successfully formats complex nested schema for weather forecasts

## fetch.integration.test.ts

Integration tests for direct API calls using fetch.

- **OpenRouter schema format test**: ✅ PASS - Validates exact OpenRouter schema format
- **OpenAI structured output test**: ✅ PASS - Correctly formats schema for OpenAI structured output
- **Schema formatting debug test**: ✅ PASS - Debugs exact schema format sent to OpenRouter
- **Streaming test**: ✅ PASS - Handles streaming with schema format correctly
- **Streaming debug test**: ✅ PASS - Debugs detailed streaming response for OpenAI
- **Claude 3.5 JSON schema test**: ✅ PASS - Validates JSON schema format with Claude 3.5
- **Claude 3.5 prompt test**: ✅ PASS - Handles JSON output with Claude 3.5 using prompt engineering
- **Gemini prompt test**: ✅ PASS - Handles JSON output with Google Gemini using prompt engineering
- **Gemini JSON schema test**: ✅ PASS - Successfully uses JSON schema format with Google Gemini

## claude-tool-test.js and claude-tool-direct.js

Manual test scripts for Claude tool mode direct API calls.

- **Not Jest test files**: ⚠️ NOTE - These are manual test scripts, not automated tests
