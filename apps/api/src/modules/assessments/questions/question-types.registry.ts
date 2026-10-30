/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, BadRequestException } from '@nestjs/common';
import { QuestionType, EssayRubric } from '@ule/contracts';

export type QuestionEvaluatorStatus =
  | 'WORKING_EVALUATOR'
  | 'AUTHORING_ONLY'
  | 'RUBRIC_GRADED_ONLY';

export interface QuestionTypeDefinition {
  type: QuestionType;
  displayName: string;
  description: string;
  evaluatorStatus: QuestionEvaluatorStatus;
  validateContent(content: Record<string, unknown>): { valid: boolean; errors: string[] };
  validateAnswerKey(
    content: Record<string, unknown>,
    answerKey: Record<string, unknown> | null,
  ): { valid: boolean; errors: string[] };
  validateRubric?(rubric: EssayRubric | null): { valid: boolean; errors: string[] };
  sanitizeForLearner(content: Record<string, unknown>): Record<string, unknown>;
}

@Injectable()
export class QuestionTypesRegistry {
  private readonly types = new Map<QuestionType, QuestionTypeDefinition>();

  constructor() {
    this.registerType(this.createSingleChoiceDefinition());
    this.registerType(this.createMultipleChoiceDefinition());
    this.registerType(this.createTrueFalseDefinition());
    this.registerType(this.createClozeDefinition());
    this.registerType(this.createShortTextDefinition());
    this.registerType(this.createNumericDefinition());
    this.registerType(this.createEssayDefinition());
    this.registerType(this.createMatchingDefinition());
    this.registerType(this.createOrderingDefinition());
  }

  public registerType(def: QuestionTypeDefinition): void {
    this.types.set(def.type, def);
  }

  public getType(type: QuestionType): QuestionTypeDefinition {
    const def = this.types.get(type);
    if (!def) {
      throw new BadRequestException(
        `Unsupported or unallowlisted question type: '${type}'. Supported types: ${Array.from(this.types.keys()).join(', ')}.`,
      );
    }
    return def;
  }

  public listTypes(): QuestionTypeDefinition[] {
    return Array.from(this.types.values());
  }

  public validateQuestion(
    type: QuestionType,
    content: Record<string, unknown>,
    answerKey?: Record<string, unknown> | null,
    rubric?: EssayRubric | null,
  ): { valid: boolean; errors: string[] } {
    const def = this.getType(type);
    const errors: string[] = [];

    const contentRes = def.validateContent(content);
    if (!contentRes.valid) {
      errors.push(...contentRes.errors);
    }

    const answerKeyRes = def.validateAnswerKey(content, answerKey ?? null);
    if (!answerKeyRes.valid) {
      errors.push(...answerKeyRes.errors);
    }

    if (def.validateRubric) {
      const rubricRes = def.validateRubric(rubric ?? null);
      if (!rubricRes.valid) {
        errors.push(...rubricRes.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Enforces publishability requirements.
   * Auto-evaluable questions MUST have a valid answerKey.
   * Rubric-graded questions (ESSAY) MUST have a valid rubric with at least one criterion, and NO automated answerKey.
   */
  public validatePublishability(
    type: QuestionType,
    content: Record<string, unknown>,
    answerKey?: Record<string, unknown> | null,
    rubric?: EssayRubric | null,
  ): { valid: boolean; errors: string[] } {
    const baseValidation = this.validateQuestion(type, content, answerKey, rubric);
    const errors = [...baseValidation.errors];

    if (type === 'ESSAY') {
      if (!rubric || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
        errors.push('Cannot publish ESSAY question: a valid grading rubric with at least one criterion is required.');
      }
      if (answerKey && Object.keys(answerKey).length > 0) {
        errors.push('Cannot publish ESSAY question: automated answerKey is prohibited.');
      }
    } else {
      if (!answerKey || (typeof answerKey === 'object' && Object.keys(answerKey).length === 0)) {
        errors.push(
          `Cannot publish question of type '${type}': question must include a valid answerKey before publication.`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public sanitizeForLearner(type: QuestionType, content: Record<string, unknown>): Record<string, unknown> {
    const def = this.getType(type);
    return def.sanitizeForLearner(content);
  }

  // ----------------------------------------------------
  // Allowlisted Question Type Implementations
  // ----------------------------------------------------

  private createSingleChoiceDefinition(): QuestionTypeDefinition {
    return {
      type: 'SINGLE_CHOICE',
      displayName: 'Single Choice (MCQ)',
      description: 'Single correct option among multiple choices. Working deterministic auto-evaluator.',
      evaluatorStatus: 'WORKING_EVALUATOR',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const options = (content as any).options;
        if (!Array.isArray(options) || options.length < 2) {
          errors.push('SINGLE_CHOICE content must include at least 2 options.');
        } else {
          const ids = new Set<string>();
          for (const opt of options) {
            if (!opt || typeof opt !== 'object') {
              errors.push('Each option must be a valid non-null object.');
              continue;
            }
            if (!opt.id || typeof opt.id !== 'string' || opt.id.trim().length === 0) {
              errors.push('Each option must have a non-empty string id.');
            } else if (ids.has(opt.id)) {
              errors.push(`Duplicate option id '${opt.id}'.`);
            } else {
              ids.add(opt.id);
            }
            if (typeof opt.text !== 'string' || opt.text.trim().length === 0) {
              errors.push(`Option '${opt?.id || 'unknown'}' must have non-empty text.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const correctId = (answerKey as any).correctOptionId;
        if (!correctId || typeof correctId !== 'string') {
          errors.push('SINGLE_CHOICE answerKey must specify correctOptionId.');
        } else {
          const rawOptions = (content as any)?.options;
          const options = Array.isArray(rawOptions)
            ? rawOptions.filter((o) => o && typeof o === 'object')
            : [];
          if (!options.some((o) => o.id === correctId)) {
            errors.push(`correctOptionId '${correctId}' does not match any configured option id.`);
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        const rawOptions = (content as any)?.options;
        const options = Array.isArray(rawOptions)
          ? rawOptions.filter((o) => o && typeof o === 'object')
          : [];
        return {
          prompt: (content as any).prompt,
          options: options.map((o) => ({ id: String(o.id ?? ''), text: String(o.text ?? '') })),
          shuffleOptions: (content as any).shuffleOptions,
        };
      },
    };
  }

  private createMultipleChoiceDefinition(): QuestionTypeDefinition {
    return {
      type: 'MULTIPLE_CHOICE',
      displayName: 'Multiple Choice (Multi-Select)',
      description: 'Multiple correct options selectable by learner. Authoring validated.',
      evaluatorStatus: 'AUTHORING_ONLY',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const options = (content as any).options;
        if (!Array.isArray(options) || options.length < 2) {
          errors.push('MULTIPLE_CHOICE content must include at least 2 options.');
        } else {
          const ids = new Set<string>();
          for (const opt of options) {
            if (!opt || typeof opt !== 'object') {
              errors.push('Each option must be a valid non-null object.');
              continue;
            }
            if (!opt.id || typeof opt.id !== 'string' || opt.id.trim().length === 0) {
              errors.push('Each option must have a non-empty string id.');
            } else if (ids.has(opt.id)) {
              errors.push(`Duplicate option id '${opt.id}'.`);
            } else {
              ids.add(opt.id);
            }
            if (typeof opt.text !== 'string' || opt.text.trim().length === 0) {
              errors.push(`Option '${opt?.id || 'unknown'}' must have non-empty text.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const correctIds = (answerKey as any).correctOptionIds;
        if (!Array.isArray(correctIds) || correctIds.length === 0) {
          errors.push('MULTIPLE_CHOICE answerKey must specify a non-empty array of correctOptionIds.');
        } else {
          const rawOptions = (content as any)?.options;
          const options = Array.isArray(rawOptions)
            ? rawOptions.filter((o) => o && typeof o === 'object')
            : [];
          for (const cid of correctIds) {
            if (!options.some((o) => o.id === cid)) {
              errors.push(`correctOptionId '${cid}' does not match any configured option.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        const rawOptions = (content as any)?.options;
        const options = Array.isArray(rawOptions)
          ? rawOptions.filter((o) => o && typeof o === 'object')
          : [];
        return {
          prompt: (content as any).prompt,
          options: options.map((o) => ({ id: String(o.id ?? ''), text: String(o.text ?? '') })),
          shuffleOptions: (content as any).shuffleOptions,
        };
      },
    };
  }

  private createTrueFalseDefinition(): QuestionTypeDefinition {
    return {
      type: 'TRUE_FALSE',
      displayName: 'True / False',
      description: 'Binary proposition evaluation. Working deterministic auto-evaluator.',
      evaluatorStatus: 'WORKING_EVALUATOR',
      validateContent(content) {
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        return { valid: true, errors: [] };
      },
      validateAnswerKey(_content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        if (typeof (answerKey as any).correctValue !== 'boolean') {
          errors.push('TRUE_FALSE answerKey must specify boolean correctValue.');
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        return {
          prompt: (content as any).prompt,
        };
      },
    };
  }

  private createClozeDefinition(): QuestionTypeDefinition {
    return {
      type: 'CLOZE',
      displayName: 'Cloze (Fill-in-the-Blank)',
      description: 'Text passage with blanks evaluated via deterministic Unicode NFKC normalization. Working evaluator.',
      evaluatorStatus: 'WORKING_EVALUATOR',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const templateText = (content as any).templateText;
        if (typeof templateText !== 'string' || templateText.trim().length === 0) {
          errors.push('CLOZE content must include non-empty templateText.');
        }
        const blanks = (content as any).targetBlanks;
        if (!Array.isArray(blanks) || blanks.length === 0) {
          errors.push('CLOZE content must define at least one blank in targetBlanks.');
        } else {
          for (const b of blanks) {
            if (!b || typeof b !== 'object') {
              errors.push('Each target blank must be a valid non-null object.');
              continue;
            }
            if (!b.blankKey || typeof b.blankKey !== 'string' || b.blankKey.trim().length === 0) {
              errors.push('Each target blank must have a non-empty string blankKey.');
            } else if (templateText && !templateText.includes(`{{${b.blankKey}}}`)) {
              errors.push(`templateText is missing placeholder '{{${b.blankKey}}}'.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const blanks = (answerKey as any).blanks;
        if (!blanks || typeof blanks !== 'object' || Array.isArray(blanks)) {
          errors.push('CLOZE answerKey must include blanks dictionary object.');
        } else {
          const rawBlanks = (content as any)?.targetBlanks;
          const targets = Array.isArray(rawBlanks)
            ? rawBlanks.filter((t) => t && typeof t === 'object' && typeof t.blankKey === 'string')
            : [];
          for (const target of targets) {
            const variants = Object.prototype.hasOwnProperty.call(blanks, target.blankKey)
              ? blanks[target.blankKey]
              : undefined;
            if (!Array.isArray(variants) || variants.length === 0) {
              errors.push(`CLOZE answerKey.blanks must provide at least one variant for '${target.blankKey}'.`);
            } else {
              for (const v of variants) {
                if (typeof v !== 'string' || v.trim().length === 0) {
                  errors.push(`Variant for '${target.blankKey}' must be a non-empty string.`);
                }
              }
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        const rawBlanks = (content as any)?.targetBlanks;
        const blanks = Array.isArray(rawBlanks)
          ? rawBlanks.filter((b) => b && typeof b === 'object')
          : [];
        return {
          prompt: (content as any).prompt,
          templateText: (content as any).templateText,
          targetBlanks: blanks.map((b) => ({
            blankKey: String(b.blankKey ?? ''),
            ...(b.hint ? { hint: String(b.hint) } : {}),
          })),
        };
      },
    };
  }

  private createShortTextDefinition(): QuestionTypeDefinition {
    return {
      type: 'SHORT_TEXT',
      displayName: 'Short Text Response',
      description: 'Single word or short phrase response. Authoring validated.',
      evaluatorStatus: 'AUTHORING_ONLY',
      validateContent(content) {
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        return { valid: true, errors: [] };
      },
      validateAnswerKey(_content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const acceptable = (answerKey as any).acceptableAnswers;
        if (!Array.isArray(acceptable) || acceptable.length === 0) {
          errors.push('SHORT_TEXT answerKey must specify acceptableAnswers array.');
        } else {
          for (const a of acceptable) {
            if (typeof a !== 'string' || a.trim().length === 0) {
              errors.push('Each acceptableAnswer must be a non-empty string.');
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        return {
          prompt: (content as any).prompt,
          placeholder: (content as any).placeholder,
        };
      },
    };
  }

  private createNumericDefinition(): QuestionTypeDefinition {
    return {
      type: 'NUMERIC',
      displayName: 'Numeric Response',
      description: 'Numeric answer with absolute or percentage tolerance policy. Authoring validated.',
      evaluatorStatus: 'AUTHORING_ONLY',
      validateContent(content) {
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        return { valid: true, errors: [] };
      },
      validateAnswerKey(_content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const val = (answerKey as any).correctValue;
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          errors.push('NUMERIC answerKey must specify a finite numeric correctValue.');
        }
        const tol = (answerKey as any).tolerance;
        if (typeof tol !== 'number' || tol < 0) {
          errors.push('NUMERIC answerKey tolerance must be a non-negative number.');
        }
        const tolType = (answerKey as any).toleranceType;
        if (tolType !== 'ABSOLUTE' && tolType !== 'PERCENT') {
          errors.push("NUMERIC answerKey toleranceType must be 'ABSOLUTE' or 'PERCENT'.");
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        return {
          prompt: (content as any).prompt,
          unit: (content as any).unit,
        };
      },
    };
  }

  private createEssayDefinition(): QuestionTypeDefinition {
    return {
      type: 'ESSAY',
      displayName: 'Essay / Extended Response (Rubric Graded)',
      description: 'Open-ended extended written response evaluated strictly via human rubrics. Auto-grading prohibited.',
      evaluatorStatus: 'RUBRIC_GRADED_ONLY',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const minW = (content as any).minWords;
        const maxW = (content as any).maxWords;
        if (minW !== undefined && (typeof minW !== 'number' || minW < 0)) {
          errors.push('minWords must be a non-negative integer.');
        }
        if (maxW !== undefined && (typeof maxW !== 'number' || maxW <= 0)) {
          errors.push('maxWords must be a positive integer.');
        }
        if (minW !== undefined && maxW !== undefined && minW > maxW) {
          errors.push('minWords cannot exceed maxWords.');
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(_content, answerKey) {
        // ESSAYS MUST NEVER HAVE AN AUTOMATED ANSWER KEY!
        if (answerKey && Object.keys(answerKey).length > 0) {
          return {
            valid: false,
            errors: [
              'ESSAY questions cannot have automated answerKey. Essays must be graded using rubrics.',
            ],
          };
        }
        return { valid: true, errors: [] };
      },
      validateRubric(rubric) {
        if (!rubric) {
          return { valid: true, errors: [] };
        }
        if (typeof rubric !== 'object') {
          return { valid: false, errors: ['Essay rubric must be a valid non-null object.'] };
        }
        const errors: string[] = [];
        if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
          errors.push('Essay rubric must define at least one criterion.');
        } else {
          for (const crit of rubric.criteria) {
            if (!crit || typeof crit !== 'object') {
              errors.push('Each rubric criterion must be a valid non-null object.');
              continue;
            }
            if (typeof crit.id !== 'string' || crit.id.trim().length === 0) {
              errors.push('Each rubric criterion must have a non-empty string id.');
            }
            if (typeof crit.name !== 'string' || crit.name.trim().length === 0) {
              errors.push('Each rubric criterion must have a name.');
            }
            if (typeof crit.maxPoints !== 'number' || !Number.isFinite(crit.maxPoints) || crit.maxPoints <= 0) {
              errors.push(`Criterion '${crit?.name || 'unnamed'}' must have positive numeric maxPoints.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        return {
          prompt: (content as any).prompt,
          minWords: (content as any).minWords,
          maxWords: (content as any).maxWords,
        };
      },
    };
  }

  private createMatchingDefinition(): QuestionTypeDefinition {
    return {
      type: 'MATCHING',
      displayName: 'Matching Pairs',
      description: 'Associating premises with corresponding targets. Authoring validated.',
      evaluatorStatus: 'AUTHORING_ONLY',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const premises = (content as any).premises;
        const targets = (content as any).targets;
        if (!Array.isArray(premises) || premises.length < 2) {
          errors.push('MATCHING content must include at least 2 premises.');
        } else {
          const premiseIds = new Set<string>();
          for (const p of premises) {
            if (!p || typeof p !== 'object') {
              errors.push('Each premise must be a valid non-null object.');
              continue;
            }
            if (typeof p.id !== 'string' || p.id.trim().length === 0) {
              errors.push('Each premise must have a non-empty string id.');
            } else if (premiseIds.has(p.id)) {
              errors.push(`Duplicate premise id '${p.id}'.`);
            } else {
              premiseIds.add(p.id);
            }
            if (typeof p.text !== 'string' || p.text.trim().length === 0) {
              errors.push(`Premise '${p?.id || 'unknown'}' must have non-empty text.`);
            }
          }
        }
        if (!Array.isArray(targets) || targets.length < 2) {
          errors.push('MATCHING content must include at least 2 targets.');
        } else {
          const targetIds = new Set<string>();
          for (const t of targets) {
            if (!t || typeof t !== 'object') {
              errors.push('Each target must be a valid non-null object.');
              continue;
            }
            if (typeof t.id !== 'string' || t.id.trim().length === 0) {
              errors.push('Each target must have a non-empty string id.');
            } else if (targetIds.has(t.id)) {
              errors.push(`Duplicate target id '${t.id}'.`);
            } else {
              targetIds.add(t.id);
            }
            if (typeof t.text !== 'string' || t.text.trim().length === 0) {
              errors.push(`Target '${t?.id || 'unknown'}' must have non-empty text.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const pairs = (answerKey as any).pairs;
        if (!pairs || typeof pairs !== 'object' || Array.isArray(pairs)) {
          errors.push('MATCHING answerKey must specify pairs object.');
        } else {
          const rawPremises = (content as any)?.premises;
          const premises = Array.isArray(rawPremises)
            ? rawPremises.filter((p) => p && typeof p === 'object' && typeof p.id === 'string')
            : [];
          const rawTargets = (content as any)?.targets;
          const targets = Array.isArray(rawTargets)
            ? rawTargets.filter((t) => t && typeof t === 'object' && typeof t.id === 'string')
            : [];

          // P2 REQUIREMENT: All premises must have an answer mapping (using hasOwnProperty to guard against prototype property collisions)
          for (const premise of premises) {
            if (!Object.prototype.hasOwnProperty.call(pairs, premise.id)) {
              errors.push(`Missing answer mapping for premise '${premise.id}'.`);
            }
          }

          for (const [premiseId, targetId] of Object.entries(pairs)) {
            if (!premises.some((p) => p.id === premiseId)) {
              errors.push(`Unknown premise id '${premiseId}' in answerKey pairs.`);
            }
            if (typeof targetId !== 'string' || !targets.some((t) => t.id === targetId)) {
              errors.push(`Invalid or unknown target id '${targetId}' in answerKey pairs.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        const rawPremises = (content as any)?.premises;
        const premises = Array.isArray(rawPremises)
          ? rawPremises.filter((p) => p && typeof p === 'object')
          : [];
        const rawTargets = (content as any)?.targets;
        const targets = Array.isArray(rawTargets)
          ? rawTargets.filter((t) => t && typeof t === 'object')
          : [];
        return {
          ...(typeof (content as any)?.prompt === 'string' ? { prompt: (content as any).prompt } : {}),
          premises: premises.map((p) => ({
            id: String(p.id ?? ''),
            text: String(p.text ?? ''),
          })),
          targets: targets.map((t) => ({
            id: String(t.id ?? ''),
            text: String(t.text ?? ''),
          })),
        };
      },
    };
  }

  private createOrderingDefinition(): QuestionTypeDefinition {
    return {
      type: 'ORDERING',
      displayName: 'Sequence Ordering',
      description: 'Sequencing items in correct chronological, procedural or logical order. Authoring validated.',
      evaluatorStatus: 'AUTHORING_ONLY',
      validateContent(content) {
        const errors: string[] = [];
        if (!content || typeof content !== 'object') {
          return { valid: false, errors: ['content must be a non-null object.'] };
        }
        const items = (content as any).items;
        if (!Array.isArray(items) || items.length < 2) {
          errors.push('ORDERING content must include at least 2 items.');
        } else {
          const ids = new Set<string>();
          for (const item of items) {
            if (!item || typeof item !== 'object') {
              errors.push('Each ordering item must be a valid non-null object.');
              continue;
            }
            if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
              errors.push('Each ordering item must have a string id.');
            } else if (ids.has(item.id)) {
              errors.push(`Duplicate item id '${item.id}'.`);
            } else {
              ids.add(item.id);
            }
            if (typeof item.text !== 'string' || item.text.trim().length === 0) {
              errors.push(`Ordering item '${item?.id || 'unknown'}' must have non-empty text.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      validateAnswerKey(content, answerKey) {
        if (!answerKey) {
          return { valid: true, errors: [] };
        }
        const errors: string[] = [];
        const seq = (answerKey as any).correctSequence;
        if (!Array.isArray(seq)) {
          errors.push('ORDERING answerKey must specify correctSequence array.');
        } else {
          const rawItems = (content as any)?.items;
          const items = Array.isArray(rawItems)
            ? rawItems.filter((i) => i && typeof i === 'object' && typeof i.id === 'string')
            : [];
          if (seq.length !== items.length) {
            errors.push('correctSequence length must match items length.');
          }

          // P2 REQUIREMENT: Enforce permutation integrity (no duplicate items, no missing items)
          const seenSeqIds = new Set<string>();
          for (const id of seq) {
            if (typeof id !== 'string') {
              errors.push('Each element in correctSequence must be a string item id.');
              continue;
            }
            if (seenSeqIds.has(id)) {
              errors.push(`Duplicate item id '${id}' in correctSequence.`);
            } else {
              seenSeqIds.add(id);
            }
            if (!items.some((i) => i.id === id)) {
              errors.push(`correctSequence contains unknown item id '${id}'.`);
            }
          }

          for (const item of items) {
            if (!seenSeqIds.has(item.id)) {
              errors.push(`correctSequence is missing configured item id '${item.id}'.`);
            }
          }
        }
        return { valid: errors.length === 0, errors };
      },
      sanitizeForLearner(content) {
        const rawItems = (content as any)?.items;
        const items = Array.isArray(rawItems)
          ? rawItems.filter((i) => i && typeof i === 'object')
          : [];
        return {
          ...(typeof (content as any)?.prompt === 'string' ? { prompt: (content as any).prompt } : {}),
          items: items.map((i) => ({
            id: String(i.id ?? ''),
            text: String(i.text ?? ''),
          })),
        };
      },
    };
  }
}
