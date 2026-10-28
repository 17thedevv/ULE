import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
  CourseVisibility,
  CreateCourseResponse,
} from '@ule/contracts';

export class CourseResponseDto implements CourseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'usr_123456789' })
  ownerId!: string;

  @ApiProperty({ enum: ['PRIVATE', 'PUBLIC'], example: 'PRIVATE' })
  visibility!: CourseVisibility;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  updatedAt!: string;
}

export class CourseDraftResponseDto implements CourseDraftDto {
  @ApiProperty({ example: 'draft_123456789' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  courseId!: string;

  @ApiProperty({ example: 'Introduction to Calculus' })
  title!: string;

  @ApiPropertyOptional({ example: 'Calculus fundamentals' })
  description!: string | null;

  @ApiPropertyOptional({ example: 'Learn calculus step by step' })
  summary!: string | null;

  @ApiProperty({ example: 1 })
  revision!: number;

  @ApiPropertyOptional({ example: null })
  sourceVersionId!: string | null;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  updatedAt!: string;
}

export class CreateCourseResponseDto implements CreateCourseResponse {
  @ApiProperty({ type: CourseResponseDto })
  course!: CourseResponseDto;

  @ApiProperty({ type: CourseDraftResponseDto })
  draft!: CourseDraftResponseDto;
}

export class CourseVersionResponseDto implements CourseVersionDto {
  @ApiProperty({ example: 'ver_123456789' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  courseId!: string;

  @ApiProperty({ example: 1 })
  versionNumber!: number;

  @ApiProperty({ example: 'Introduction to Calculus' })
  title!: string;

  @ApiPropertyOptional({ example: 'Calculus fundamentals' })
  description!: string | null;

  @ApiPropertyOptional({ example: 'Learn calculus step by step' })
  summary!: string | null;

  @ApiProperty({
    example: {
      title: 'Introduction to Calculus',
      schemaVersion: '1.0.0',
    },
  })
  snapshot!: Record<string, unknown>;

  @ApiProperty({ example: '1.0.0' })
  schemaVersion!: string;

  @ApiProperty({ example: 1 })
  draftRevision!: number;

  @ApiProperty({ example: 'usr_123456789' })
  createdById!: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.000Z' })
  createdAt!: string;
}
