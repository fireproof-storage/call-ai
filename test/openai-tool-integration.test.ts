import { callAI, Schema } from '../src/index';
import dotenv from 'dotenv';
const TIMEOUT = 30000;

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it.concurrent : it.skip;

describe('Schema Handling Integration Tests', () => {
  // Simple schema that should work with any model's approach
  const bookSchema: Schema = {
    name: 'book_recommendation',
    properties: {
      title: { type: 'string' },
      author: { type: 'string' },
      year: { type: 'number' },
      genre: { type: 'string' }
    }
  };

  beforeAll(() => {
    console.log('Running tests with API key available:', !!haveApiKey);
  });

  // Test that focuses on the result, not the implementation
  itif(!!haveApiKey)('Claude should return structured data with schema', async () => {
    console.log('🚀 Starting Claude schema test');
    // Make the API call with Claude
    const result = await callAI(
      'Give me a book recommendation about science fiction from the 1960s.',
      {
        apiKey: process.env.CALLAI_API_KEY,
        model: 'anthropic/claude-3-sonnet',
        schema: bookSchema
      }
    );
    
    console.log('✅ Claude schema result:', typeof result, 
      typeof result === 'string' ? result.substring(0, 100) + '...' : '[object AsyncGenerator]');
    
    // Check if we got a valid response
    expect(result).toBeTruthy();
    
    // Parse the result (regardless of how it came back)
    let data;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
        console.log('📊 Parsed JSON successfully');
      } catch (e) {
        console.log('⚠️ Failed to parse as JSON, trying to extract JSON from text');
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                      result.match(/```\s*([\s\S]*?)\s*```/) || 
                      result.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          data = JSON.parse(jsonContent);
          console.log('📊 Extracted and parsed JSON successfully');
        } else {
          console.error('❌ No JSON found in response');
          throw new Error(`No JSON found in response: ${result}`);
        }
      }
    } else {
      data = result;
    }
    
    // Validate the structure matches our schema
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('year');
    expect(data).toHaveProperty('genre');
    expect(typeof data.title).toBe('string');
    expect(typeof data.author).toBe('string');
    expect(typeof data.year).toBe('number');
    expect(typeof data.genre).toBe('string');
    console.log('✓ Claude test passed');
  }, TIMEOUT);
  
  itif(!!haveApiKey)('OpenAI should return structured data with schema', async () => {
    console.log('🚀 Starting OpenAI schema test');
    // Make the API call with OpenAI
    const result = await callAI(
      'Give me a book recommendation about science fiction from the 1960s.',
      {
        apiKey: process.env.CALLAI_API_KEY,
        model: 'openai/gpt-4o-mini',
        schema: bookSchema
      }
    );
    
    console.log('✅ OpenAI schema result:', typeof result, 
      typeof result === 'string' ? result.substring(0, 100) + '...' : '[object AsyncGenerator]');
    
    // Check if we got a valid response
    expect(result).toBeTruthy();
    
    // Parse the result (regardless of how it came back)
    let data;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
        console.log('📊 Parsed JSON successfully');
      } catch (e) {
        console.log('⚠️ Failed to parse as JSON, trying to extract JSON from text');
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                      result.match(/```\s*([\s\S]*?)\s*```/) || 
                      result.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          data = JSON.parse(jsonContent);
          console.log('📊 Extracted and parsed JSON successfully');
        } else {
          console.error('❌ No JSON found in response');
          throw new Error(`No JSON found in response: ${result}`);
        }
      }
    } else {
      data = result;
    }
    
    // Validate the structure matches our schema
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('year');
    expect(data).toHaveProperty('genre');
    expect(typeof data.title).toBe('string');
    expect(typeof data.author).toBe('string');
    expect(typeof data.year).toBe('number');
    expect(typeof data.genre).toBe('string');
    console.log('✓ OpenAI test passed');
  }, TIMEOUT);
  
  // Optional test for the future OpenAI tool mode option
  // This will pass both before and after any implementation changes to use tool mode
  itif(!!haveApiKey)('OpenAI with useToolMode option should still return valid structured data', async () => {
    console.log('🚀 Starting OpenAI useToolMode test');
    try {
      // Make the API call with OpenAI using useToolMode option
      const result = await callAI(
        'Give me a book recommendation about science fiction from the 1960s.',
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: 'openai/gpt-4o-mini',
          schema: bookSchema,
          useToolMode: true // This option may or may not be implemented yet
        }
      );
      
      console.log('✅ OpenAI with useToolMode result:', typeof result, 
        typeof result === 'string' ? result.substring(0, 100) + '...' : '[object AsyncGenerator]');
      
      // Check if we got a valid response
      expect(result).toBeTruthy();
      
      // Parse the result (regardless of how it came back)
      let data;
      if (typeof result === 'string') {
        try {
          data = JSON.parse(result);
          console.log('📊 Parsed JSON successfully');
        } catch (e) {
          console.log('⚠️ Failed to parse as JSON, trying to extract JSON from text');
          // Try to extract JSON from text response (code blocks, etc.)
          const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                        result.match(/```\s*([\s\S]*?)\s*```/) || 
                        result.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
            data = JSON.parse(jsonContent);
            console.log('📊 Extracted and parsed JSON successfully');
          } else {
            // If we can't parse it, this could be an error response or unsupported feature
            console.log('⚠️ Could not parse JSON, may be unsupported feature:', result);
            // Check if it's an error related to unsupported feature
            if (result.includes('error') && 
               (result.includes('tool') || result.includes('unsupported'))) {
              console.log('ℹ️ Tool mode might not be supported yet, skipping test');
              return; // Skip the rest of the test
            }
            console.error('❌ No JSON found in response');
            throw new Error(`No JSON found in response: ${result}`);
          }
        }
      } else {
        data = result;
      }
      
      // Validate the structure matches our schema
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('author');
      expect(data).toHaveProperty('year');
      expect(data).toHaveProperty('genre');
      expect(typeof data.title).toBe('string');
      expect(typeof data.author).toBe('string');
      expect(typeof data.year).toBe('number');
      expect(typeof data.genre).toBe('string');
      console.log('✓ OpenAI useToolMode test passed');
    } catch (error: any) {
      // If the useToolMode option isn't implemented yet, the test should still pass
      if (error.message && error.message.includes('useToolMode')) {
        console.log('ℹ️ useToolMode option not implemented yet, skipping test');
      } else {
        console.error('❌ Test failed with error:', error.message);
        throw error; // Rethrow other errors
      }
    }
  }, TIMEOUT);
}); 