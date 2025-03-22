import { callAI, Schema } from '../src/index';

describe('Schema Handling Tests', () => {
  // Mock fetch to use our fixture files
  global.fetch = jest.fn();
  
  beforeEach(() => {
    // Reset mocks
    (global.fetch as jest.Mock).mockClear();
    
    // Mock successful response
    (global.fetch as jest.Mock).mockImplementation(async (url, options) => {
      // Simulate successful API response with valid JSON
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"title": "Test Book", "author": "Test Author", "year": 2023}' } }]
        }),
        json: async () => ({
          choices: [{ message: { content: '{"title": "Test Book", "author": "Test Author", "year": 2023}' } }]
        })
      };
    });
  });
  
  it.concurrent('should handle schema regardless of implementation method', async () => {
    console.log('🧪 Testing schema handling across different models');
    // Define schema
    const schema: Schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' }
      }
    };
    
    // Test with different models and options
    const testCases = [
      // Claude model (default to tool mode)
      {
        name: 'Claude (tool mode)',
        model: 'anthropic/claude-3-sonnet',
        options: {}
      },
      // OpenAI model (default to JSON schema)
      {
        name: 'OpenAI (JSON schema)',
        model: 'openai/gpt-4o',
        options: {}
      },
      // GPT-4 Turbo (system message)
      {
        name: 'GPT-4 Turbo (system message)',
        model: 'openai/gpt-4-turbo',
        options: {}
      }
      // Commenting out the useToolMode test until it's implemented
      // {
      //   name: 'OpenAI (tool mode)',
      //   model: 'openai/gpt-4o',
      //   options: { useToolMode: true }
      // }
    ];
    
    // Run each test case
    for (const testCase of testCases) {
      console.log(`⏳ Testing ${testCase.name}...`);
      // Call the API with the model and options
      const result = await callAI(
        'Give me a book recommendation',
        {
          apiKey: 'test-api-key',
          model: testCase.model,
          schema: schema,
          ...testCase.options
        }
      );
      
      // Check the request format
      expect(global.fetch).toHaveBeenCalled();
      
      // Get request parameters
      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[(global.fetch as jest.Mock).mock.calls.length - 1][1].body
      );
      
      // Verify schema is included in some form
      if (requestBody.tools) {
        // Tool mode approach
        console.log(`✓ ${testCase.name} - Using tool mode approach`);
        expect(requestBody.tools.length).toBeGreaterThan(0);
        const tool = requestBody.tools[0];
        expect(tool.input_schema).toBeTruthy();
        expect(tool.input_schema.properties).toBeTruthy();
        
        // Schema properties should be included
        expect(tool.input_schema.properties.title).toBeTruthy();
        expect(tool.input_schema.properties.author).toBeTruthy();
        expect(tool.input_schema.properties.year).toBeTruthy();
      } else if (requestBody.response_format && requestBody.response_format.json_schema) {
        // JSON schema approach
        console.log(`✓ ${testCase.name} - Using JSON schema approach`);
        expect(requestBody.response_format.type).toBe('json_schema');
        expect(requestBody.response_format.json_schema.schema).toBeTruthy();
        expect(requestBody.response_format.json_schema.schema.properties).toBeTruthy();
        
        // Schema properties should be included
        expect(requestBody.response_format.json_schema.schema.properties.title).toBeTruthy();
        expect(requestBody.response_format.json_schema.schema.properties.author).toBeTruthy();
        expect(requestBody.response_format.json_schema.schema.properties.year).toBeTruthy();
      } else {
        // System message approach
        console.log(`✓ ${testCase.name} - Using system message approach`);
        const systemMessage = requestBody.messages.find((m: any) => m.role === 'system');
        expect(systemMessage).toBeTruthy();
        expect(systemMessage.content).toContain('title');
        expect(systemMessage.content).toContain('author');
        expect(systemMessage.content).toContain('year');
      }
      
      // Verify the result is properly processed
      expect(result).toBeTruthy();
      
      if (typeof result === 'string') {
        const data = JSON.parse(result);
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('author');
        expect(data).toHaveProperty('year');
      }
      
      console.log(`✅ ${testCase.name} - Test passed`);
    }
  });
  
  it.concurrent('should allow models to use their optimal schema approach by default', async () => {
    console.log('🧪 Testing model-specific schema strategies');
    // Define schema
    const schema: Schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' }
      }
    };
    
    // Test Claude (should use tool mode)
    console.log('⏳ Testing Claude default strategy...');
    await callAI(
      'Give me a book recommendation',
      {
        apiKey: 'test-api-key',
        model: 'anthropic/claude-3-sonnet',
        schema: schema
      }
    );
    
    // Get request parameters for Claude
    const claudeRequest = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[(global.fetch as jest.Mock).mock.calls.length - 1][1].body
    );
    
    // Should use tool mode approach
    expect(claudeRequest.tools).toBeTruthy();
    expect(claudeRequest.tool_choice).toBeTruthy();
    console.log('✓ Claude uses tool mode by default');
    
    // Test GPT-4o (should use JSON schema)
    console.log('⏳ Testing GPT-4o default strategy...');
    await callAI(
      'Give me a book recommendation',
      {
        apiKey: 'test-api-key',
        model: 'openai/gpt-4o',
        schema: schema
      }
    );
    
    // Get request parameters for GPT-4o
    const gptRequest = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[(global.fetch as jest.Mock).mock.calls.length - 1][1].body
    );
    
    // Should use JSON schema approach
    expect(gptRequest.response_format).toBeTruthy();
    expect(gptRequest.response_format.type).toBe('json_schema');
    console.log('✓ GPT-4o uses JSON schema by default');
    
    // Test GPT-4 Turbo (should use system message)
    console.log('⏳ Testing GPT-4 Turbo default strategy...');
    await callAI(
      'Give me a book recommendation',
      {
        apiKey: 'test-api-key',
        model: 'openai/gpt-4-turbo',
        schema: schema
      }
    );
    
    // Get request parameters for GPT-4 Turbo
    const gpt4TurboRequest = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[(global.fetch as jest.Mock).mock.calls.length - 1][1].body
    );
    
    // System message should contain schema info
    const systemMessage = gpt4TurboRequest.messages.find((m: any) => m.role === 'system');
    expect(systemMessage).toBeTruthy();
    expect(systemMessage.content).toContain('title');
    expect(systemMessage.content).toContain('author');
    expect(systemMessage.content).toContain('year');
    console.log('✓ GPT-4 Turbo uses system message by default');
    
    console.log('✅ All model strategy tests passed');
  });
}); 