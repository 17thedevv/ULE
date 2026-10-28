import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { DraftBlocksService } from '../abp/draft-blocks.service';
import { BlockTypeRegistry } from '../abp/registry/block-type.registry';
import { MCP_AUTHORING_TOOLS, MCP_SCOPES } from '@ule/contracts';
import { mcpContextStorage, McpAuthContext } from './mcp.context';

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  public handler!: ReturnType<typeof createMcpHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
    private readonly draftBlocksService: DraftBlocksService,
    private readonly blockTypeRegistry: BlockTypeRegistry,
  ) {}

  onModuleInit() {
    this.handler = createMcpHandler(() => this.createMcpServerInstance());
    this.logger.log('MCP Authoring Server connected with Streamable HTTP handler');
  }

  /**
   * Dispatches incoming WebStandard Request to the MCP transport.
   */
  async handleTransportRequest(
    request: Request,
    authContext?: McpAuthContext,
  ): Promise<Response> {
    if (authContext) {
      return mcpContextStorage.run(authContext, () =>
        this.handler.fetch(request, {
          authInfo: {
            token: 'authenticated',
            clientId: authContext.clientId,
            scopes: authContext.scopes,
            userId: authContext.userId,
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          } as any,
        }),
      );
    }
    return this.handler.fetch(request);
  }

  private createMcpServerInstance(): McpServer {
    const server = new McpServer({
      name: 'ule-mcp-authoring',
      version: '0.1.0',
    });
    this.registerTools(server);
    return server;
  }

  private registerTools(server: McpServer) {
    // =========================================================================
    // 1. DISCOVERY TOOLS (Scope: course:read)
    // =========================================================================

    server.registerTool(
      MCP_AUTHORING_TOOLS.GET_AUTHORING_CAPABILITIES,
      {
        description:
          'Get authoring capabilities, invariants, and supported block types in ULE.',
      },
      async () => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.GET_AUTHORING_CAPABILITIES,
          MCP_SCOPES.READ,
          async () => {
            const manifests = this.blockTypeRegistry.listManifests();
            return {
              version: '1.0.0',
              architecture: 'NestJS Modular Monolith + PostgreSQL + Prisma',
              enforcesOwnership: true,
              visibilityDefault: 'PRIVATE',
              supportedBlockTypes: manifests.map((m) => m.id),
              optimisticConcurrencyRequired: true,
              immutableVersionsEnforced: true,
              prohibitedOperations: [
                'submit_learner_attempt',
                'alter_mastery',
                'complete_quest',
                'grant_xp_or_rewards',
                'publish_course_publicly',
                'approve_course_versions',
                'modify_block_type_definitions',
                'execute_arbitrary_code',
              ],
            };
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.LIST_BLOCK_TYPES,
      {
        description: 'List available Activity Block Types and their capabilities.',
      },
      async () => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.LIST_BLOCK_TYPES,
          MCP_SCOPES.READ,
          async () => {
            const manifests = this.blockTypeRegistry.listManifests();
            return manifests.map((m) => ({
              blockTypeId: m.id,
              typeVersion: m.version,
              name: m.name,
              description: m.description,
              capabilities: m.capabilities,
            }));
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.GET_BLOCK_TYPE_SCHEMA,
      {
        description:
          'Get creator configuration schema for a specific Activity Block Type. Secret answer keys and evaluators are omitted.',
        inputSchema: z.object({
          blockTypeId: z
            .string()
            .min(1)
            .describe("Block type identifier (e.g. 'video', 'multiple-choice')"),
          typeVersion: z
            .string()
            .optional()
            .describe("Type version (defaults to '1.0.0')"),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.GET_BLOCK_TYPE_SCHEMA,
          MCP_SCOPES.READ,
          async () => {
            const def = this.blockTypeRegistry.getDefinition(
              args.blockTypeId,
              args.typeVersion,
            );
            return {
              blockTypeId: def.manifest.id,
              typeVersion: def.manifest.version,
              name: def.manifest.name,
              description: def.manifest.description,
              capabilities: def.manifest.capabilities,
              configSchema: def.manifest.schemaDescription,
              authoringGuidelines:
                def.manifest.id === 'video'
                  ? 'Video content is renderable and completable, but strictly non-evaluatable.'
                  : def.manifest.id === 'multiple-choice'
                    ? 'MCQ requires question, at least 2 options, and answerKey matching one option.'
                    : 'Configure according to JSON schema.',
            };
          },
        );
      },
    );

    // =========================================================================
    // 2. PRIVATE COURSE CORE TOOLS (Scopes: read / write)
    // =========================================================================

    server.registerTool(
      MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE,
      {
        description:
          'Create a new private Course and CourseDraft. Visibility is strictly PRIVATE.',
        inputSchema: z.object({
          title: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe('Title of the course draft'),
          description: z
            .string()
            .max(2000)
            .optional()
            .describe('Description of the course'),
          summary: z
            .string()
            .max(500)
            .optional()
            .describe('Brief summary of the course'),
          idempotencyKey: z
            .string()
            .optional()
            .describe('Client idempotency key for durable deduplication'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                const title = args.title || 'Untitled Private Course';
                return this.coursesService.createCourse(auth.userId, {
                  title,
                  description: args.description,
                  summary: args.summary,
                });
              },
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.LIST_MY_COURSES,
      {
        description:
          'List all private courses owned by the authenticated creator.',
      },
      async () => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.LIST_MY_COURSES,
          MCP_SCOPES.READ,
          async (auth) => {
            return this.coursesService.listCourses(auth.userId);
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.GET_MY_COURSE,
      {
        description: 'Get details of an owned Course by courseId.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.GET_MY_COURSE,
          MCP_SCOPES.READ,
          async (auth) => {
            return this.coursesService.getCourse(args.courseId, auth.userId);
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.GET_COURSE_DRAFT,
      {
        description:
          'Get the active CourseDraft and its current blocks for an owned Course.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.GET_COURSE_DRAFT,
          MCP_SCOPES.READ,
          async (auth) => {
            const draft = await this.coursesService.getDraft(
              args.courseId,
              auth.userId,
            );
            const blocks = await this.draftBlocksService.listDraftBlocks(
              args.courseId,
              auth.userId,
            );
            return {
              ...draft,
              blocks,
            };
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.UPDATE_COURSE_DRAFT,
      {
        description:
          'Update metadata of a CourseDraft under atomic revision check.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected revision for optimistic concurrency check'),
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(2000).optional(),
          summary: z.string().max(500).optional(),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.UPDATE_COURSE_DRAFT,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.UPDATE_COURSE_DRAFT,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.coursesService.updateDraft(
                  args.courseId,
                  auth.userId,
                  {
                    title: args.title,
                    description: args.description,
                    summary: args.summary,
                    expectedRevision: args.expectedRevision,
                  },
                );
              },
            );
          },
        );
      },
    );

    // =========================================================================
    // 3. DRAFT BLOCK AUTHORING TOOLS (Scopes: read / write)
    // =========================================================================

    server.registerTool(
      MCP_AUTHORING_TOOLS.LIST_DRAFT_BLOCKS,
      {
        description: 'List draft block instances in an owned CourseDraft.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.LIST_DRAFT_BLOCKS,
          MCP_SCOPES.READ,
          async (auth) => {
            return this.draftBlocksService.listDraftBlocks(
              args.courseId,
              auth.userId,
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK,
      {
        description:
          'Add a validated block instance to a CourseDraft under atomic revision check.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected draft revision'),
          blockTypeId: z
            .string()
            .min(1)
            .describe("Block type (e.g. 'video', 'multiple-choice')"),
          typeVersion: z.string().optional().default('1.0.0'),
          title: z.string().min(1).max(200).describe('Block title'),
          orderIndex: z.number().int().min(0).optional(),
          config: z
            .record(z.string(), z.unknown())
            .describe('Block creator configuration matching schema'),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.draftBlocksService.addDraftBlock(
                  args.courseId,
                  auth.userId,
                  {
                    blockTypeId: args.blockTypeId,
                    typeVersion: args.typeVersion,
                    title: args.title,
                    orderIndex: args.orderIndex,
                    config: args.config,
                    expectedRevision: args.expectedRevision,
                  },
                );
              },
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.UPDATE_DRAFT_BLOCK,
      {
        description:
          'Update an existing draft block instance under atomic revision check.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          blockId: z.string().uuid().describe('Block instance ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected draft revision'),
          title: z.string().min(1).max(200).optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.UPDATE_DRAFT_BLOCK,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.UPDATE_DRAFT_BLOCK,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.draftBlocksService.updateDraftBlock(
                  args.courseId,
                  args.blockId,
                  auth.userId,
                  {
                    title: args.title,
                    config: args.config,
                    expectedRevision: args.expectedRevision,
                  },
                );
              },
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.DELETE_DRAFT_BLOCK,
      {
        description:
          'Delete a draft block instance under atomic revision check.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          blockId: z.string().uuid().describe('Block instance ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected draft revision'),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.DELETE_DRAFT_BLOCK,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.DELETE_DRAFT_BLOCK,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.draftBlocksService.deleteDraftBlock(
                  args.courseId,
                  auth.userId,
                  args.blockId,
                  args.expectedRevision,
                );
              },
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.REORDER_DRAFT_BLOCKS,
      {
        description:
          'Reorder draft block instances in an owned CourseDraft atomically.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected draft revision'),
          blockIds: z
            .array(z.string().uuid())
            .min(1)
            .describe(
              'Complete list of draft block IDs ordered by intended display sequence',
            ),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.REORDER_DRAFT_BLOCKS,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.REORDER_DRAFT_BLOCKS,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.draftBlocksService.reorderDraftBlocks(
                  args.courseId,
                  auth.userId,
                  {
                    expectedRevision: args.expectedRevision,
                    blockIds: args.blockIds,
                  },
                );
              },
            );
          },
        );
      },
    );

    // =========================================================================
    // 4. VALIDATION & IMMUTABLE VERSIONS (Scopes: read / write)
    // =========================================================================

    server.registerTool(
      MCP_AUTHORING_TOOLS.VALIDATE_COURSE_DRAFT,
      {
        description:
          'Validate all block instances in a CourseDraft against developer schemas and ABP invariants.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.VALIDATE_COURSE_DRAFT,
          MCP_SCOPES.READ,
          async (auth) => {
            const draft = await this.coursesService.getDraft(
              args.courseId,
              auth.userId,
            );
            const blocks = await this.draftBlocksService.listDraftBlocks(
              args.courseId,
              auth.userId,
            );

            const errors: Array<{
              blockId?: string;
              blockTitle?: string;
              message: string;
            }> = [];

            for (const b of blocks) {
              try {
                const res = this.blockTypeRegistry.validateConfig(
                  b.blockTypeId,
                  b.config,
                  b.id,
                  b.title,
                  b.typeVersion,
                );
                if (!res.valid && res.errors) {
                  for (const errMessage of res.errors) {
                    errors.push({
                      blockId: b.id,
                      blockTitle: b.title,
                      message: errMessage,
                    });
                  }
                }
              } catch (err: unknown) {
                const msg =
                  err instanceof HttpException
                    ? err.message
                    : (err as Error).message || 'Invalid block configuration';
                errors.push({
                  blockId: b.id,
                  blockTitle: b.title,
                  message: msg,
                });
              }
            }

            return {
              courseId: args.courseId,
              draftId: draft.id,
              revision: draft.revision,
              valid: errors.length === 0,
              blockCount: blocks.length,
              errors,
            };
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION,
      {
        description:
          'Create an immutable CourseVersion from the current draft snapshot under aggregate row lock.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          idempotencyKey: z.string().optional(),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION,
          MCP_SCOPES.WRITE,
          async (auth) => {
            return this.executeWithIdempotency(
              MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION,
              args.idempotencyKey,
              args as unknown as Record<string, unknown>,
              auth.userId,
              auth.clientId,
              async () => {
                return this.coursesService.createVersion(
                  args.courseId,
                  auth.userId,
                );
              },
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.LIST_COURSE_VERSIONS,
      {
        description: 'List immutable CourseVersions for an owned Course.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.LIST_COURSE_VERSIONS,
          MCP_SCOPES.READ,
          async (auth) => {
            return this.coursesService.listVersions(
              args.courseId,
              auth.userId,
            );
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.GET_COURSE_VERSION,
      {
        description:
          'Get a specific immutable CourseVersion and its pinned snapshot.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          versionId: z.string().uuid().describe('Version ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.GET_COURSE_VERSION,
          MCP_SCOPES.READ,
          async (auth) => {
            return this.coursesService.getVersion(
              args.courseId,
              args.versionId,
              auth.userId,
            );
          },
        );
      },
    );
  }

  // =========================================================================
  // TOOL EXECUTION WRAPPER & SECURITY PIPELINE
  // =========================================================================

  private async executeTool<T>(
    toolName: string,
    requiredScope: string,
    action: (auth: McpAuthContext) => Promise<T>,
  ) {
    const auth = mcpContextStorage.getStore();
    if (!auth || !auth.userId) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: '[Unauthorized] Authentication required. Please provide a valid OAuth Bearer access token.',
          },
        ],
      };
    }

    if (!auth.scopes.includes(requiredScope)) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `[Forbidden] Insufficient scope. Tool '${toolName}' requires scope '${requiredScope}', but token granted '${auth.scopes.join(' ')}'.`,
          },
        ],
      };
    }

    try {
      const result = await action(auth);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      let status = 500;
      let message = 'An internal error occurred during tool execution.';

      if (err instanceof HttpException) {
        status = err.getStatus();
        message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }

      this.logger.warn(`MCP Tool '${toolName}' failed (${status}): ${message}`);

      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `[Error ${status}] ${message}`,
          },
        ],
      };
    }
  }

  // =========================================================================
  // DURABLE IDEMPOTENCY & AUDIT LOGGING PIPELINE
  // =========================================================================

  private async executeWithIdempotency<T>(
    toolName: string,
    idempotencyKey: string | undefined,
    rawPayload: Record<string, unknown>,
    userId: string,
    clientId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!idempotencyKey) {
      const result = await action();
      await this.recordAuditLog(userId, clientId, toolName, 'EXECUTE', result);
      return result;
    }

    const normalizedHash = this.computePayloadHash(rawPayload);

    // 1. Check existing record
    const existing = await this.prisma.mcpMutationIdempotency.findUnique({
      where: {
        userId_toolName_idempotencyKey: {
          userId,
          toolName,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      if (existing.payloadHash !== normalizedHash) {
        throw new ConflictException(
          `Idempotency key '${idempotencyKey}' was already used with different payload data for tool '${toolName}'.`,
        );
      }
      return existing.response as T;
    }

    // 2. Execute authoritative domain mutation
    const result = await action();

    // 3. Persist idempotency result
    try {
      await this.prisma.mcpMutationIdempotency.create({
        data: {
          userId,
          toolName,
          idempotencyKey,
          payloadHash: normalizedHash,
          response: result as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      // Handle concurrent insert collision
      const duplicate = await this.prisma.mcpMutationIdempotency.findUnique({
        where: {
          userId_toolName_idempotencyKey: {
            userId,
            toolName,
            idempotencyKey,
          },
        },
      });

      if (duplicate) {
        if (duplicate.payloadHash !== normalizedHash) {
          throw new ConflictException(
            `Idempotency key '${idempotencyKey}' was already used with different payload data for tool '${toolName}'.`,
          );
        }
        return duplicate.response as T;
      }
      throw err;
    }

    // 4. Record audit log entry
    await this.recordAuditLog(
      userId,
      clientId,
      toolName,
      'EXECUTE',
      result,
      idempotencyKey,
    );

    return result;
  }

  private async recordAuditLog(
    userId: string,
    clientId: string,
    toolName: string,
    action: string,
    result: unknown,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      const resourceType = 'COURSE';
      let resourceId: string | null = null;

      if (typeof result === 'object' && result !== null) {
        const res = result as Record<string, unknown>;
        if (res.course && typeof res.course === 'object') {
          resourceId = String((res.course as Record<string, unknown>).id || '');
        } else if (res.id) {
          resourceId = String(res.id);
        } else if (res.courseId) {
          resourceId = String(res.courseId);
        }
      }

      await this.prisma.mcpAuditLog.create({
        data: {
          userId,
          clientId,
          toolName,
          action,
          resourceType,
          resourceId,
          idempotencyKey: idempotencyKey ?? null,
          status: 'SUCCESS',
          details: {
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to record MCP audit log: ${e}`);
    }
  }

  private computePayloadHash(payload: Record<string, unknown>): string {
    const normalized = this.normalizeObject(payload);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private normalizeObject(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }
    const record = obj as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (key === 'idempotencyKey') continue; // exclude key from payload hash
      const val = record[key];
      if (val !== undefined) {
        sorted[key] =
          typeof val === 'object' && val !== null
            ? this.normalizeObject(val)
            : val;
      }
    }
    return sorted;
  }
}
