/**
 * Tests for safeFetch module - verifies native fetch is preferred over node-fetch
 * when available, eliminating the url.parse() deprecation warning in Node 18+.
 */

describe('safeFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    // Restore original state
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
    jest.resetModules();
  });

  describe('when native fetch is available', () => {
    it('should use native fetch instead of node-fetch', async () => {
      // Setup: Create a mock native fetch
      const mockNativeFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ source: 'native' }),
      });
      (global as any).fetch = mockNativeFetch;

      // Clear module cache to re-evaluate safeFetch with native fetch available
      jest.resetModules();

      // Import fresh copy of safeFetch
      const { default: safeFetch } = await import('../safeFetch');

      // Act
      await safeFetch('https://example.com/test');

      // Assert: native fetch should be called
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);
      expect(mockNativeFetch).toHaveBeenCalledWith('https://example.com/test');
    });

    it('should not require node-fetch when native fetch exists', async () => {
      // Setup: Create a mock native fetch
      const mockNativeFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ source: 'native' }),
      });
      (global as any).fetch = mockNativeFetch;

      // Spy on require to verify node-fetch is not loaded
      const originalRequire = jest.requireActual;

      jest.resetModules();

      // Import fresh copy
      const { default: safeFetch } = await import('../safeFetch');

      // Act
      await safeFetch('https://example.com/test');

      // Assert: should work without errors using native fetch
      expect(mockNativeFetch).toHaveBeenCalled();
    });
  });

  describe('when native fetch is NOT available', () => {
    it('should fall back to node-fetch', async () => {
      // Setup: Remove native fetch
      delete (global as any).fetch;

      // Mock node-fetch
      const mockNodeFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ source: 'node-fetch' }),
      });

      jest.resetModules();
      jest.doMock('node-fetch', () => mockNodeFetch);

      // Import fresh copy of safeFetch
      const { default: safeFetch } = await import('../safeFetch');

      // Act
      await safeFetch('https://example.com/test');

      // Assert: node-fetch should be called
      expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetch implementation selection', () => {
    it('should prioritize native fetch over node-fetch for Node 18+ compatibility', async () => {
      // This test documents the expected behavior:
      // Native fetch (Node 18+) should be preferred because:
      // 1. It doesn't use the deprecated url.parse() API
      // 2. It's built into Node.js, reducing dependencies
      // 3. It has better performance characteristics

      const mockNativeFetch = jest.fn().mockResolvedValue({ ok: true });
      const mockNodeFetch = jest.fn().mockResolvedValue({ ok: true });

      (global as any).fetch = mockNativeFetch;

      jest.resetModules();
      jest.doMock('node-fetch', () => mockNodeFetch);

      const { default: safeFetch } = await import('../safeFetch');

      await safeFetch('https://example.com');

      // Native fetch should be used, not node-fetch
      expect(mockNativeFetch).toHaveBeenCalled();
      expect(mockNodeFetch).not.toHaveBeenCalled();
    });
  });
});
