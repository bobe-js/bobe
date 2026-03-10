import { defineConfig, mergeConfig } from 'vitest/config';
import conf from '../../config/vitest';
export default mergeConfig(conf, defineConfig({

}));
