import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { Env } from '../config/env.schema';
import { USER_DIRECTORY } from './auth.constants';
import { AuthGuard } from './auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtVerifier } from './jwt-verifier';
import { DrizzleUserDirectory, type UserDirectory } from './user-directory';

@Global()
@Module({
  providers: [
    { provide: USER_DIRECTORY, useClass: DrizzleUserDirectory },
    JwtVerifier,
    {
      provide: APP_GUARD,
      inject: [Reflector, ConfigService, USER_DIRECTORY, JwtVerifier],
      useFactory: (
        reflector: Reflector,
        config: ConfigService<Env, true>,
        directory: UserDirectory,
        verifier: JwtVerifier,
      ) =>
        config.get('AUTH_MODE', { infer: true }) === 'jwt'
          ? new JwtAuthGuard(reflector, verifier)
          : new AuthGuard(reflector, directory),
    },
  ],
  exports: [USER_DIRECTORY, JwtVerifier],
})
export class AuthModule {}
