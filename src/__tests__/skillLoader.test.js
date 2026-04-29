/**
 * skillLoader.test.js — Property-based and unit tests for src/skillLoader.js
 *
 * Task 2.5: Property 1 — Manifest parsing never crashes
 * Task 17.2: Unit tests for extractSectionInstructions
 */

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadManifest, getSkillCatalogue } from '../skillLoader.js';
import { extractSectionInstructions } from '../graphHelpers.js';

describe('loadManifest', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      tmpDir = null;
    }
  });

  /**
   * Property 1: Manifest parsing never crashes
   *
   * For any arbitrary string content written to a temp manifest file,
   * loadManifest returns an object with executionMode equal to 'single' or 'multi-node'.
   *
   * **Validates: Requirements 1.2, 1.9**
   */
  it('Property 1: never crashes for any string content', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (rawContent) => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
        const manifestPath = path.join(tmpDir, 'manifest.json');
        await fs.writeFile(manifestPath, rawContent, 'utf-8');

        const result = await loadManifest(tmpDir);

        expect(result).toHaveProperty('executionMode');
        expect(['single', 'multi-node']).toContain(result.executionMode);

        // Cleanup for next iteration
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        tmpDir = null;
      }),
      { numRuns: 100 }
    );
  });

  it('returns default manifest when manifest.json is absent', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
    const result = await loadManifest(tmpDir);
    expect(result.executionMode).toBe('single');
    expect(result.outputType).toBe('assessment');
    expect(result.downloadable).toBe(false);
  });

  it('parses valid manifest.json correctly', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
    const manifest = {
      executionMode: 'multi-node',
      outputType: 'document',
      downloadable: true,
      researchPhase: ['jira', 'confluence'],
    };
    await fs.writeFile(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify(manifest),
      'utf-8'
    );
    const result = await loadManifest(tmpDir);
    expect(result.executionMode).toBe('multi-node');
    expect(result.outputType).toBe('document');
    expect(result.downloadable).toBe(true);
    expect(result.researchPhase).toEqual(['jira', 'confluence']);
  });

  it('returns default for invalid JSON content', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
    await fs.writeFile(path.join(tmpDir, 'manifest.json'), '{not valid json!!!', 'utf-8');
    const result = await loadManifest(tmpDir);
    expect(result.executionMode).toBe('single');
  });
});

describe('extractSectionInstructions', () => {
  it('returns content between markers when present', () => {
    const prompt = [
      'Some global context',
      '<!-- SECTION: api-flows -->',
      'Write the API flows section here.',
      'Include Tier 1-5 framework.',
      '<!-- END SECTION: api-flows -->',
      'More global context',
    ].join('\n');

    const result = extractSectionInstructions(prompt, 'api-flows');
    expect(result).toBe('Write the API flows section here.\nInclude Tier 1-5 framework.');
  });

  it('returns full prompt when markers are absent', () => {
    const prompt = 'This is a full skill prompt with no section markers.';
    const result = extractSectionInstructions(prompt, 'nonexistent');
    expect(result).toBe(prompt);
  });

  it('returns full prompt when only start marker is present', () => {
    const prompt = '<!-- SECTION: problem -->\nSome content but no end marker.';
    const result = extractSectionInstructions(prompt, 'problem');
    expect(result).toBe(prompt);
  });

  it('returns full prompt when only end marker is present', () => {
    const prompt = 'Some content\n<!-- END SECTION: problem -->';
    const result = extractSectionInstructions(prompt, 'problem');
    expect(result).toBe(prompt);
  });

  it('handles empty content between markers', () => {
    const prompt = '<!-- SECTION: empty --><!-- END SECTION: empty -->';
    const result = extractSectionInstructions(prompt, 'empty');
    expect(result).toBe('');
  });

  it('extracts correct section when multiple sections exist', () => {
    const prompt = [
      '<!-- SECTION: problem -->',
      'Problem instructions',
      '<!-- END SECTION: problem -->',
      '<!-- SECTION: architecture -->',
      'Architecture instructions',
      '<!-- END SECTION: architecture -->',
    ].join('\n');

    expect(extractSectionInstructions(prompt, 'problem')).toBe('Problem instructions');
    expect(extractSectionInstructions(prompt, 'architecture')).toBe('Architecture instructions');
  });
});


describe('getSkillCatalogue', () => {
  it('returns a markdown string starting with ## Available Skills', () => {
    const catalogue = getSkillCatalogue();
    expect(catalogue.startsWith('## Available Skills')).toBe(true);
  });

  it('contains every skill ID from the registry', () => {
    const catalogue = getSkillCatalogue();
    const expectedIds = ['cr-evaluator', 'capillary-sdd-writer', 'solution-gap-analyzer', 'excalidraw-diagram'];
    for (const id of expectedIds) {
      expect(catalogue).toContain(`**${id}**`);
    }
  });

  it('contains every skill description from the registry', () => {
    const catalogue = getSkillCatalogue();
    expect(catalogue).toContain('CS feasibility evaluation rubric');
    expect(catalogue).toContain('Generate a developer-ready Capillary SDD');
    expect(catalogue).toContain('Analyze a BRD to predict Capillary match percentage');
    expect(catalogue).toContain('Create Excalidraw diagram JSON files');
  });

  it('includes trigger hints for skills that have triggers', () => {
    const catalogue = getSkillCatalogue();
    // capillary-sdd-writer has triggers like "sdd", "system design document"
    expect(catalogue).toContain('(triggers: sdd, system design document');
    // excalidraw-diagram has triggers like "diagram", "excalidraw"
    expect(catalogue).toContain('(triggers: diagram, flow diagram');
  });

  it('includes trigger hints for cr-evaluator now that it has triggers', () => {
    const catalogue = getSkillCatalogue();
    const crLine = catalogue.split('\n').find(l => l.includes('**cr-evaluator**'));
    expect(crLine).toBeDefined();
    expect(crLine).toContain('(triggers: cr, change request, feasibility, brd, requirement)');
  });

  it('ends with the activate_skill usage hint', () => {
    const catalogue = getSkillCatalogue();
    expect(catalogue).toContain('Use `activate_skill` with the skill ID to load full instructions.');
  });

  it('does NOT contain full SKILL.md content', () => {
    const catalogue = getSkillCatalogue();
    // SKILL.md files contain detailed instructions — check that none of those appear
    // The catalogue should be compact metadata only
    expect(catalogue).not.toContain('# CR Evaluator');
    expect(catalogue).not.toContain('## Instructions');
    expect(catalogue).not.toContain('## Golden Path');
    // Should be reasonably short (under 2000 chars for 4 skills)
    expect(catalogue.length).toBeLessThan(2000);
  });

  it('includes alwaysLoad skills like cr-evaluator', () => {
    const catalogue = getSkillCatalogue();
    expect(catalogue).toContain('**cr-evaluator**');
  });
});
