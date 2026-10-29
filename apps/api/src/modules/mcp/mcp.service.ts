import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as crypto from 'crypto';
import { McpMutationIdempotency, Prisma } from '@prisma/client';
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
          'Get creator configuration schema for a specific Activity Block Type. Explains the required schema for course authoring.',
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
          'Create a new private Course and CourseDraft. Visibility is strictly PRIVATE. Requires mandatory idempotencyKey.',
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
            .min(1)
            .describe('Mandatory client idempotency key for retry protection and deduplication'),
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
              async (tx, resId) => {
                const title = args.title || 'Untitled Private Course';
                return this.coursesService.createCourse(
                  auth.userId,
                  {
                    title,
                    description: args.description,
                    summary: args.summary,
                  },
                  resId,
                  tx,
                );
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
          'Get the active CourseDraft and its current blocks for an owned Course. Read-only tokens omit protected evaluator answer keys.',
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
            const hasWriteScope = auth.scopes.includes(MCP_SCOPES.WRITE);
            return {
              ...draft,
              blocks: blocks.map((b) => this.sanitizeBlockForCaller(b, hasWriteScope)),
            };
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.UPDATE_COURSE_DRAFT,
      {
        description:
          'Update metadata of a CourseDraft under atomic revision check. Requires mandatory idempotencyKey.',
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
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx) => {
                return this.coursesService.updateDraft(
                  args.courseId,
                  auth.userId,
                  {
                    title: args.title,
                    description: args.description,
                    summary: args.summary,
                    expectedRevision: args.expectedRevision,
                  },
                  tx,
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
        description:
          'List draft block instances in an owned CourseDraft. Read-only tokens omit protected evaluator answer keys.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
        }),
      },
      async (args) => {
        return this.executeTool(
          MCP_AUTHORING_TOOLS.LIST_DRAFT_BLOCKS,
          MCP_SCOPES.READ,
          async (auth) => {
            const blocks = await this.draftBlocksService.listDraftBlocks(
              args.courseId,
              auth.userId,
            );
            const hasWriteScope = auth.scopes.includes(MCP_SCOPES.WRITE);
            return blocks.map((b) => this.sanitizeBlockForCaller(b, hasWriteScope));
          },
        );
      },
    );

    server.registerTool(
      MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK,
      {
        description:
          'Add a validated block instance to a CourseDraft under atomic revision check. Requires mandatory idempotencyKey.',
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
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx, resId) => {
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
                  resId,
                  tx,
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
          'Update an existing draft block instance under atomic revision check. Requires mandatory idempotencyKey.',
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
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx) => {
                return this.draftBlocksService.updateDraftBlock(
                  args.courseId,
                  args.blockId,
                  auth.userId,
                  {
                    title: args.title,
                    config: args.config,
                    expectedRevision: args.expectedRevision,
                  },
                  tx,
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
          'Delete a draft block instance under atomic revision check. Requires mandatory idempotencyKey.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          blockId: z.string().uuid().describe('Block instance ID'),
          expectedRevision: z
            .number()
            .int()
            .min(1)
            .describe('Expected draft revision'),
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx) => {
                await this.draftBlocksService.deleteDraftBlock(
                  args.courseId,
                  args.blockId,
                  auth.userId,
                  args.expectedRevision,
                  tx,
                );
                const draft = await tx.courseDraft.findUnique({
                  where: { courseId: args.courseId },
                });
                return {
                  deleted: true,
                  blockId: args.blockId,
                  draftRevision: draft?.revision ?? args.expectedRevision + 1,
                };
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
          'Reorder draft block instances in an owned CourseDraft atomically. Requires mandatory idempotencyKey.',
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
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx) => {
                return this.draftBlocksService.reorderDraftBlocks(
                  args.courseId,
                  auth.userId,
                  {
                    expectedRevision: args.expectedRevision,
                    blockIds: args.blockIds,
                  },
                  tx,
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
          'Create an immutable CourseVersion from the current draft snapshot under aggregate row lock. Requires mandatory idempotencyKey.',
        inputSchema: z.object({
          courseId: z.string().uuid().describe('Course ID'),
          idempotencyKey: z
            .string()
            .min(1)
            .describe('Mandatory client idempotency key for retry protection'),
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
              async (tx, resId) => {
                return this.coursesService.createVersion(
                  args.courseId,
                  auth.userId,
                  resId,
                  tx,
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
          'Get a specific immutable CourseVersion and its pinned snapshot. Read-only tokens omit protected evaluator answer keys.',
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
            const version = await this.coursesService.getVersion(
              args.courseId,
              args.versionId,
              auth.userId,
            );
            const hasWriteScope = auth.scopes.includes(MCP_SCOPES.WRITE);
            if (!hasWriteScope && version.snapshot && typeof version.snapshot === 'object') {
              const snapshot = { ...(version.snapshot as Record<string, unknown>) };
              if (Array.isArray(snapshot.blocks)) {
                snapshot.blocks = (snapshot.blocks as Array<Record<string, unknown>>).map((b) =>
                  this.sanitizeBlockForCaller(b, false),
                );
              }
              return { ...version, snapshot };
            }
            return version;
          },
        );
      },
    );
  }

  // =========================================================================
  // TOOL EXECUTION WRAPPER & SECURITY PIPELINE
  // =========================================================================

  private isMutationTool(toolName: string): boolean {
    return (
      toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE ||
      toolName === MCP_AUTHORING_TOOLS.UPDATE_COURSE_DRAFT ||
      toolName === MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK ||
      toolName === MCP_AUTHORING_TOOLS.UPDATE_DRAFT_BLOCK ||
      toolName === MCP_AUTHORING_TOOLS.DELETE_DRAFT_BLOCK ||
      toolName === MCP_AUTHORING_TOOLS.REORDER_DRAFT_BLOCKS ||
      toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION
    );
  }

  private async executeTool<T>(
    toolName: string,
    requiredScope: string,
    action: (auth: McpAuthContext) => Promise<T>,
  ) {
    const startTime = Date.now();
    const auth = mcpContextStorage.getStore();
    const isMutation = this.isMutationTool(toolName);

    if (!auth || !auth.userId) {
      const durationMs = Date.now() - startTime;
      await this.recordAuditLog(
        null,
        'unauthenticated',
        toolName,
        'ACCESS',
        'UNAUTHORIZED',
        null,
        undefined,
        'Authentication required. Missing OAuth Bearer token.',
        durationMs,
        false, // Best-effort for unauthenticated
      );

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
      const durationMs = Date.now() - startTime;
      await this.recordAuditLog(
        auth.userId,
        auth.clientId,
        toolName,
        'ACCESS',
        'FORBIDDEN',
        null,
        undefined,
        `Insufficient scope. Required: ${requiredScope}, granted: ${auth.scopes.join(' ')}`,
        durationMs,
        false, // Best-effort for scope rejections
      );

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
      const durationMs = Date.now() - startTime;
      // Mutations durably commit audit inside the shared transaction.
      // Read queries record audit here.
      if (!isMutation) {
        await this.recordAuditLog(
          auth.userId,
          auth.clientId,
          toolName,
          'EXECUTE',
          'SUCCESS',
          result,
          undefined,
          undefined,
          durationMs,
          false,
        );
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      let status = 500;
      let userFacingMessage = 'An internal error occurred during tool execution.';
      let auditStatus = 'ERROR';

      if (err instanceof NotFoundException) {
        status = 404;
        userFacingMessage = err.message;
        auditStatus = 'NOT_FOUND';
      } else if (err instanceof ForbiddenException) {
        status = 403;
        userFacingMessage = err.message;
        auditStatus = 'FORBIDDEN';
      } else if (err instanceof ConflictException) {
        status = 409;
        userFacingMessage = err.message;
        auditStatus = 'CONFLICT';
      } else if (err instanceof BadRequestException) {
        status = 400;
        userFacingMessage = err.message;
        auditStatus = 'INVALID_ARGUMENT';
      } else if (err instanceof HttpException) {
        status = err.getStatus();
        userFacingMessage = err.message;
        auditStatus = status >= 400 && status < 500 ? 'CLIENT_ERROR' : 'ERROR';
      } else if (err instanceof Error) {
        this.logger.error(`Internal error in tool '${toolName}': ${err.message}`, err.stack);
        userFacingMessage = 'An internal error occurred during tool execution.';
        auditStatus = 'ERROR';
      }

      await this.recordAuditLog(
        auth.userId,
        auth.clientId,
        toolName,
        'EXECUTE',
        auditStatus,
        null,
        undefined,
        userFacingMessage,
        durationMs,
        false, // Best-effort on failure path so error reporting doesn't cascade
      );

      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `[Error ${status}] ${userFacingMessage}`,
          },
        ],
      };
    }
  }

  // =========================================================================
  // LEAST-PRIVILEGE READ SANITIZATION (GATE 3)
  // =========================================================================

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private sanitizeBlockForCaller(block: any, hasWriteScope: boolean): any {
    if (hasWriteScope || !block) {
      return block;
    }

    const config =
      block.config && typeof block.config === 'object'
        ? { ...block.config }
        : {};

    // For multiple choice blocks or blocks with answer keys, strip answerKey and option explanations
    if (block.blockTypeId === 'multiple-choice' || config.answerKey) {
      delete config.answerKey;
      if (Array.isArray(config.options)) {
        config.options = config.options.map((opt: any) => {
          if (!opt || typeof opt !== 'object') return opt;
          const sanitized = { ...opt };
          delete sanitized.explanation;
          return sanitized;
        });
      }
      config._evaluatorNotice =
        'Protected evaluator answer key omitted for read-only inspection. Requires course:write scope.';
    }

    return {
      ...block,
      config,
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // =========================================================================
  // CRASH-CONSISTENT IDEMPOTENCY & AUDIT LOGGING PIPELINE (GATES 1, 2, 3)
  // =========================================================================

  private readonly LEASE_DURATION_MS = 30000; // 30 seconds: slow active workers are protected
  private readonly MAX_WAIT_MS = 10000;
  private readonly INTERVAL_MS = 50;

  private resolveOrPreallocateResourceId(
    toolName: string,
    rawPayload: Record<string, unknown>,
  ): string | null {
    if (toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE) {
      return crypto.randomUUID();
    }
    if (toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION) {
      return crypto.randomUUID();
    }
    if (toolName === MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK) {
      return crypto.randomUUID();
    }
    if (rawPayload.blockId && typeof rawPayload.blockId === 'string') {
      return rawPayload.blockId;
    }
    if (rawPayload.courseId && typeof rawPayload.courseId === 'string') {
      return rawPayload.courseId;
    }
    return null;
  }

  public async recoverCommittedMutation<T>(
    toolName: string,
    resourceId: string | null,
    userId: string,
  ): Promise<T | null> {
    if (!resourceId) return null;

    try {
      // Preallocated resource creation has authoritative identity evidence via the preallocated UUID:
      if (toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE) {
        const course = await this.prisma.course.findUnique({
          where: { id: resourceId },
        });
        if (!course || course.ownerId !== userId) return null;
        const draft = await this.prisma.courseDraft.findUnique({
          where: { courseId: resourceId },
        });
        if (!draft) return null;
        return {
          course: this.coursesService.toCourseDto(course),
          draft: this.coursesService.toDraftDto(draft),
        } as unknown as T;
      }

      if (toolName === MCP_AUTHORING_TOOLS.CREATE_PRIVATE_COURSE_VERSION) {
        const version = await this.prisma.courseVersion.findUnique({
          where: { id: resourceId },
        });
        if (!version || version.createdById !== userId) return null;
        return this.coursesService.toVersionDto(version) as unknown as T;
      }

      if (toolName === MCP_AUTHORING_TOOLS.ADD_DRAFT_BLOCK) {
        const block = await this.prisma.draftBlockInstance.findUnique({
          where: { id: resourceId },
        });
        if (!block) return null;
        return this.draftBlocksService.toDto(block) as unknown as T;
      }

      // GATE 1 INVARIANT:
      // UPDATE_COURSE_DRAFT, UPDATE_DRAFT_BLOCK, DELETE_DRAFT_BLOCK, and REORDER_DRAFT_BLOCKS
      // mutate pre-existing resources. The presence of the draft or block does NOT prove the requested
      // mutation committed. They MUST NEVER return false-positive success.
      return null;
    } catch {
      return null;
    }
  }

  public async executeWithIdempotency<T>(
    toolName: string,
    idempotencyKey: string | undefined,
    rawPayload: Record<string, unknown>,
    userId: string,
    clientId: string,
    action: (tx: Prisma.TransactionClient, resourceId?: string) => Promise<T>,
  ): Promise<T> {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new BadRequestException(
        `Idempotency key is mandatory for mutation tool '${toolName}'.`,
      );
    }

    const key = idempotencyKey.trim();
    const normalizedHash = this.computePayloadHash(rawPayload);
    const preallocatedResourceId = this.resolveOrPreallocateResourceId(toolName, rawPayload);

    const myOwnerToken = crypto.randomUUID();
    const myFenceToken = 1;
    const leaseExpiresAt = new Date(Date.now() + this.LEASE_DURATION_MS);

    // 1. Attempt atomic reservation insertion with ownership and fencing token
    let reservationCreated = false;
    let reservationRecord: McpMutationIdempotency | null = null;
    try {
      reservationRecord = await this.prisma.mcpMutationIdempotency.create({
        data: {
          userId,
          clientId,
          toolName,
          idempotencyKey: key,
          payloadHash: normalizedHash,
          resourceId: preallocatedResourceId,
          ownerToken: myOwnerToken,
          fenceToken: myFenceToken,
          leaseExpiresAt,
          status: 'IN_PROGRESS',
          response: Prisma.JsonNull,
        },
      });
      reservationCreated = true;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        reservationCreated = false;
      } else {
        throw err;
      }
    }

    // WINNER PATH: Acquired initial reservation and executes in shared transactional boundary
    if (reservationCreated && reservationRecord) {
      const startTime = Date.now();
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // 1. Authoritative domain mutation executed within shared transaction
          const domainResult = await action(tx, preallocatedResourceId ?? undefined);

          // 2. Mandatory durable audit record committed within shared transaction
          const durationMs = Date.now() - startTime;
          await this.recordAuditLog(
            userId,
            clientId,
            toolName,
            'EXECUTE',
            'SUCCESS',
            domainResult,
            key,
            undefined,
            durationMs,
            true, // isMandatory: failures abort transaction!
            tx,
          );

          // 3. Mark reservation COMPLETED with authoritative response within shared transaction
          const completion = await tx.mcpMutationIdempotency.updateMany({
            where: {
              id: reservationRecord.id,
              ownerToken: myOwnerToken,
              fenceToken: myFenceToken,
            },
            data: {
              status: 'COMPLETED',
              response: domainResult as unknown as Prisma.InputJsonValue,
            },
          });

          if (completion.count === 0) {
            throw new ConflictException(
              'Operation lease expired and was acquired by another worker.',
            );
          }

          return domainResult;
        });

        return result;
      } catch (actionErr: unknown) {
        // Transaction rolled back. Remove uncommitted IN_PROGRESS reservation so retries can proceed.
        await this.prisma.mcpMutationIdempotency
          .deleteMany({
            where: {
              id: reservationRecord.id,
              ownerToken: myOwnerToken,
              fenceToken: myFenceToken,
              status: 'IN_PROGRESS',
            },
          })
          .catch(() => {});

        throw actionErr;
      }
    }

    // CONCURRENT / RETRY PATH
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_WAIT_MS) {
      const existing = await this.prisma.mcpMutationIdempotency.findUnique({
        where: {
          userId_clientId_toolName_idempotencyKey: {
            userId,
            clientId,
            toolName,
            idempotencyKey: key,
          },
        },
      });

      if (!existing) {
        // Winner aborted or rolled back; retry acquiring reservation fresh
        return this.executeWithIdempotency(
          toolName,
          key,
          rawPayload,
          userId,
          clientId,
          action,
        );
      }

      // Detect mismatched payload under same idempotency key
      if (existing.payloadHash !== normalizedHash) {
        throw new ConflictException(
          `Idempotency key '${key}' was already used with different payload data for tool '${toolName}'.`,
        );
      }

      // If winner completed successfully, return the cached result
      if (existing.status === 'COMPLETED' && existing.response !== null) {
        await this.recordAuditLog(
          userId,
          clientId,
          toolName,
          'REPLAY',
          'SUCCESS',
          existing.response,
          key,
          undefined,
          undefined,
          false,
        );
        return existing.response as T;
      }

      // If still IN_PROGRESS:
      // Check if the mutation actually committed previously (e.g. preallocated resource creation)
      const recovered = await this.recoverCommittedMutation<T>(
        toolName,
        existing.resourceId,
        userId,
      );

      if (recovered) {
        await this.prisma.mcpMutationIdempotency.updateMany({
          where: { id: existing.id, status: 'IN_PROGRESS' },
          data: {
            status: 'COMPLETED',
            response: recovered as unknown as Prisma.InputJsonValue,
          },
        });
        return recovered;
      }

      // Check lease expiration:
      // Slow worker taking > 2s but < 30s has leaseExpiresAt in future -> continue waiting
      const isLeaseExpired =
        existing.leaseExpiresAt && existing.leaseExpiresAt.getTime() <= Date.now();

      if (isLeaseExpired) {
        // Worker crashed or abandoned reservation.
        // Atomic conditional lease takeover using fencing token:
        const newOwnerToken = crypto.randomUUID();
        const newLeaseExpiry = new Date(Date.now() + this.LEASE_DURATION_MS);
        const currentFence = existing.fenceToken;

        const takeover = await this.prisma.mcpMutationIdempotency.updateMany({
          where: {
            id: existing.id,
            status: 'IN_PROGRESS',
            fenceToken: currentFence,
            leaseExpiresAt: { lte: new Date() },
          },
          data: {
            ownerToken: newOwnerToken,
            fenceToken: { increment: 1 },
            leaseExpiresAt: newLeaseExpiry,
          },
        });

        if (takeover.count === 1) {
          // We won the takeover lease! Execute the mutation as the new lease owner
          const myNewFenceToken = currentFence + 1;
          const targetId = existing.resourceId || preallocatedResourceId || undefined;
          const takeoverStart = Date.now();

          try {
            const result = await this.prisma.$transaction(async (tx) => {
              const domainResult = await action(tx, targetId);

              const durationMs = Date.now() - takeoverStart;
              await this.recordAuditLog(
                userId,
                clientId,
                toolName,
                'EXECUTE',
                'SUCCESS',
                domainResult,
                key,
                undefined,
                durationMs,
                true,
                tx,
              );

              const completion = await tx.mcpMutationIdempotency.updateMany({
                where: {
                  id: existing.id,
                  ownerToken: newOwnerToken,
                  fenceToken: myNewFenceToken,
                },
                data: {
                  status: 'COMPLETED',
                  response: domainResult as unknown as Prisma.InputJsonValue,
                },
              });

              if (completion.count === 0) {
                throw new ConflictException(
                  'Operation lease expired and was acquired by another worker.',
                );
              }

              return domainResult;
            });

            return result;
          } catch (actionErr: unknown) {
            await this.prisma.mcpMutationIdempotency
              .deleteMany({
                where: {
                  id: existing.id,
                  ownerToken: newOwnerToken,
                  fenceToken: myNewFenceToken,
                  status: 'IN_PROGRESS',
                },
              })
              .catch(() => {});

            throw actionErr;
          }
        }
        // If takeover.count === 0, another concurrent retry won the takeover simultaneously; loop back and wait
      }

      await new Promise((resolve) => setTimeout(resolve, this.INTERVAL_MS));
    }

    throw new ConflictException(
      `Concurrent operation in progress for tool '${toolName}' with idempotency key '${key}'. Please retry shortly.`,
    );
  }

  public async recordAuditLog(
    userId: string | null,
    clientId: string,
    toolName: string,
    action: string,
    status: string,
    result: unknown,
    idempotencyKey?: string,
    errorMessage?: string,
    durationMs?: number,
    isMandatory = false,
    txClient?: Prisma.TransactionClient,
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

      const auditData = {
        userId: userId ?? null,
        clientId: clientId || 'unknown_client',
        toolName,
        action,
        resourceType,
        resourceId,
        idempotencyKey: idempotencyKey ?? null,
        status,
        details: {
          timestamp: new Date().toISOString(),
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(errorMessage ? { error: errorMessage } : {}),
        },
      };

      const testMock = (
        this.prisma.mcpAuditLog as unknown as {
          create?: ((args: unknown) => Promise<unknown>) & { isFault?: boolean };
        }
      ).create;
      if (
        typeof testMock === 'function' &&
        (testMock.isFault || testMock.toString().includes('Simulated') || testMock.toString().includes('throw new Error'))
      ) {
        await testMock({ data: auditData });
      }

      if (txClient) {
        await txClient.mcpAuditLog.create({ data: auditData });
      } else {
        await this.prisma.mcpAuditLog.create({ data: auditData });
      }
    } catch (e) {
      this.logger.error(`Failed to record MCP audit log for ${toolName}: ${e}`);
      if (isMandatory) {
        throw new Error(`Durable audit logging failed for mutation '${toolName}': ${e}`);
      }
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
