/**
 * mongoMigration.test.js — Unit tests for src/migration.js
 *
 * Tests migration of JSON files to MongoDB, idempotency, corrupt JSON handling,
 * and empty file handling against MongoMemoryServer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startTestMongo, getTestDb, stopTestMongo } from './mongoTestHelper.js';
import { runMigrations } from '../migration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

const filesToManage = [
  'conversations.json',
  'users.json',
  'personas.json',
  'audit.json',
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Backup original data files before tests
let originalFiles = {};

beforeAll(async () => {
  await startTestMongo();

  // Backup existing data files
  for (const file of filesToManage) {
    const filePath = path.join(DATA_DIR, file);
    const migratedPath = filePath + '.migrated';
    if (await fileExists(filePath)) {
      originalFiles[file] = await fs.readFile(filePath, 'utf-8');
    }
    if (await fileExists(migratedPath)) {
      originalFiles[file + '.migrated'] = await fs.readFile(migratedPath, 'utf-8');
    }
  }
});

afterAll(async () => {
  // Restore original data files
  for (const file of filesToManage) {
    const filePath = path.join(DATA_DIR, file);
    const migratedPath = filePath + '.migrated';

    // Clean up any .migrated files we created
    if (await fileExists(migratedPath)) {
      if (originalFiles[file + '.migrated']) {
        await fs.writeFile(migratedPath, originalFiles[file + '.migrated']);
      } else {
        await fs.unlink(migratedPath);
      }
    }

    // Restore original files
    if (originalFiles[file]) {
      await fs.writeFile(filePath, originalFiles[file]);
    } else if (await fileExists(filePath)) {
      await fs.unlink(filePath);
    }
  }

  await stopTestMongo();
});

beforeEach(async () => {
  // Clear all MongoDB collections
  const db = getTestDb();
  await db.collection('conversations').deleteMany({});
  await db.collection('users').deleteMany({});
  await db.collection('personas').deleteMany({});
  await db.collection('audit').deleteMany({});

  // Remove any .migrated files and test data files from previous test
  for (const file of filesToManage) {
    const migratedPath = path.join(DATA_DIR, file + '.migrated');
    const filePath = path.join(DATA_DIR, file);
    if (await fileExists(migratedPath)) {
      await fs.unlink(migratedPath);
    }
    // Remove test data files (we'll create fresh ones per test)
    if (await fileExists(filePath)) {
      await fs.unlink(filePath);
    }
  }
});

describe('runMigrations', () => {
  it('migrates conversations.json (object with conversations key)', async () => {
    const convData = {
      conversations: {
        'conv-1': {
          id: 'conv-1',
          userId: 'user-1',
          title: 'Test',
          messages: [],
          plans: [],
        },
      },
    };
    await fs.writeFile(
      path.join(DATA_DIR, 'conversations.json'),
      JSON.stringify(convData)
    );

    await runMigrations();

    const db = getTestDb();
    const docs = await db.collection('conversations').find({}).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('conv-1');

    // File should be renamed
    expect(await fileExists(path.join(DATA_DIR, 'conversations.json.migrated'))).toBe(true);
    expect(await fileExists(path.join(DATA_DIR, 'conversations.json'))).toBe(false);
  });

  it('migrates users.json (array)', async () => {
    const usersData = [
      { id: 'u1', email: 'a@test.com' },
      { id: 'u2', email: 'b@test.com' },
    ];
    await fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(usersData));

    await runMigrations();

    const db = getTestDb();
    const docs = await db.collection('users').find({}).toArray();
    expect(docs).toHaveLength(2);

    expect(await fileExists(path.join(DATA_DIR, 'users.json.migrated'))).toBe(true);
  });

  it('migrates personas.json (object with personas key)', async () => {
    const personasData = {
      personas: {
        'my-client': { slug: 'my-client', displayName: 'My Client' },
      },
    };
    await fs.writeFile(
      path.join(DATA_DIR, 'personas.json'),
      JSON.stringify(personasData)
    );

    await runMigrations();

    const db = getTestDb();
    const docs = await db.collection('personas').find({}).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].slug).toBe('my-client');

    expect(await fileExists(path.join(DATA_DIR, 'personas.json.migrated'))).toBe(true);
  });

  it('migrates audit.json (array)', async () => {
    const auditData = [
      { id: 'aud1', event: 'USER_CREATED', actor: 'admin', timestamp: '2024-01-01T00:00:00Z' },
    ];
    await fs.writeFile(path.join(DATA_DIR, 'audit.json'), JSON.stringify(auditData));

    await runMigrations();

    const db = getTestDb();
    const docs = await db.collection('audit').find({}).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].event).toBe('USER_CREATED');

    expect(await fileExists(path.join(DATA_DIR, 'audit.json.migrated'))).toBe(true);
  });

  it('skips files that already have .migrated counterpart (idempotent)', async () => {
    // Create both the source and .migrated file
    await fs.writeFile(
      path.join(DATA_DIR, 'users.json'),
      JSON.stringify([{ id: 'u1', email: 'test@test.com' }])
    );
    await fs.writeFile(path.join(DATA_DIR, 'users.json.migrated'), 'already done');

    await runMigrations();

    // Should NOT have inserted anything
    const db = getTestDb();
    const docs = await db.collection('users').find({}).toArray();
    expect(docs).toHaveLength(0);
  });

  it('skips empty files gracefully', async () => {
    // Empty JSON object — extract yields empty array
    await fs.writeFile(path.join(DATA_DIR, 'conversations.json'), JSON.stringify({}));

    await runMigrations();

    const db = getTestDb();
    const docs = await db.collection('conversations').find({}).toArray();
    expect(docs).toHaveLength(0);

    // File should NOT be renamed (empty = skipped)
    expect(await fileExists(path.join(DATA_DIR, 'conversations.json'))).toBe(true);
    expect(await fileExists(path.join(DATA_DIR, 'conversations.json.migrated'))).toBe(false);
  });

  it('handles corrupt JSON without crashing', async () => {
    await fs.writeFile(path.join(DATA_DIR, 'users.json'), '{not valid json!!!');

    // Should not throw
    await expect(runMigrations()).resolves.not.toThrow();

    // File should NOT be renamed
    expect(await fileExists(path.join(DATA_DIR, 'users.json'))).toBe(true);
    expect(await fileExists(path.join(DATA_DIR, 'users.json.migrated'))).toBe(false);
  });
});
