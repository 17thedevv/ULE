---
name: ule-abp-contracts
description: Use when designing, reviewing, versioning, validating, or implementing ULE Activity Block Types, Block Instances, block configuration schemas, or runtime contracts; preserve developer-defined structure and creator-level configuration boundaries.
---

# ULE Activity Block Protocol Contracts

## First establish scope
1. Read the current approved ABP/LII/UX architecture documents and inspect existing code.
2. Confirm whether the task is a proposal, a contract change, or implementation. Do not implement the ABP runtime during repository bootstrap unless explicitly requested.
3. If documents conflict, identify the conflict and ask for or record a decision instead of silently choosing a historical proposal.

## Core concepts
- A **Block Type** is defined and maintained by ULE developers. It establishes the activity's structural contract, required fields, validation, rendering/evaluation expectations, and supported capabilities.
- A **Block Instance** is a configured use of a Block Type inside a course. A Creator can configure allowed fields but cannot remove required structure or bypass the Block Type contract.
- The runtime must validate a Block Instance against the correct Block Type/schema version before rendering or accepting submissions.
- A block's persisted configuration must identify its type and compatible version. Define migration/compatibility behavior explicitly rather than silently reinterpreting old data.

## Design workflow
1. Write the user-visible purpose and learning interaction first.
2. Define required versus optional fields and allowed Creator configuration.
3. Define input validation, output/submission shape, evaluation responsibilities, accessibility expectations, and error states.
4. Define schema/version compatibility and how existing course versions are protected from accidental mutation.
5. Separate rendering from authoritative evaluation and persistence.
6. Add contract tests for valid configuration, invalid configuration, missing required fields, unsupported versions, and Creator attempts to remove required structure.
7. Keep block-specific logic behind stable interfaces; avoid one-off exceptions that leak into the whole course engine.

## Guardrails
- Never allow a Creator to delete required structural parts of a Block Type.
- Do not assume every activity can be represented by one generic interaction schema.
- Do not mix the learner's response, trusted evaluation result, and progress decision into one unvalidated object.
- Do not invent ABP behavior that has not been accepted in the current product documents.

## Completion
Report the contract/version touched, validation rules, compatibility impact, and tests performed. Mark any new design decision as proposed until explicitly approved.
