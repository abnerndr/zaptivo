import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { authContext } from './auth-context'
import type { RequestWithAuth } from './session-auth.guard'

@Injectable()
export class AuthContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>()
    const userId = req.authUserId

    if (!userId) {
      return next.handle()
    }

    return new Observable((subscriber) => {
      authContext.run(
        {
          userId,
          name: req.authName ?? null,
          email: req.authEmail ?? null,
          image: req.authImage ?? null,
        },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          })
        },
      )
    })
  }
}
