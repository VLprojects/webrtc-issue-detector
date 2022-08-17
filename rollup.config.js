import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import bundleSize from 'rollup-plugin-bundle-size';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: './dist/bundle-esm.js',
      format: 'es',
    },
    {
      file: './dist/bundle-cjs.js',
      format: 'cjs',
      exports: 'named',
    },
  ],
  plugins: [
    nodePolyfills({ include: ['events'] }),
    typescript(),
    terser(),
    bundleSize(),
  ],
};
