import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompleteDistinctActivitiesConfig,
  IndependentPracticeConfig,
  QuestObjectiveConfig,
  QuestTemplateId,
} from '@ule/contracts';

export interface QuestTemplateDefinition {
  id: QuestTemplateId;
  name: string;
  description: string;
  objectiveKey: string;
  validateConfig(config: unknown): { valid: boolean; errors: string[] };
}

@Injectable()
export class QuestTemplatesRegistry {
  private readonly templates = new Map<QuestTemplateId, QuestTemplateDefinition>();

  constructor() {
    this.registerTemplate({
      id: 'COMPLETE_DISTINCT_ACTIVITIES',
      name: 'Complete Distinct Activities',
      description: 'Learner completes a specified number of distinct learning activities within the pinned course version.',
      objectiveKey: 'complete_distinct_activities',
      validateConfig(config: unknown) {
        const errors: string[] = [];
        if (!config || typeof config !== 'object') {
          errors.push('Configuration must be an object.');
          return { valid: false, errors };
        }
        const c = config as CompleteDistinctActivitiesConfig;
        if (typeof c.targetCount !== 'number' || c.targetCount < 1 || !Number.isInteger(c.targetCount)) {
          errors.push('targetCount must be a positive integer.');
        }
        if (c.requiredBlockInstanceIds !== undefined) {
          if (!Array.isArray(c.requiredBlockInstanceIds)) {
            errors.push('requiredBlockInstanceIds must be an array of strings if provided.');
          } else {
            for (const id of c.requiredBlockInstanceIds) {
              if (typeof id !== 'string' || id.trim().length === 0) {
                errors.push('Each requiredBlockInstanceId must be a non-empty string.');
              }
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
    });

    this.registerTemplate({
      id: 'INDEPENDENT_PRACTICE',
      name: 'Independent Practice Milestone',
      description: 'Learner successfully completes independent, unassisted assessment items mapped to a target skill.',
      objectiveKey: 'independent_practice',
      validateConfig(config: unknown) {
        const errors: string[] = [];
        if (!config || typeof config !== 'object') {
          errors.push('Configuration must be an object.');
          return { valid: false, errors };
        }
        const c = config as IndependentPracticeConfig;
        if (typeof c.targetCount !== 'number' || c.targetCount < 1 || !Number.isInteger(c.targetCount)) {
          errors.push('targetCount must be a positive integer.');
        }
        if (typeof c.skillCode !== 'string' || c.skillCode.trim().length === 0) {
          errors.push('skillCode must be a non-empty string.');
        }
        return { valid: errors.length === 0, errors };
      },
    });
  }

  registerTemplate(template: QuestTemplateDefinition): void {
    this.templates.set(template.id, template);
  }

  hasTemplate(id: string): boolean {
    return this.templates.has(id as QuestTemplateId);
  }

  getTemplate(id: string): QuestTemplateDefinition {
    const def = this.templates.get(id as QuestTemplateId);
    if (!def) {
      throw new BadRequestException(`Unsupported quest template '${id}'.`);
    }
    return def;
  }

  listTemplates(): QuestTemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  validateConfig(templateId: string, config: unknown): { valid: boolean; errors: string[] } {
    const def = this.getTemplate(templateId);
    return def.validateConfig(config);
  }
}
