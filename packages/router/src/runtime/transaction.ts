import type {
  NavigationContext,
  NavigationHandler,
  NavigationHandlerResult,
  NavigationRequest,
  NavigationResult,
  NavigationStatus,
  RuntimeRouterLike,
} from './types';

export class NavigationTransactionRunner {
  #nextTokenId = 0;
  #currentTokenId = 0;

  createToken(request?: NavigationRequest) {
    const token = {
      id: ++this.#nextTokenId,
      request,
      cancelled: false,
    };
    this.#currentTokenId = token.id;
    return token;
  }

  isTokenValid(ctx: Pick<NavigationContext, 'token'>): boolean {
    return !ctx.token.cancelled && ctx.token.id === this.#currentTokenId;
  }

  isTokenIdCurrent(tokenId: number): boolean {
    return tokenId === this.#currentTokenId;
  }

  cancelCurrent(): void {
    this.#currentTokenId = ++this.#nextTokenId;
  }

  async run(
    router: RuntimeRouterLike,
    handlers: NavigationHandler[],
    request?: NavigationRequest
  ): Promise<NavigationResult> {
    const ctx: NavigationContext = {
      router,
      request,
      token: this.createToken(request),
      status: 'running',
      rollbackStack: [],
    };
    let queue = [...handlers];

    while (queue.length > 0) {
      const handler = queue.shift()!;
      let result: NavigationHandlerResult;

      try {
        result = await handler(ctx);
      } catch (error) {
        ctx.error = error;
        ctx.status = 'error';
        await this.#rollback(ctx);
        return { status: ctx.status, ctx, error };
      }

      if (!this.isTokenValid(ctx)) {
        ctx.status = 'cancelled';
        return { status: ctx.status, ctx };
      }

      if (!result) continue;

      if (result.type === 'stop') {
        ctx.status = result.status ?? ctx.status;
        return { status: ctx.status, ctx };
      }

      if (result.type === 'prepend') {
        queue.unshift(...result.handlers);
        continue;
      }

      if (result.type === 'replace') {
        queue = [...result.handlers];
      }
    }

    if (ctx.status === 'running') ctx.status = 'completed';
    return { status: ctx.status, ctx };
  }

  stop(status: NavigationStatus = 'completed'): NavigationHandlerResult {
    return { type: 'stop', status };
  }

  replace(handlers: NavigationHandler[]): NavigationHandlerResult {
    return { type: 'replace', handlers };
  }

  prepend(handlers: NavigationHandler[]): NavigationHandlerResult {
    return { type: 'prepend', handlers };
  }

  async #rollback(ctx: NavigationContext): Promise<void> {
    for (let i = ctx.rollbackStack.length - 1; i >= 0; i--) {
      await ctx.rollbackStack[i](ctx);
    }
  }
}
