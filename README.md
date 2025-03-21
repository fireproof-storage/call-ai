# call-ai

A lightweight library for making AI API calls with streaming support.

## Installation

```bash
npm install call-ai
# or
yarn add call-ai
# or
pnpm add call-ai
```

## Usage

```typescript
import { callAI } from 'call-ai';

// Basic usage with string prompt (non-streaming by default)
const response = await callAI('Explain quantum computing in simple terms', null, {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

// The response is the complete text
console.log(response);

// With streaming enabled (returns an AsyncGenerator)
const generator = callAI('Tell me a story', null, {
  apiKey: 'your-api-key',
  model: 'gpt-4',
  stream: true
});

// Process streaming updates
for await (const chunk of generator) {
  console.log(chunk); // Streaming updates as they arrive
}

// Using message array for more control
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Explain quantum computing in simple terms' }
];

const response = await callAI(messages, null, {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

console.log(response);

// Using schema for structured output
const schema = {
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'summary']
};

const response = await callAI('Summarize the benefits of exercise', schema, {
  apiKey: 'your-api-key'
});

const structuredOutput = JSON.parse(response);
console.log(structuredOutput.title);
```

## Features

- 🔄 Streaming responses via AsyncGenerator when `stream: true`
- 🧩 Structured JSON outputs with schema validation
- 🔌 Compatible with OpenRouter and OpenAI API formats
- 📝 Support for message arrays with system, user, and assistant roles
- 🔧 TypeScript support with full type definitions
- ✅ Works in Node.js and browser environments

## Supported LLM Providers

By default, call-ai uses the OpenRouter API which provides access to multiple LLM models. You can also configure it to use other providers with OpenAI-compatible APIs:

- [OpenRouter](https://openrouter.ai/) (default)
- [OpenAI](https://openai.com/)
- [Anthropic Claude](https://www.anthropic.com/) (via OpenRouter)
- [Mistral](https://mistral.ai/) (via OpenRouter)
- Any API with OpenAI-compatible endpoints

See [llms.txt](./llms.txt) for a full list of compatible models.

## Setting API Keys

You can provide your API key in three ways:

1. Directly in the options:
```typescript
const response = await callAI('Hello', null, { apiKey: 'your-api-key' });
```

2. Set globally in the browser:
```typescript
window.CALLAI_API_KEY = 'your-api-key';
const response = await callAI('Hello');
```

3. Use environment variables in Node.js (with a custom implementation):
```typescript
// Example of environment variable integration
import { callAI } from 'call-ai';
const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
const response = await callAI('Hello', null, { apiKey });
```

## API

```typescript
// Main function
function callAI(
  prompt: string | Message[],
  schema: Schema | null = null,
  options: Record<string, any> = {}
): Promise<string> | AsyncGenerator<string, string, unknown>

// Types
type Message = {
  role: 'user' | 'system' | 'assistant';
  content: string;
};

interface Schema {
  name?: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}
```

### Options

* `apiKey`: Your API key (can also be set via window.CALLAI_API_KEY)
* `model`: Model identifier (default: 'openrouter/auto')
* `endpoint`: API endpoint (default: 'https://openrouter.ai/api/v1/chat/completions')
* `stream`: Enable streaming responses (default: false)
* Any other options are passed directly to the API (temperature, max_tokens, etc.)

## License

MIT or Apache-2.0, at your option