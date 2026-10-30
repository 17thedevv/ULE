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
import { ClozeBlockDefinition } from './types/cloze.block';

@Injectable()
export class BlockTypeRegistry {
  private readonly versionedTypes = new Map<string, IBlockTypeDefinition>();
  private readonly latestTypes = new Map<string, IBlockTypeDefinition>();

  constructor() {
    this.register(new VideoBlockDefinition());
    this.register(new MultipleChoiceBlockDefinition());
    this.register(new CodingBlockDefinition());
    this.register(new ClozeBlockDefinition());
  }

  register(definition: IBlockTypeDefinition): void {
    const key = `${definition.manifest.id}@${definition.manifest.version}`;
    this.versionedTypes.set(key, definition);
    this.latestTypes.set(definition.manifest.id, definition);
  }

  listManifests(): ABTypeManifest[] {
    return Array.from(this.latestTypes.values()).map((def) => def.manifest);
  }

  listTypeIds(): string[] {
    return Array.from(this.latestTypes.keys());
  }

  getSupportedVersions(typeId: string): string[] {
    return Array.from(this.versionedTypes.entries())
      .filter(([k]) => k.startsWith(`${typeId}@`))
      .map(([, def]) => def.manifest.version);
  }

  hasType(typeId: string, typeVersion?: string): boolean {
    if (typeVersion) {
      return this.versionedTypes.has(`${typeId}@${typeVersion}`);
    }
    return this.latestTypes.has(typeId);
  }

  getDefinition(typeId: string, typeVersion?: string): IBlockTypeDefinition {
    if (typeVersion) {
      const def = this.versionedTypes.get(`${typeId}@${typeVersion}`);
      if (!def) {
        const supported = this.getSupportedVersions(typeId);
        if (supported.length === 0) {
          throw new NotFoundException(
            `Block type '${typeId}' is not registered. Supported types: ${this.listTypeIds().join(', ')}`,
          );
        }
        throw new BadRequestException(
          `Block type '${typeId}' version '${typeVersion}' is not supported. Supported versions: ${supported.join(', ')}`,
        );
      }
      return def;
    }

    const def = this.latestTypes.get(typeId);
    if (!def) {
      throw new NotFoundException(
        `Block type '${typeId}' is not registered. Supported types: ${this.listTypeIds().join(', ')}`,
      );
    }
    return def;
  }

  validateConfig(
    typeId: string,
    config: unknown,
    blockId?: string,
    title?: string,
    typeVersion?: string,
  ): BlockValidationResultDto {
    const def = this.getDefinition(typeId, typeVersion);
    return def.validateConfig(config, blockId, title);
  }

  sanitizeForLearner(
    typeId: string,
    config: Record<string, unknown>,
    typeVersion?: string,
  ): Record<string, unknown> {
    const def = this.getDefinition(typeId, typeVersion);
    return def.sanitizeForLearner(config);
  }

  async evaluate(
    typeId: string,
    config: Record<string, unknown>,
    context: EvaluatorContext,
    typeVersion?: string,
  ): Promise<EvaluatedOutcome> {
    const def = this.getDefinition(typeId, typeVersion);

    if (!def.manifest.capabilities.evaluatable || !def.evaluateResponse) {
      throw new BadRequestException(
        `Block type '${typeId}' version '${def.manifest.version}' is not evaluatable or does not support response evaluation.`,
      );
    }

    return def.evaluateResponse(config, context);
  }
}
