import { describe, expect, it, vi } from 'vitest';
import {
  addDraftBlock,
  executeRunCommand,
  listBlockTypes,
  listDraftBlocks,
  startRun,
  validateDraftBlocks,
} from './abp';

describe('ABP Frontend API Service', () => {
  it('listBlockTypes fetches /api/v1/abp/types', async () => {
    const mockManifests = [
      { id: 'video', name: 'Video' },
      { id: 'multiple-choice', name: 'MCQ' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockManifests,
    } as Response);

    const types = await listBlockTypes();
    expect(types).toEqual(mockManifests);
  });

  it('listDraftBlocks fetches /api/v1/courses/:courseId/draft/blocks', async () => {
    const mockBlocks = [{ id: 'b-1', title: 'Video Block' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockBlocks,
    } as Response);

    const blocks = await listDraftBlocks('c-1');
    expect(blocks).toEqual(mockBlocks);
  });

  it('addDraftBlock sends POST to /api/v1/courses/:courseId/draft/blocks', async () => {
    const mockBlock = {
      id: 'b-1',
      title: 'Video Lesson',
      blockTypeId: 'video',
      orderIndex: 0,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockBlock,
    } as Response);

    const block = await addDraftBlock('c-1', {
      blockTypeId: 'video',
      title: 'Video Lesson',
      config: { url: 'https://cdn.ule.internal/vid.mp4' },
      expectedRevision: 1,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/courses/c-1/draft/blocks'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(block).toEqual(mockBlock);
  });

  it('validateDraftBlocks sends POST to /api/v1/courses/:courseId/draft/blocks/validate', async () => {
    const mockReport = { valid: true, totalBlocks: 1, invalidBlocksCount: 0, blocks: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    } as Response);

    const report = await validateDraftBlocks('c-1');
    expect(report.valid).toBe(true);
  });

  it('startRun sends POST to /api/v1/runs', async () => {
    const mockRun = { id: 'r-1', status: 'ACTIVE' };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    } as Response);

    const run = await startRun({
      courseVersionId: 'v-1',
      blockInstanceId: 'b-1',
      idempotencyKey: 'test-idemp-1',
    });

    expect(run).toEqual(mockRun);
  });

  it('executeRunCommand sends POST to /api/v1/runs/:runId/commands', async () => {
    const mockUpdatedRun = { id: 'r-1', status: 'CLOSED', closeReason: 'COMPLETED' };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockUpdatedRun,
    } as Response);

    const run = await executeRunCommand('r-1', {
      command: 'FINISH',
      idempotencyKey: 'test-idemp-2',
    });
    expect(run.status).toBe('CLOSED');
  });
});
