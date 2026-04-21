/**
 * documentStore.test.js — Property-based and unit tests for src/documentStore.js
 *
 * Task 9.4: Property 9 — Download token expiry
 * Task 17.4: Unit tests for documentStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { storeDocument, getDocument, clearStore } from '../documentStore.js';

const TTL_MS = 30 * 60 * 1000; // 30 minutes

beforeEach(() => {
  clearStore();
});

// ─── Task 17.4: Unit tests ──────────────────────────────────────────────────

describe('storeDocument', () => {
  it('returns a token string', () => {
    const token = storeDocument({ content: 'hello', filename: 'test.md' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns unique tokens for different documents', () => {
    const token1 = storeDocument({ content: 'doc1', filename: 'a.md' });
    const token2 = storeDocument({ content: 'doc2', filename: 'b.md' });
    expect(token1).not.toBe(token2);
  });
});

describe('getDocument', () => {
  it('returns document with valid token', () => {
    const token = storeDocument({ content: 'hello world', filename: 'test.md' });
    const doc = getDocument(token);
    expect(doc).not.toBeNull();
    expect(doc.content).toBe('hello world');
    expect(doc.filename).toBe('test.md');
    expect(doc.contentType).toBe('text/markdown');
  });

  it('returns correct contentType for JSON files', () => {
    const token = storeDocument({ content: '{}', filename: 'data.json' });
    const doc = getDocument(token);
    expect(doc.contentType).toBe('application/json');
  });

  it('returns null for unknown token', () => {
    const doc = getDocument('nonexistent-token-12345');
    expect(doc).toBeNull();
  });

  it('returns null for expired token (using _now parameter)', () => {
    const now = Date.now();
    const token = storeDocument({ content: 'test', filename: 'test.md' });

    // Within TTL — should return document
    const withinTtl = getDocument(token, now + 10 * 60 * 1000); // 10 minutes
    expect(withinTtl).not.toBeNull();

    // After TTL — should return null
    const afterTtl = getDocument(token, now + 31 * 60 * 1000); // 31 minutes
    expect(afterTtl).toBeNull();
  });

  it('deletes expired document from store on access', () => {
    const now = Date.now();
    const token = storeDocument({ content: 'test', filename: 'test.md' });

    // Access after expiry triggers deletion
    const expired = getDocument(token, now + 31 * 60 * 1000);
    expect(expired).toBeNull();

    // Subsequent access also returns null (document was deleted)
    const again = getDocument(token, now); // even with "current" time
    expect(again).toBeNull();
  });
});

// ─── Task 9.4: Property 9 — Download token expiry ──────────────────────────

describe('Download token expiry (Property 9)', () => {
  /**
   * Property 9: Download token expiry
   *
   * For any document stored, getDocument returns non-null within 30 minutes
   * and null after 30 minutes.
   *
   * **Validates: Requirements 9.5**
   */
  it('Property 9: token valid within TTL, expired after TTL', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 28 * 60 * 1000 }),           // safely within 30 min (1s to 28min)
        fc.integer({ min: 31 * 60 * 1000, max: 60 * 60 * 1000 }), // safely after 30 min (31min to 60min)
        fc.string({ minLength: 1, maxLength: 200 }),            // content
        fc.stringMatching(/^[a-zA-Z0-9_-]{1,30}\.(md|json)$/), // filename
        (withinTtl, afterTtl, content, filename) => {
          clearStore();
          const now = Date.now();
          const token = storeDocument({ content, filename });

          // Within TTL: should return the document
          const docWithin = getDocument(token, now + withinTtl);
          expect(docWithin).not.toBeNull();
          expect(docWithin.content).toBe(content);

          // Need to re-store since the previous getDocument might have been at boundary
          clearStore();
          const token2 = storeDocument({ content, filename });

          // After TTL: should return null
          const docAfter = getDocument(token2, now + afterTtl);
          expect(docAfter).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
