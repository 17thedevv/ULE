import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BlockTypesController } from './block-types.controller';
import { DraftBlocksController } from './draft-blocks.controller';
import { DraftBlocksService } from './draft-blocks.service';
import { BlockTypeRegistry } from './registry/block-type.registry';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    BlockTypesController,
    DraftBlocksController,
    RuntimeController,
  ],
  providers: [
    BlockTypeRegistry,
    DraftBlocksService,
    RuntimeService,
  ],
  exports: [BlockTypeRegistry, DraftBlocksService, RuntimeService],
})
export class AbpModule {}
