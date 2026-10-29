import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { toWebRequest } from '@modelcontextprotocol/node';
import { AuthService } from '../auth/auth.service';
import { McpService } from './mcp.service';
import type { McpAuthContext } from './mcp.context';
import type { McpProtectedResourceMetadataDto } from '@ule/contracts';

@ApiTags('MCP')
@Controller()
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * RFC 9728 Protected Resource Metadata (Root Well-Known).
   */
  @Get('.well-known/oauth-protected-resource')
  @ApiOperation({
    summary: 'OAuth 2.0 Protected Resource Metadata (RFC 9728)',
    description:
      'Provides authorization server discovery and scopes supported by the ULE MCP endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Protected resource metadata JSON',
  })
  getProtectedResourceMetadataRoot(): McpProtectedResourceMetadataDto {
    return this.authService.getMcpResourceMetadata();
  }

  /**
   * RFC 9728 Protected Resource Metadata (Resource-Scoped Well-Known).
   */
  @Get('mcp/.well-known/oauth-protected-resource')
  @ApiOperation({
    summary: 'OAuth 2.0 Protected Resource Metadata (Resource Scoped)',
    description:
      'Provides authorization server discovery and scopes supported by the ULE MCP endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Protected resource metadata JSON',
  })
  getProtectedResourceMetadataScoped(): McpProtectedResourceMetadataDto {
    return this.authService.getMcpResourceMetadata();
  }

  /**
   * Streamable HTTP MCP GET handler.
   * Only permitted for text/event-stream subscriptions with an active session ID.
   */
  @Get('mcp')
  @ApiOperation({
    summary: 'MCP Streamable HTTP GET handler',
    description:
      'Handles SSE event stream subscriptions for existing MCP sessions.',
  })
  async handleGet(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.validateHostAndOrigin(req, res)) {
      return;
    }

    const accept = (req.headers['accept'] as string) || '';
    if (!accept.includes('text/event-stream')) {
      res.setHeader('Allow', 'POST');
      res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message:
            'GET is only supported for text/event-stream subscriptions. Use POST for MCP commands.',
        },
        id: null,
      });
      return;
    }

    await this.dispatchMcpRequest(req, res);
  }

  /**
   * Streamable HTTP MCP POST handler.
   * Main entrypoint for JSON-RPC MCP messages.
   */
  @Post('mcp')
  @ApiOperation({
    summary: 'MCP Streamable HTTP POST handler',
    description:
      'Processes JSON-RPC MCP messages, authoring tool execution, and session lifecycle.',
  })
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.validateHostAndOrigin(req, res)) {
      return;
    }

    await this.dispatchMcpRequest(req, res);
  }

  /**
   * Common request validation, authentication, and MCP transport dispatch.
   */
  private async dispatchMcpRequest(
    req: Request,
    res: Response,
  ): Promise<void> {
    // 1. Authenticate bearer token if provided
    let authContext: McpAuthContext | undefined;
    const authHeader = req.headers['authorization'];
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    if (token) {
      try {
        const verified = await this.authService.verifyMcpToken(token);
        authContext = {
          userId: verified.userId,
          clientId: verified.clientId,
          scopes: verified.scopes,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Invalid or expired bearer token.';
        this.logger.warn(`MCP Bearer authentication failed: ${message}`);
        const challenge = `Bearer error="invalid_token", error_description="${message}", resource_metadata="${this.authService.getMcpResourceMetadataUrl()}"`;
        res.setHeader('WWW-Authenticate', challenge);
        res.status(HttpStatus.UNAUTHORIZED).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message,
          },
          id: req.body?.id ?? null,
        });
        return;
      }
    } else {
      // Unauthenticated caller
      const method = req.body?.method;
      const isInitOrNotification =
        method === 'initialize' || method === 'notifications/initialized';

      if (!isInitOrNotification) {
        // Protected tools fail closed
        const message =
          'Authentication required. Please provide a valid OAuth Bearer access token.';
        const challenge = `Bearer error="invalid_token", error_description="${message}", resource_metadata="${this.authService.getMcpResourceMetadataUrl()}"`;
        res.setHeader('WWW-Authenticate', challenge);
        res.status(HttpStatus.UNAUTHORIZED).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message,
          },
          id: req.body?.id ?? null,
        });
        return;
      }
    }

    // 2. Ensure accept header compatibility for Streamable HTTP transport
    if (!req.headers['accept']) {
      req.headers['accept'] = 'application/json, text/event-stream';
    }

    // 3. Convert Express request to Web Standard Request
    const webRequest = await toWebRequest(req, req.body);

    // 4. Forward to MCP Transport inside the authenticated context
    try {
      const mcpResponse = await this.mcpService.handleTransportRequest(
        webRequest,
        authContext,
      );

      // Write status and headers back to Express response
      const responseHeaders: Record<string, string> = {};
      mcpResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      res.writeHead(mcpResponse.status, responseHeaders);

      // Stream response body if present
      if (mcpResponse.body) {
        for await (const chunk of mcpResponse.body as unknown as AsyncIterable<Uint8Array>) {
          if (res.destroyed) break;
          res.write(chunk);
        }
      }
      res.end();
    } catch (dispatchError: unknown) {
      const err =
        dispatchError instanceof Error
          ? dispatchError
          : new Error(String(dispatchError));
      this.logger.error(`MCP dispatch error: ${err.message}`, err.stack);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal MCP transport error',
          },
          id: req.body?.id ?? null,
        });
      }
    }
  }

  /**
   * Validates Host and Origin headers to guard against DNS rebinding and cross-site hijacking.
   */
  private validateHostAndOrigin(req: Request, res: Response): boolean {
    const allowedHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
    const betterAuthUrl = this.configService.get<string>('BETTER_AUTH_URL');
    if (betterAuthUrl) {
      try {
        const u = new URL(betterAuthUrl);
        if (!allowedHosts.includes(u.hostname.toLowerCase())) {
          allowedHosts.push(u.hostname.toLowerCase());
        }
      } catch {
        // ignore malformed URL
      }
    }

    // Host check
    const hostHeader = (req.headers['host'] as string) || '';
    const hostWithoutPort = hostHeader.split(':')[0]?.toLowerCase() || '';
    if (
      !hostWithoutPort ||
      (!allowedHosts.includes(hostWithoutPort) &&
        !allowedHosts.includes(hostHeader.toLowerCase()))
    ) {
      res.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: `Invalid or untrusted Host header: '${hostHeader}'`,
        },
        id: null,
      });
      return false;
    }

    // Origin check (if present)
    const origin = (req.headers['origin'] as string) || '';
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.hostname.toLowerCase();
        const corsOrigin = this.configService.get<string>('CORS_ORIGIN', '');
        const allowedCors = corsOrigin
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const isAllowed =
          allowedHosts.includes(originHost) ||
          allowedCors.includes(origin.toLowerCase()) ||
          allowedCors.includes(originUrl.origin.toLowerCase());

        if (!isAllowed) {
          res.status(HttpStatus.FORBIDDEN).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: `Cross-origin request forbidden from Origin: '${origin}'`,
            },
            id: null,
          });
          return false;
        }
      } catch {
        res.status(HttpStatus.FORBIDDEN).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: `Malformed Origin header: '${origin}'`,
          },
          id: null,
        });
        return false;
      }
    }

    return true;
  }
}
