/**
 * Tests for Mistral AI Integration and Fallback Mechanism
 */

jest.mock('../src/config/env', () => ({
  PORT: '5000',
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  FRONTEND_URL: 'http://localhost:3000',
  MISTRAL_API_KEY: 'valid-test-key',
  MISTRAL_MODEL: 'mistral-large-latest',
  DEFAULT_CHECK_INTERVAL_SECONDS: '60',
  DEFAULT_TIMEOUT_MS: '10000',
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: '2000',
  DEFAULT_ERROR_RATE_THRESHOLD_PERCENT: '10',
}));

jest.mock('axios');
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const axios = require('axios');
const env = require('../src/config/env');
const {
  callMistralChat,
  analyzeAnomaly,
  generateFallbackAnalysis,
  isRetryableError,
} = require('../src/services/mistralService');

describe('Mistral AI Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isRetryableError', () => {
    test('identifies HTTP 429 and 500 as retryable', () => {
      expect(isRetryableError({ response: { status: 429 } })).toBe(true);
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
    });

    test('identifies 400 and 401 as non-retryable', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
    });

    test('identifies timeouts and connection resets as retryable', () => {
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true);
      expect(isRetryableError({ message: 'timeout of 5000ms exceeded' })).toBe(true);
    });
  });

  describe('generateFallbackAnalysis', () => {
    test('produces deterministic structured analysis without claiming AI generation', () => {
      const fallback = generateFallbackAnalysis({
        apiName: 'PaymentGateway',
        statusCode: 503,
        responseTimeMs: 6200,
        recordsReturned: 0,
        reasonCodes: ['HTTP_5XX', 'HIGH_LATENCY'],
        severity: 'critical',
      });

      expect(fallback.aiGenerated).toBe(false);
      expect(fallback.generationMethod).toBe('fallback');
      expect(fallback.summary).toContain('PaymentGateway');
      expect(fallback.summary).toContain('HTTP 503');
      expect(fallback.possibleCause).toBeDefined();
      expect(fallback.businessImpact).toContain('Critical service disruption');
      expect(fallback.recommendedAction).toBeDefined();
    });
  });

  describe('analyzeAnomaly', () => {
    const validEvidence = {
      apiName: 'PatientRecordsAPI',
      statusCode: 500,
      responseTimeMs: 4200,
      recordsReturned: 0,
      expectRecords: true,
      reasonCodes: ['HTTP_5XX', 'ZERO_RECORDS'],
      severity: 'critical',
    };

    test('successfully generates AI diagnostic analysis when Mistral returns valid JSON', async () => {
      const mockAiPayload = {
        summary: 'PatientRecordsAPI failed with HTTP 500 and returned 0 records.',
        possibleCause: 'Potential downstream database timeout or unhandled exception during query execution.',
        businessImpact: 'Clinicians unable to load patient records; immediate clinical workflow impact.',
        recommendedAction: 'Check DB connection pool saturation and inspect backend crash logs for stack traces.',
      };

      axios.mockResolvedValueOnce({
        status: 200,
        data: {
          model: 'mistral-large-latest',
          choices: [
            {
              message: {
                content: JSON.stringify(mockAiPayload),
              },
            },
          ],
        },
      });

      const result = await analyzeAnomaly(validEvidence, { maxRetries: 0 });

      expect(result.aiGenerated).toBe(true);
      expect(result.generationMethod).toBe('mistral');
      expect(result.aiGenerationStatus).toBe('success');
      expect(result.summary).toBe(mockAiPayload.summary);
      expect(result.possibleCause).toBe(mockAiPayload.possibleCause);
      expect(result.businessImpact).toBe(mockAiPayload.businessImpact);
      expect(result.recommendedAction).toBe(mockAiPayload.recommendedAction);
    });

    test('falls back safely to deterministic rules on invalid JSON from Mistral', async () => {
      axios.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'This is not valid JSON string at all!',
              },
            },
          ],
        },
      });

      const result = await analyzeAnomaly(validEvidence, { maxRetries: 0 });

      expect(result.aiGenerated).toBe(false);
      expect(result.generationMethod).toBe('fallback');
      expect(result.aiGenerationStatus).toBe('failed');
      expect(result.summary).toBeDefined();
      expect(result.recommendedAction).toBeDefined();
    });

    test('falls back safely to deterministic rules on network timeout', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded');
      timeoutError.code = 'ETIMEDOUT';
      axios.mockRejectedValue(timeoutError);

      const result = await analyzeAnomaly(validEvidence, { maxRetries: 0 });

      expect(result.aiGenerated).toBe(false);
      expect(result.generationMethod).toBe('fallback');
      expect(result.aiGenerationStatus).toBe('failed');
    });

    test('retries on rate limit (HTTP 429) before succeeding', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.response = { status: 429, data: { message: 'Too many requests' } };

      const mockAiPayload = {
        summary: 'Diagnosed successfully after backoff.',
        possibleCause: 'Temporary load spike.',
        businessImpact: 'Brief delay in response times.',
        recommendedAction: 'Scale up cluster instances.',
      };

      // Attempt 1 fails with 429, Attempt 2 succeeds
      axios
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          status: 200,
          data: {
            choices: [{ message: { content: JSON.stringify(mockAiPayload) } }],
          },
        });

      const result = await analyzeAnomaly(validEvidence, { maxRetries: 1 });

      expect(axios).toHaveBeenCalledTimes(2);
      expect(result.aiGenerated).toBe(true);
      expect(result.generationMethod).toBe('mistral');
      expect(result.summary).toBe(mockAiPayload.summary);
    });

    test('immediately skips AI and uses fallback when API key is placeholder or missing', async () => {
      const originalKey = env.MISTRAL_API_KEY;
      env.MISTRAL_API_KEY = 'your_mistral_api_key_here';

      const result = await analyzeAnomaly(validEvidence);

      expect(axios).not.toHaveBeenCalled();
      expect(result.aiGenerated).toBe(false);
      expect(result.generationMethod).toBe('fallback');
      expect(result.aiGenerationStatus).toBe('skipped');

      env.MISTRAL_API_KEY = originalKey;
    });
  });
});
