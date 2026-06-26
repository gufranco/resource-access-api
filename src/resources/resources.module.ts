import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesRepository } from './resources.repository';
import { ResourcesService } from './resources.service';

@Module({
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcesRepository],
})
export class ResourcesModule {}
