import { SSRCtx } from './type';
export let ctx: SSRCtx = {
  root: null,
  current: null
};

export const cleanCtx = () =>
  Object.keys(ctx).forEach(key => {
    ctx[key] = null;
  });
