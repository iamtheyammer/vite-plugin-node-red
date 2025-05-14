import { promises as fs } from "fs";
import * as path from "node:path";
import merge from "lodash.merge";
import type { InlineConfig, Plugin, UserConfig } from "vite";
import { build as viteBuild } from "vite";

interface SimplePackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;

  "node-red": {
    nodes: Record<string, string>;
  };
}

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
  // Whether to run an additional Vite build to generate your nodes'
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

const defaultOptions: Required<VitePluginNodeRedOptions> = {
  nodesDirectory: "nodes",
  packageName: "",
  packageJson: {
    path: "package.json",
    copyDependencies: true,
    copyPackageName: true,
  },
  silent: false,
  buildNodeJsFiles: true,
};

export default async function nodeRedPlugin(
  opt: VitePluginNodeRedOptions = defaultOptions,
): Promise<Plugin> {
  const pluginOptions = merge(defaultOptions, opt);
  let referencePackageJson: SimplePackageJson;

  // If a package.json file is provided, read it and copy the dependencies.
  if (
    typeof pluginOptions.packageJson === "object" &&
    pluginOptions.packageJson.path
  ) {
    // Read the package.json file from the specified path.
    const packageJsonPath = path.isAbsolute(pluginOptions.packageJson.path)
      ? pluginOptions.packageJson.path
      : path.resolve(process.cwd(), pluginOptions.packageJson.path);

    referencePackageJson = JSON.parse(
      await fs.readFile(packageJsonPath, "utf8"),
    );
  }

  // Node "JavaScript files" - we will generate these as part of an SSR
  // build.
  const nodeJsFiles: string[] = [];
  // Vite's output directory - will be calculated during writeBundle.
  // Used for the SSR build to generate the Node.js files.
  let outDir: string;

  return {
    name: "vite-plugin-node-red",
    async config(config, { command }): Promise<UserConfig | null> {
      if (command === "serve") {
        // This plugin does not support running in serve mode.
        throw new Error(
          `Node-RED requires nodes to be compiled instead of served. Use \`vite build --watch\` instead of \`vite\`.`,
        );
      }

      if (!pluginOptions.nodesDirectory) {
        // If a nodesDirectory is not specified, the user must have configured
        // Vite entry points on their own.
        return null;
      }

      // Check if the nodes directory exists.
      const nodesDir = path.normalize(
        path.isAbsolute(pluginOptions.nodesDirectory)
          ? pluginOptions.nodesDirectory
          : path.resolve(process.cwd(), pluginOptions.nodesDirectory),
      );
      const stats = await fs.stat(nodesDir);

      if (!stats.isDirectory()) {
        throw new Error(
          `The nodes directory ${nodesDir} does not exist or is not a directory.`,
        );
      }

      const contents = await fs.readdir(nodesDir, { withFileTypes: true });
      const subdirs = contents
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      if (subdirs.length === 0) {
        throw new Error(
          `The nodes directory ${nodesDir} does not contain any subdirectories. This will mean that Vite has no entry points.`,
        );
      }

      const nodes: Record<string, string> = {};

      for (const subdir of subdirs) {
        const contents = await fs.readdir(path.join(nodesDir, subdir), {
          withFileTypes: true,
        });
        const files = new Set(
          contents
            .filter((dirent) => dirent.isFile())
            .map((dirent) => dirent.name),
        );
        // Ensure both the HTML and TS files exist.

        if (
          !files.has(`${subdir}.html`) ||
          (!files.has(`${subdir}.ts`) && !files.has(`${subdir}.js`))
        ) {
          if (!pluginOptions.silent) {
            console.warn(
              `vite-plugin-node-red: Node ${subdir} is missing either the HTML or JS/TS file. Skipping.`,
            );
          }
        }

        nodes[subdir] = path.join(nodesDir, subdir, `${subdir}.html`);
        nodeJsFiles.push(
          files.has(`${subdir}.ts`)
            ? path.join(nodesDir, subdir, `${subdir}.ts`)
            : path.join(nodesDir, subdir, `${subdir}.js`),
        );
      }

      if (!pluginOptions.silent) {
        if (config.build?.assetsDir && config.build.assetsDir !== "resources") {
          throw new Error(
            "vite-plugin-node-red: Overwrote your assetsDir option with 'resources'. " +
              "If it is not 'resources', Node-RED will not make these files available in " +
              "the node editor. Remove the assetsDir option from your Vite config.",
          );
        }
        console.warn(
          `vite-plugin-node-red: found ${subdirs.length} nodes in ${nodesDir}: ${JSON.stringify(nodes, null, 2)}`,
        );
      }

      // Add nodes' HTML files to the vite build
      return {
        build: {
          assetsDir: "resources",
          rollupOptions: {
            input: nodes,
          },
        },
      };
    },
    transformIndexHtml(html) {
      // Remove the second /resources/ from script srcs.
      // escape any special characters in the nodesDirectory
      const packageName = referencePackageJson
        ? referencePackageJson.name
        : pluginOptions.packageName;
      // replace all occurrences of /resources/nodes/ with /resources/
      const re = new RegExp(`(src|href)="\\/resources\\/`, "g");
      // drop that second "/resources/", replace nodes directory with package name
      return html.replace(re, `$1="/resources/${packageName}/`);
    },
    async writeBundle(outputOptions, bundle): Promise<void> {
      // If packageJson is false, do nothing.
      if (!pluginOptions.packageJson) {
        return;
      }

      // Write a simple package.json file to the output directory.
      // This is required for Node-RED to find the nodes.
      const pkg: SimplePackageJson = {
        name: pluginOptions.packageName,
        version: "1.0.0",
        "node-red": {
          nodes: {},
        },
      };

      // If a package.json file is provided, read it and copy the dependencies.
      if (referencePackageJson) {
        // Copy package name
        if (pluginOptions.packageJson.copyPackageName) {
          pkg.name = referencePackageJson.name;
        } else if (!pluginOptions.packageName) {
          // No package name provided
          throw new Error(
            "No package name provided and packageJson.copyPackageName is false.",
          );
        }

        // Copy dependencies and devDependencies from the project package.json
        if (pluginOptions.packageJson.copyDependencies) {
          pkg.dependencies = referencePackageJson.dependencies || {};
          pkg.devDependencies = referencePackageJson.devDependencies || {};
        }
      }

      // Add each output file to package.node_red.nodes
      for (const [_, assetInfo] of Object.entries(bundle)) {
        if (
          assetInfo.type === "asset" &&
          assetInfo.fileName.endsWith(".html")
        ) {
          const nodeName = path.parse(assetInfo.fileName).name;

          // Add the .js file to the package.json
          pkg["node-red"].nodes[nodeName] = assetInfo.fileName.replace(
            ".html",
            ".js",
          );
        }
      }

      // Determine the output directory.
      // outputOptions.dir is used when multiple files are generated,
      // or outputOptions.file for single file builds.
      outDir =
        outputOptions.dir ||
        (outputOptions.file ? path.dirname(outputOptions.file) : "dist");
      const outPackagePath = path.resolve(
        process.cwd(),
        outDir,
        "package.json",
      );

      // Write the new package.json to the output directory.
      try {
        await fs.writeFile(
          outPackagePath,
          JSON.stringify(pkg, null, 2),
          "utf8",
        );
      } catch (err) {
        this.error(`Error writing package.json: ${err}`);
      }
    },
    async closeBundle() {
      if (pluginOptions.buildNodeJsFiles === false || nodeJsFiles.length < 1) {
        return;
      }

      const pluginViteConfig: InlineConfig = {
        configFile: false,
        ssr: {
          target: "node",
        },
        build: {
          emptyOutDir: false,
          ssr: true,
          outDir: outDir,
          rollupOptions: {
            input: nodeJsFiles,
            output: {
              format: "cjs",
              preserveModules: true,
              preserveModulesRoot: path.resolve(
                path.join(pluginOptions.nodesDirectory, ".."),
              ),
            },
          },
        },
      };

      // Run a second Vite build, this time with ssr (to run in Node)
      await viteBuild(
        merge(
          typeof pluginOptions.buildNodeJsFiles === "object"
            ? pluginOptions.buildNodeJsFiles
            : {},
          pluginViteConfig,
        ),
      );
    },
  };
}
