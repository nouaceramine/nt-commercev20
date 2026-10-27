// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
  enableVisualEdits: false, // Disabled - causing babel traverse errors
};

// Conditionally load visual edits modules only in dev mode
let setupDevServer;
let babelMetadataPlugin;

if (config.enableVisualEdits) {
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  jest: {
    configure: {
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@radix-ui/primitive/is-development$': '<rootDir>/node_modules/@radix-ui/primitive/dist/internal/is-development.true.js',
      },
      testPathIgnorePatterns: [
        '<rootDir>/src/__tests__/testUtils.js',
      ],
    },
  },
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      for (const rule of webpackConfig.module?.rules || []) {
        if (rule.enforce === 'pre' && rule.loader?.includes('source-map-loader')) {
          const existingExcludes = rule.exclude
            ? (Array.isArray(rule.exclude) ? rule.exclude : [rule.exclude])
            : [];
          rule.exclude = [...existingExcludes, /node_modules[\/]html5-qrcode[\/]/];
        }
      }

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

// Only add babel metadata plugin during dev server
if (config.enableVisualEdits && babelMetadataPlugin) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

webpackConfig.devServer = (devServerConfig) => {
  // Replit proxy compatibility: allow all hosts and use port 5000
  devServerConfig.host = '0.0.0.0';
  devServerConfig.port = 5000;
  devServerConfig.allowedHosts = 'all';
  // Fix WebSocket for Replit proxy (proxied over HTTPS/WSS at port 443)
  devServerConfig.client = {
    ...(devServerConfig.client || {}),
    webSocketURL: 'auto://0.0.0.0:0/ws',
  };
  // Proxy API requests to backend on port 8000
  devServerConfig.proxy = [
    {
      context: ['/api'],
      target: 'http://localhost:8000',
      changeOrigin: true,
      secure: false,
    },
  ];

  // Apply visual edits dev server setup only if enabled
  if (config.enableVisualEdits && setupDevServer) {
    devServerConfig = setupDevServer(devServerConfig);
  }

  // webpack-dev-server 5 also replaced the legacy `https` option with `server`.
  if (Object.prototype.hasOwnProperty.call(devServerConfig, 'https')) {
    const https = devServerConfig.https;
    delete devServerConfig.https;
    if (https && !devServerConfig.server) {
      devServerConfig.server = https === true
        ? 'https'
        : { type: 'https', options: https };
    }
  }

  // webpack-dev-server 5 replaced the react-scripts 5 middleware hooks.
  // Keep their ordering: before hooks register immediately, while after hooks
  // are collected and appended to the built-in middleware list.
  const onBeforeSetup = devServerConfig.onBeforeSetupMiddleware;
  const onAfterSetup = devServerConfig.onAfterSetupMiddleware;
  if (onBeforeSetup || onAfterSetup) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;
    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }
      if (onBeforeSetup) {
        onBeforeSetup(devServer);
      }
      if (onAfterSetup) {
        const deferred = [];
        const afterApp = Object.create(devServer.app);
        afterApp.use = (...handlers) => {
          deferred.push(...handlers);
          return afterApp;
        };
        const afterDevServer = Object.create(devServer);
        afterDevServer.app = afterApp;
        onAfterSetup(afterDevServer);
        for (const handler of deferred.flat()) {
          if (typeof handler !== 'function') {
            throw new Error('Unsupported path-based after middleware');
          }
          middlewares.push({ middleware: handler });
        }
      }
      return middlewares;
    };
    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;
  }

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  // react-scripts 5 calls close() on shutdown; webpack-dev-server 5 exposes
  // stopCallback() instead. Install the compatibility alias only when needed.
  const configuredSetupMiddlewares = devServerConfig.setupMiddlewares;
  devServerConfig.setupMiddlewares = (middlewares, devServer) => {
    if (configuredSetupMiddlewares) {
      middlewares = configuredSetupMiddlewares(middlewares, devServer);
    }
    if (typeof devServer.close !== 'function' && typeof devServer.stopCallback === 'function') {
      devServer.close = devServer.stopCallback.bind(devServer);
    }
    return middlewares;
  };

  return devServerConfig;
};

module.exports = webpackConfig;
