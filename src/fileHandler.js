/**
 * fileHandler.js — File upload extraction and Anthropic content building
 *
 * Handles: .pdf, .txt, .md (text extraction), .png/.jpg/.jpeg/.gif/.webp (base64 for vision)
 */

import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../data/uploads');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// ─── Multer Setup ────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, req.params.id || 'unknown');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Preserve original name with timestamp prefix to avoid collisions
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not supported. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
});

// ─── Content Extraction ──────────────────────────────────────────────────────

/**
 * Extracts content from an uploaded file.
 *
 * @param {object} file - Multer file object
 * @returns {Promise<{type: 'text'|'image', name: string, content: string, mediaType?: string}>}
 */
export async function extractFileContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const name = file.originalname;

  // Images → base64 for Anthropic vision
  if (MIME_MAP[ext]) {
    const buffer = await fs.readFile(file.path);
    return {
      type: 'image',
      name,
      content: buffer.toString('base64'),
      mediaType: MIME_MAP[ext],
    };
  }

  // PDF → text extraction
  if (ext === '.pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await fs.readFile(file.path);
      const data = await pdfParse(buffer);
      return { type: 'text', name, content: data.text || '[Empty PDF]' };
    } catch (err) {
      return { type: 'text', name, content: `[PDF extraction failed: ${err.message}]` };
    }
  }

  // Text files → read as UTF-8
  const content = await fs.readFile(file.path, 'utf-8');
  return { type: 'text', name, content };
}

// ─── Anthropic Content Builder ───────────────────────────────────────────────

/**
 * Builds the Anthropic `content` array for a user message with files.
 * Anthropic supports array content with mixed text and image blocks.
 *
 * @param {string} userText - The user's text message
 * @param {Array} extractedFiles - From extractFileContent()
 * @returns {Array} Anthropic content array
 */
export function buildAnthropicContent(userText, extractedFiles) {
  const content = [];

  for (const file of extractedFiles) {
    if (file.type === 'image') {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mediaType,
          data: file.content,
        },
      });
      content.push({ type: 'text', text: `[Attached image: ${file.name}]` });
    } else {
      // Truncate very large text files to avoid context overflow
      const truncated = file.content.length > 50000
        ? file.content.slice(0, 50000) + '\n\n... [truncated, file too large]'
        : file.content;
      content.push({ type: 'text', text: `## Attached file: ${file.name}\n\n${truncated}` });
    }
  }

  // User's text message last
  if (userText) {
    content.push({ type: 'text', text: userText });
  }

  return content;
}
