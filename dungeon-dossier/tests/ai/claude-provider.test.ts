import { describe, expect, it } from 'vitest';
import { ClaudeApiProvider, DialogueProviderError } from '../../src/ai';
import { statementRequest, validStatementResponse } from './helpers';

describe('Claude proxy provider', () => {
  it('posts only the operation and strict request to a keyless proxy', async () => {
    const calls: Array<{ input: string; init: unknown }> = [];
    const expected = validStatementResponse();
    const provider = new ClaudeApiProvider({
      endpoint: '/api/dialogue',
      fetcher: (input, init) => {
        calls.push({ input, init });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(expected) });
      },
    });

    await expect(provider.renderStatement(statementRequest())).resolves.toEqual(expected);
    expect(calls).toHaveLength(1);
    const call = calls[0] as { input: string; init: { headers: Record<string, string>; body: string } };
    expect(call.input).toBe('/api/dialogue');
    expect(call.init.headers).toEqual({ 'content-type': 'application/json' });
    expect(call.init.headers).not.toHaveProperty('authorization');
    const payload = JSON.parse(call.init.body) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['operation', 'request']);
    expect(payload).toMatchObject({ operation: 'statement', request: statementRequest() });
  });

  it('turns proxy/network failures into provider errors for the safe chain', async () => {
    const provider = new ClaudeApiProvider({
      endpoint: '/api/dialogue',
      fetcher: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    });
    await expect(provider.renderStatement(statementRequest())).rejects.toBeInstanceOf(
      DialogueProviderError,
    );
  });
});
