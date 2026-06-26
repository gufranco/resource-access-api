import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto, ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserContext } from '../auth/user-context';
import { ListResourcesQueryDto } from './dto/list-resources.query';
import { PaginatedResourcesDto, type PaginatedResources } from './dto/resource.response';
import { userIdParamSchema } from './dto/user-id.param';
import { ResourcesService } from './resources.service';

@ApiTags('resources')
@Controller()
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get('resources')
  @ApiOperation({
    summary: 'List resources visible to the caller',
    description:
      'Returns resources the caller owns or that are shared with them, filtered by type and status, with keyset pagination. Admins see all resources.',
  })
  @ApiOkResponse({ type: PaginatedResourcesDto })
  @ZodSerializerDto(PaginatedResourcesDto)
  listResources(
    @CurrentUser() user: UserContext,
    @Query() query: ListResourcesQueryDto,
  ): Promise<PaginatedResources> {
    return this.service.listVisible(user, query);
  }

  @Get('resources/recent')
  @ApiOperation({
    summary: 'List the ten most recent visible resources',
    description: 'Returns the ten most recently created resources visible to the caller.',
  })
  @ApiOkResponse({ type: PaginatedResourcesDto })
  @ZodSerializerDto(PaginatedResourcesDto)
  listRecent(@CurrentUser() user: UserContext): Promise<PaginatedResources> {
    return this.service.listRecent(user);
  }

  @Get('users/:userId/resources')
  @ApiOperation({
    summary: 'List resources owned by a user',
    description:
      'Returns resources owned by the target user. Only the user themselves or an admin may call this; other callers receive 403.',
  })
  @ApiParam({ name: 'userId', type: Number, example: 2 })
  @ApiOkResponse({ type: PaginatedResourcesDto })
  @ZodSerializerDto(PaginatedResourcesDto)
  listUserResources(
    @CurrentUser() user: UserContext,
    @Param('userId', new ZodValidationPipe(userIdParamSchema)) userId: number,
    @Query() query: ListResourcesQueryDto,
  ): Promise<PaginatedResources> {
    return this.service.listOwnedBy(user, userId, query);
  }
}
