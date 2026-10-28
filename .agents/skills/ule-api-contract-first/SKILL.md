---
name: ule-api-contract-first
description: Use when adding or changing backend endpoints, DTOs, API errors, authentication requirements, OpenAPI schemas, or web/mobile integration; design the API contract before implementation.
---

# ULE API Contract First

## Workflow
1. Inspect existing NestJS controllers, DTOs, validation setup, API prefix, OpenAPI configuration, and tests.
2. Define the intended endpoint, method, versioned path, request, response, error cases, authentication, authorization, and ownership rules before coding.
3. Use the agreed `/api/v1` convention unless an existing documented decision says otherwise.
4. Define explicit request/response DTOs. Validate untrusted input at the API boundary. Do not expose ORM models as public API contracts.
5. Keep controllers thin: authenticate/authorize, validate, call an application/domain service, map the result to an HTTP response.
6. Update OpenAPI documentation and contract tests alongside the implementation.
7. Ensure the same canonical API can be consumed by the web frontend and a future mobile client.
8. Check CORS and origin configuration only where relevant; never solve integration issues by allowing every origin indiscriminately.

## Compatibility rules
- Avoid breaking changes to existing public endpoints without an explicit migration plan.
- Prefer additive changes where practical.
- Make error responses predictable and document them.
- Do not place authoritative business logic in React, a controller, a Server Action, or an MCP tool handler.
- Never expose secrets, answer keys, hidden evaluator material, or another learner's private data.

## Verification
Run the relevant API tests and confirm the OpenAPI document reflects the implemented behavior. Report any untested compatibility assumptions explicitly.
