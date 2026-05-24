import { defineConfig, mergeConfig } from 'vitest/config';
import conf from '../../config/vitest';

const BASE = '/Users/linjiajian/Desktop/my/my-project/bobe/packages';

export default mergeConfig(
  conf,
  defineConfig({
    test: {
      environment: 'jsdom'
    }
  })
);
