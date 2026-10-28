import {
  ABTypeManifest,
  BlockValidationResultDto,
  CodingConfig,
} from '@ule/contracts';
import {
  EvaluatedOutcome,
  IBlockTypeDefinition,
} from '../block-type.interface';

export class CodingBlockDefinition implements IBlockTypeDefinition {
  readonly manifest: ABTypeManifest = {
    id: 'coding',
    version: '1.0.0',
    name: 'Coding Exercise (Contract Baseline)',
    description:
      'Baseline coding exercise configuration contract. Runtime code execution is strictly unsupported in Phase 1B pending an isolated, secure sandboxing capability.',
    capabilities: {
      renderable: true,
      submittable: false,
      evaluatable: false,
      completable: false,
      runtimeExecutionSupported: false,
    },
    defaultConfig: {
      language: 'typescript',
      starterCode: 'export function solution(): number {\n  // Implement solution\n  return 42;\n}\n',
      instructions: 'Complete the solution function to return the correct value.',
      expectedOutput: '42',
    },
    schemaDescription: {
      type: 'object',
      required: ['language', 'starterCode', 'instructions'],
      properties: {
        language: { type: 'string' },
        starterCode: { type: 'string' },
        instructions: { type: 'string' },
        expectedOutput: { type: 'string' },
      },
    },
  };

  validateConfig(
    config: unknown,
    blockId = 'coding-block',
    title = 'Coding Exercise',
  ): BlockValidationResultDto {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        blockId,
        title,
        blockTypeId: this.manifest.id,
        valid: false,
        errors: ['Coding configuration must be a non-null object.'],
      };
    }

    const cfg = config as Partial<CodingConfig>;

    if (typeof cfg.language !== 'string' || cfg.language.trim().length === 0) {
      errors.push("Coding block requires a non-empty 'language' string.");
    }

    if (typeof cfg.starterCode !== 'string' || cfg.starterCode.trim().length === 0) {
      errors.push("Coding block requires a non-empty 'starterCode' string.");
    }

    if (typeof cfg.instructions !== 'string' || cfg.instructions.trim().length === 0) {
      errors.push("Coding block requires non-empty 'instructions'.");
    }

    if (cfg.expectedOutput !== undefined && typeof cfg.expectedOutput !== 'string') {
      errors.push("Coding block 'expectedOutput' must be a string if provided.");
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
      language: typeof config.language === 'string' ? config.language : '',
      starterCode: typeof config.starterCode === 'string' ? config.starterCode : '',
      instructions: typeof config.instructions === 'string' ? config.instructions : '',
      runtimeExecutionSupported: false,
    };
  }

  evaluateResponse(): EvaluatedOutcome {
    return {
      status: 'FAILED',
      isCorrect: null,
      score: null,
      feedback: {
        error:
          'Coding block runtime execution is unsupported in Phase 1B. An isolated sandbox is required.',
      },
      evaluatorId: 'ule-coding-evaluator-unsupported',
    };
  }
}
