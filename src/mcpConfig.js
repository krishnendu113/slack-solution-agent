import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mcpJson = require(path.join(__dirname, '../mcp.json'));

/**
 * Builds the mcp_servers array for the Anthropic API call.
 * Reads server definitions from mcp.json, resolves actual
 * URLs and tokens from environment variables.
 * Servers missing a URL env var are silently skipped.
 */
export function getMcpServers() {
  return mcpJson.servers
    .filter(server => process.env[server.urlEnvVar])
    .map(server => {
      const config = {
        type: 'url',
        name: server.name,
        url: process.env[server.urlEnvVar],
      };
      if (server.tokenEnvVar && process.env[server.tokenEnvVar]) {
        config.authorization_token = process.env[server.tokenEnvVar];
      }
      return config;
    });
}

/**
 * Logs which MCP servers are active/inactive at startup.
 */
export function logMcpStatus() {
  console.log('\n── MCP Server Status ──────────────────────');
  mcpJson.servers.forEach(s => {
    const active = !!process.env[s.urlEnvVar];
    const icon = active ? '✓' : '✗';
    console.log(`  ${icon} ${s.name.padEnd(18)} ${s.description}`);
  });
  console.log('────────────────────────────────────────────\n');
}
