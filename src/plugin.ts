import { promises as fs } from "fs";
import * as path from "node:path";
import merge from "lodash.merge";
import type { Plugin, UserConfig } from "vite";

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

  return {
    name: "vite-plugin-node-red",
    async config(config): Promise<UserConfig | null> {
      // If a nodesDirectory is not specified, the user must have configured
      // Vite entry points on their own.
      if (!pluginOptions.nodesDirectory) {
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
        // Ensure both the HTML and TS files exist.
        const htmlFile = path.join(nodesDir, subdir, `${subdir}.html`);
        const tsFile = path.join(nodesDir, subdir, `${subdir}.ts`);

        try {
          await Promise.all([fs.stat(htmlFile), fs.stat(tsFile)]);
          nodes[subdir] = htmlFile;
        } catch (err) {
          if (!pluginOptions.silent) {
            console.warn(
              `vite-plugin-node-red: Node ${subdir} is missing either the HTML or TS file. Skipping.`,
            );
          }
        }
      }

      if (!pluginOptions.silent) {
        console.warn(
          `vite-plugin-node-red: found ${subdirs.length} nodes in ${nodesDir}: ${JSON.stringify(nodes, null, 2)}`,
        );
      }

      // Add nodes' HTML files to the vite build
      return {
        build: {
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
      const re = new RegExp(
        `(src|href)="(\\/resources\\/${pluginOptions.nodesDirectory})\\/resources\\/`,
        "g",
      );
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
      const outDir =
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
  };
}
