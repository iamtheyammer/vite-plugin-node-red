# vite-plugin-node-red

Vite plugin to build Node-RED nodes easily and quickly using Vite.

Supports TypeScript and React out of the box. No configuration required.

![NPM Version](https://img.shields.io/npm/v/vite-plugin-node-red)

## Overview

1. `npm install vite vite-plugin-node-red --save-dev` (or use `yarn`, `pnpm`, etc.)
2. Create a `vite.config.ts` (or `.config.js`) file, and add `vite-plugin-node-red` as a plugin. No other options are required if your nodes are in the `nodes` directory.
3. Create a `tsconfig.json` file, and configure TypeScript (optional)
4. `npm run vite build` or `yarn vite build` to build your nodes (add `--watch` to watch for changes)
5. In your Node-RED install directory, `npm install /path-to-your-vite-output-directory` your Vite output directory as an NPM package. You can also use `npm link` to link your Vite output directory to your Node-RED install directory. **Make sure not to install your base project** - import the Vite output directory.
6. Restart Node-RED and see your nodes appear!

## Example

For a full, working setup of this plugin, see the example in the [example](/example) directory.

To run it, just:

```bash
cd example
yarn # or npm install
yarn build # or npm run build
```

## Setup

This plugin expects that all of your nodes are in **their own folder**, in a subdirectory of your project.
For example, if your nodes are in `nodes/`:

```
nodes/
├── node1/
│   ├── node1.html
│   ├── node1.ts (or js)
│   └── declaration.ts (or js)
├── node2/
│   ├── node2.html
│   ├── node2.ts (or js)
│   └── declaration.ts (or js)
|-- ...
```

Your output (by default, in the `dist` folder) will look like this:

```
dist/
├── node1/
│   ├── node1.html
│   ├── node1.js
|-- node2/
│   ├── node2.html
│   ├── node2.js 
├── ...
|-- resources/
│   ├── node1-[slug].js (bundled from node1/declaration.ts)
│   ├── node2-[slug].js
│   ├── modulepreload-polyfill-[slug].js (not always present)
│   ├── ...
|-- package.json
```

Now, from your Node-RED install directory, you can run `npm install /path-to-your-vite-output-directory` or `npm link /path-to-your-vite-output-directory` to install your nodes into Node-RED.

Restart Node-RED to see your nodes.

### [TypeScript/JavaScript files](https://nodered.org/docs/creating-nodes/node-js)

In Node-RED, the "JavaScript file" contains the node's logic and is run from Node-RED, inside Node.js. One file must be named the same as the outside directory, with a `.js` or `.ts` extension.

These files are built automatically using Vite (in SSR mode).

Unlike scripts linked from your HTML files, imports to NPM packages are **not bundled**. Since `vite-plugin-node-red` reads your dependencies and copies them into the generated `package.json`, when you run `npm install` (or `npm link`) in your Node-RED install directory, NPM will know what your code depends on and install those packages.

### [HTML Files](https://nodered.org/docs/creating-nodes/node-html)

The "HTML file" contains three parts: the node's definition, the editor template UI, and the help UI.

The HTML file must be named the same as the outside directory, with a `.html` extension.

To add a script that Vite will bundle, you can use the `<script>` tag with the `type="module"` attribute. This will allow you to use ES modules in your HTML file.

```html
<script type="module" src="definition.ts"></script>
<!-- Or, if you're using React: -->
<script type="module" src="definition.tsx"></script>
```

External dependencies **will be bundled** into the output file, so you can use any NPM package in your HTML file. Since they are bundled, any dependencies from these files are **dev dependencies** - install them with `--save-dev` or `-D`. Only dependencies that are used in the "JavaScript file" (the one that runs in Node.js) should be installed as normal dependencies.

This allows packages like React to work out of the box.

### Vite Setup

Your `html` and `ts` **must** be named the same as the directory.

Then, you can use a `vite.config.ts` like this:

```ts
import { defineConfig } from "vite";
import nodeRedPlugin from "vite-plugin-node-red";

export default defineConfig({
  plugins: [nodeRedPlugin({
    // set options here. defaults will apply if not set.
    // object itself is optional, too.
  })],
});
```

No options are required, assuming that:

- Your nodes are in `nodes/` (not `src/nodes/`, but just `nodes/`)
  - If not, set the `nodesDirectory` option
- You are using Vite from your project's root directory, which has `package.json` in it
  - If not, set the `packageJson.path` option
- Your HTML files and JS/TS files are named the same as their directory
  - This is a requirement

## Output

The plugin generates:

- `.html` files for your nodes (in the browser)
- Bundled `.js` files that your HTML files will load (in the browser)
- Transpiled `.js` files (run in Node.js) that run when your nodes are run in a flow

## Settings

Paths can be relative to the current directory (where `vite` is run) or absolute.

```ts
import type { UserConfig } from "vite";

export interface VitePluginNodeRedOptions {
  // Directory where your nodes are located.
  // Can be a relative or absolute path.
  // Default: `nodes`
  nodesDirectory?: string;
  // Package name to use in the generated package.json file,
  // if packageJson not false.
  // Has no effect if packageJson.copyPackageName is true (default).
  packageName?: string;
  // Write a package.json file for your nodes.
  // Set to false to completely disable.
  packageJson?:
    | false
    | {
    // Path to the package.json file to read from.
    // Default: `package.json`
    path?: string;
    // Copy the package name from the project package.json file.
    copyPackageName?: boolean;
    // Copy the dependencies from the project package.json file.
    copyDependencies?: boolean;
  };
  // Whether to run an additional Vite build to transpile your nodes'
  // "JavaScript files" (the code that runs in Node.js when your
  // node executes as part of a flow).
  //
  // A boolean enables/disables this behavior using default options.
  // If you would like to configure Vite more, you may pass Vite
  // configuration options here. Note that some options, like
  // `ssr` and some rollup options will be overridden - see the
  // plugin's `closeBundle` method for details.
  //
  // If this option is disabled, the nodes will not be fully built as
  // their JavaScript files will not exist in the output directory.
  //
  // Default: true
  buildNodeJsFiles?: boolean | Partial<UserConfig>;
  // If true, suppresses all warnings and non-error log messages.
  silent?: boolean;
}
```
