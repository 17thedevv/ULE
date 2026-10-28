import { ABTypeManifest, BlockValidationResultDto, VideoConfig } from '@ule/contracts';
import { IBlockTypeDefinition } from '../block-type.interface';

export class VideoBlockDefinition implements IBlockTypeDefinition {
  readonly manifest: ABTypeManifest = {
    id: 'video',
    version: '1.0.0',
    name: 'Video Learning Content',
    description:
      'Video learning material with completion tracking. Completion is strictly ungraded and never implies a score, grade, or mastery.',
    capabilities: {
      renderable: true,
      submittable: false,
      evaluatable: false,
      completable: true,
      runtimeExecutionSupported: true,
    },
    defaultConfig: {
      url: 'https://cdn.ule.internal/sample-lesson.mp4',
      durationSeconds: 120,
      transcript: '',
      allowSkip: true,
    },
    schemaDescription: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' },
        durationSeconds: { type: 'number', minimum: 0 },
        transcript: { type: 'string' },
        allowSkip: { type: 'boolean' },
      },
    },
  };

  validateConfig(config: unknown, blockId = 'video-block', title = 'Video Block'): BlockValidationResultDto {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        blockId,
        title,
        blockTypeId: this.manifest.id,
        valid: false,
        errors: ['Video configuration must be a non-null object.'],
      };
    }

    const cfg = config as Partial<VideoConfig>;

    if (typeof cfg.url !== 'string' || cfg.url.trim().length === 0) {
      errors.push("Video block requires a non-empty 'url' string.");
    } else {
      const trimmed = cfg.url.trim();
      const validPrefix =
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('./');
      if (!validPrefix) {
        errors.push("Video 'url' must begin with http://, https://, or a valid path.");
      }
    }

    if (cfg.durationSeconds !== undefined) {
      if (typeof cfg.durationSeconds !== 'number' || isNaN(cfg.durationSeconds) || cfg.durationSeconds < 0) {
        errors.push("Video 'durationSeconds' must be a non-negative number.");
      }
    }

    if (cfg.transcript !== undefined && typeof cfg.transcript !== 'string') {
      errors.push("Video 'transcript' must be a string if provided.");
    }

    if (cfg.allowSkip !== undefined && typeof cfg.allowSkip !== 'boolean') {
      errors.push("Video 'allowSkip' must be a boolean if provided.");
    }

    return {
      blockId,
      title,
      blockTypeId: this.manifest.id,
      valid: errors.length === 0,
      errors,
    };
  }

  sanitizeForLearner(config: Record<string, unknown>): Record<string, unknown> {
    return {
      url: typeof config.url === 'string' ? config.url : '',
      durationSeconds: typeof config.durationSeconds === 'number' ? config.durationSeconds : undefined,
      transcript: typeof config.transcript === 'string' ? config.transcript : '',
      allowSkip: Boolean(config.allowSkip),
    };
  }
}
