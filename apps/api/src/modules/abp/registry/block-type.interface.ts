import {
  ABTypeManifest,
  BlockValidationResultDto,
} from '@ule/contracts';

export interface EvaluatorContext {
  runId: string;
  attemptId: string;
  attemptNumber: number;
  userId: string;
  submittedResponse: Record<string, unknown>;
  supportContext?: Record<string, unknown> | null;
}

export interface EvaluatedOutcome {
  status: 'EVALUATED' | 'SKIPPED' | 'FAILED';
  isCorrect: boolean | null;
  score: number | null;
  feedback: Record<string, unknown> | string | null;
  evaluatorId: string;
}

export interface IBlockTypeDefinition {
  readonly manifest: ABTypeManifest;

  validateConfig(config: unknown, blockId?: string, title?: string): BlockValidationResultDto;

  sanitizeForLearner(config: Record<string, unknown>): Record<string, unknown>;

  evaluateResponse?(
    config: Record<string, unknown>,
    context: EvaluatorContext,
  ): Promise<EvaluatedOutcome> | EvaluatedOutcome;
}
