import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ABTypeManifest, BlockValidationResultDto } from '@ule/contracts';
import {
  EvaluatedOutcome,
  EvaluatorContext,
  IBlockTypeDefinition,
} from './block-type.interface';
import { CodingBlockDefinition } from './types/coding.block';
import { MultipleChoiceBlockDefinition } from './types/multiple-choice.block';
import { VideoBlockDefinition } from './types/video.block';

@Injectable()
export class BlockTypeRegistry {
  private readonly types = new Map<string, IBlockTypeDefinition>();

  constructor() {
    this.register(new VideoBlockDefinition());
    this.register(new MultipleChoiceBlockDefinition());
    this.register(new CodingBlockDefinition());
  }

  register(definition: IBlockTypeDefinition): void {
    this.types.set(definition.manifest.id, definition);
  }

  listManifests(): ABTypeManifest[] {
    return Array.from(this.types.values()).map((def) => def.manifest);
  }

  getDefinition(typeId: string): IBlockTypeDefinition {
    const def = this.types.get(typeId);
    if (!def) {
      throw new NotFoundException(
        `Block type '${typeId}' is not registered. Supported types: ${Array.from(this.types.keys()).join(', ')}`,
      );
    }
    return def;
  }

  hasType(typeId: string): boolean {
    return this.types.has(typeId);
  }

  validateConfig(
    typeId: string,
    config: unknown,
    blockId?: string,
    title?: string,
  ): BlockValidationResultDto {
    const def = this.getDefinition(typeId);
    return def.validateConfig(config, blockId, title);
  }

  sanitizeForLearner(
    typeId: string,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const def = this.getDefinition(typeId);
    return def.sanitizeForLearner(config);
  }

  async evaluate(
    typeId: string,
    config: Record<string, unknown>,
    context: EvaluatorContext,
  ): Promise<EvaluatedOutcome> {
    const def = this.getDefinition(typeId);

    if (!def.manifest.capabilities.evaluatable || !def.evaluateResponse) {
      throw new BadRequestException(
        `Block type '${typeId}' is not evaluatable or does not support response evaluation.`,
      );
    }

    return def.evaluateResponse(config, context);
  }
}
