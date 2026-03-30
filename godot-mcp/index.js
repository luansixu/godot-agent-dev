#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */
import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize } from 'path';
import { existsSync, readdirSync } from 'fs';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
// Check if debug mode is enabled
const DEBUG_MODE = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE = true; // Always use GODOT DEBUG MODE
const execFileAsync = promisify(execFile);
// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Main server class for the Godot MCP server
 */
class GodotServer {
    server;
    activeProcess = null;
    godotPath = null;
    operationsScriptPath;
    validatedPaths = new Map();
    strictPathValidation = false;
    previousScreenshot = null;
    watchedNodes = new Map();
    /**
     * Parameter name mappings between snake_case and camelCase
     * This allows the server to accept both formats
     */
    parameterMappings = {
        'project_path': 'projectPath',
        'scene_path': 'scenePath',
        'root_node_type': 'rootNodeType',
        'parent_node_path': 'parentNodePath',
        'node_type': 'nodeType',
        'node_name': 'nodeName',
        'texture_path': 'texturePath',
        'node_path': 'nodePath',
        'output_path': 'outputPath',
        'mesh_item_names': 'meshItemNames',
        'new_path': 'newPath',
        'file_path': 'filePath',
        'directory': 'directory',
        'recursive': 'recursive',
        'scene': 'scene',
    };
    /**
     * Reverse mapping from camelCase to snake_case
     * Generated from parameterMappings for quick lookups
     */
    reverseParameterMappings = {};
    constructor(config) {
        // Initialize reverse parameter mappings
        for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
            this.reverseParameterMappings[camelCase] = snakeCase;
        }
        // Apply configuration if provided
        let debugMode = DEBUG_MODE;
        let godotDebugMode = GODOT_DEBUG_MODE;
        if (config) {
            if (config.debugMode !== undefined) {
                debugMode = config.debugMode;
            }
            if (config.godotDebugMode !== undefined) {
                godotDebugMode = config.godotDebugMode;
            }
            if (config.strictPathValidation !== undefined) {
                this.strictPathValidation = config.strictPathValidation;
            }
            // Store and validate custom Godot path if provided
            if (config.godotPath) {
                const normalizedPath = normalize(config.godotPath);
                this.godotPath = normalizedPath;
                this.logDebug(`Custom Godot path provided: ${this.godotPath}`);
                // Validate immediately with sync check
                if (!this.isValidGodotPathSync(this.godotPath)) {
                    console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
                    this.godotPath = null; // Reset to trigger auto-detection later
                }
            }
        }
        // Set the path to the operations script
        this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
        if (debugMode)
            console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);
        // Initialize the MCP server
        this.server = new Server({
            name: 'godot-mcp',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        // Set up tool handlers
        this.setupToolHandlers();
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        // Cleanup on exit
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }
    /**
     * Log debug messages if debug mode is enabled
     * Using stderr instead of stdout to avoid interfering with JSON-RPC communication
     */
    logDebug(message) {
        if (DEBUG_MODE) {
            console.error(`[DEBUG] ${message}`);
        }
    }
    /**
     * Create a standardized error response with possible solutions
     */
    createErrorResponse(message, possibleSolutions = []) {
        // Log the error
        console.error(`[SERVER] Error response: ${message}`);
        if (possibleSolutions.length > 0) {
            console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
        }
        const response = {
            content: [
                {
                    type: 'text',
                    text: message,
                },
            ],
            isError: true,
        };
        if (possibleSolutions.length > 0) {
            response.content.push({
                type: 'text',
                text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
            });
        }
        return response;
    }
    /**
     * Validate a path to prevent path traversal attacks
     */
    validatePath(path) {
        // Basic validation to prevent path traversal
        if (!path || path.includes('..')) {
            return false;
        }
        // Add more validation as needed
        return true;
    }
    /**
     * Synchronous validation for constructor use
     * This is a quick check that only verifies file existence, not executable validity
     * Full validation will be performed later in detectGodotPath
     * @param path Path to check
     * @returns True if the path exists or is 'godot' (which might be in PATH)
     */
    isValidGodotPathSync(path) {
        try {
            this.logDebug(`Quick-validating Godot path: ${path}`);
            return path === 'godot' || existsSync(path);
        }
        catch (error) {
            this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
            return false;
        }
    }
    /**
     * Validate if a Godot path is valid and executable
     */
    async isValidGodotPath(path) {
        // Check cache first
        if (this.validatedPaths.has(path)) {
            return this.validatedPaths.get(path);
        }
        try {
            this.logDebug(`Validating Godot path: ${path}`);
            // Check if the file exists (skip for 'godot' which might be in PATH)
            if (path !== 'godot' && !existsSync(path)) {
                this.logDebug(`Path does not exist: ${path}`);
                this.validatedPaths.set(path, false);
                return false;
            }
            // Try to execute Godot with --version flag
            // Using execFileAsync with argument array to prevent command injection
            await execFileAsync(path, ['--version']);
            this.logDebug(`Valid Godot path: ${path}`);
            this.validatedPaths.set(path, true);
            return true;
        }
        catch (error) {
            this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
            this.validatedPaths.set(path, false);
            return false;
        }
    }
    /**
     * Detect the Godot executable path based on the operating system
     */
    async detectGodotPath() {
        // If godotPath is already set and valid, use it
        if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
            this.logDebug(`Using existing Godot path: ${this.godotPath}`);
            return;
        }
        // Check environment variable next
        if (process.env.GODOT_PATH) {
            const normalizedPath = normalize(process.env.GODOT_PATH);
            this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
            if (await this.isValidGodotPath(normalizedPath)) {
                this.godotPath = normalizedPath;
                this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
                return;
            }
            else {
                this.logDebug(`GODOT_PATH environment variable is invalid`);
            }
        }
        // Auto-detect based on platform
        const osPlatform = process.platform;
        this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);
        const possiblePaths = [
            'godot', // Check if 'godot' is in PATH first
        ];
        // Add platform-specific paths
        if (osPlatform === 'darwin') {
            possiblePaths.push('/Applications/Godot.app/Contents/MacOS/Godot', '/Applications/Godot_4.app/Contents/MacOS/Godot', `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`, `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`, `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`);
        }
        else if (osPlatform === 'win32') {
            possiblePaths.push('C:\\Program Files\\Godot\\Godot.exe', 'C:\\Program Files (x86)\\Godot\\Godot.exe', 'C:\\Program Files\\Godot_4\\Godot.exe', 'C:\\Program Files (x86)\\Godot_4\\Godot.exe', `${process.env.USERPROFILE}\\Godot\\Godot.exe`);
        }
        else if (osPlatform === 'linux') {
            possiblePaths.push('/usr/bin/godot', '/usr/local/bin/godot', '/snap/bin/godot', `${process.env.HOME}/.local/bin/godot`);
        }
        // Try each possible path
        for (const path of possiblePaths) {
            const normalizedPath = normalize(path);
            if (await this.isValidGodotPath(normalizedPath)) {
                this.godotPath = normalizedPath;
                this.logDebug(`Found Godot at: ${normalizedPath}`);
                return;
            }
        }
        // If we get here, we couldn't find Godot
        this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
        console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
        console.error(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);
        if (this.strictPathValidation) {
            // In strict mode, throw an error
            throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
        }
        else {
            // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
            if (osPlatform === 'win32') {
                this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
            }
            else if (osPlatform === 'darwin') {
                this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
            }
            else {
                this.godotPath = normalize('/usr/bin/godot');
            }
            this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
            console.error(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
            console.error(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
        }
    }
    /**
     * Set a custom Godot path
     * @param customPath Path to the Godot executable
     * @returns True if the path is valid and was set, false otherwise
     */
    async setGodotPath(customPath) {
        if (!customPath) {
            return false;
        }
        // Normalize the path to ensure consistent format across platforms
        // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
        const normalizedPath = normalize(customPath);
        if (await this.isValidGodotPath(normalizedPath)) {
            this.godotPath = normalizedPath;
            this.logDebug(`Godot path set to: ${normalizedPath}`);
            return true;
        }
        this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
        return false;
    }
    /**
     * Clean up resources when shutting down
     */
    async cleanup() {
        this.logDebug('Cleaning up resources');
        if (this.activeProcess) {
            this.logDebug('Killing active Godot process');
            this.activeProcess.process.kill();
            this.activeProcess = null;
        }
        await this.server.close();
    }
    /**
     * Check if the Godot version is 4.4 or later
     * @param version The Godot version string
     * @returns True if the version is 4.4 or later
     */
    isGodot44OrLater(version) {
        const match = version.match(/^(\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            return major > 4 || (major === 4 && minor >= 4);
        }
        return false;
    }
    /**
     * Normalize parameters to camelCase format
     * @param params Object with either snake_case or camelCase keys
     * @returns Object with all keys in camelCase format
     */
    normalizeParameters(params) {
        if (!params || typeof params !== 'object') {
            return params;
        }
        const result = {};
        for (const key in params) {
            if (Object.prototype.hasOwnProperty.call(params, key)) {
                let normalizedKey = key;
                // If the key is in snake_case, convert it to camelCase using our mapping
                if (key.includes('_') && this.parameterMappings[key]) {
                    normalizedKey = this.parameterMappings[key];
                }
                // Handle nested objects recursively
                if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
                    result[normalizedKey] = this.normalizeParameters(params[key]);
                }
                else {
                    result[normalizedKey] = params[key];
                }
            }
        }
        return result;
    }
    /**
     * Convert camelCase keys to snake_case
     * @param params Object with camelCase keys
     * @returns Object with snake_case keys
     */
    convertCamelToSnakeCase(params) {
        const result = {};
        for (const key in params) {
            if (Object.prototype.hasOwnProperty.call(params, key)) {
                // Convert camelCase to snake_case
                const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                // Handle nested objects recursively
                if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
                    result[snakeKey] = this.convertCamelToSnakeCase(params[key]);
                }
                else {
                    result[snakeKey] = params[key];
                }
            }
        }
        return result;
    }
    /**
     * Execute a Godot operation using the operations script
     * @param operation The operation to execute
     * @param params The parameters for the operation
     * @param projectPath The path to the Godot project
     * @returns The stdout and stderr from the operation
     */
    async executeOperation(operation, params, projectPath) {
        this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
        this.logDebug(`Original operation params: ${JSON.stringify(params)}`);
        // Convert camelCase parameters to snake_case for Godot script
        const snakeCaseParams = this.convertCamelToSnakeCase(params);
        this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);
        // Ensure godotPath is set
        if (!this.godotPath) {
            await this.detectGodotPath();
            if (!this.godotPath) {
                throw new Error('Could not find a valid Godot executable path');
            }
        }
        try {
            // Serialize the snake_case parameters to a valid JSON string
            const paramsJson = JSON.stringify(snakeCaseParams);
            // Build argument array for execFile to prevent command injection
            // Using execFile with argument arrays avoids shell interpretation entirely
            const args = [
                '--headless',
                '--path',
                projectPath, // Safe: passed as argument, not interpolated into shell command
                '--script',
                this.operationsScriptPath,
                operation,
                paramsJson, // Safe: passed as argument, not interpreted by shell
            ];
            if (GODOT_DEBUG_MODE) {
                args.push('--debug-godot');
            }
            this.logDebug(`Executing: ${this.godotPath} ${args.join(' ')}`);
            const { stdout, stderr } = await execFileAsync(this.godotPath, args);
            return { stdout: stdout ?? '', stderr: stderr ?? '' };
        }
        catch (error) {
            // If execFileAsync throws, it still contains stdout/stderr
            if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
                const execError = error;
                return {
                    stdout: execError.stdout ?? '',
                    stderr: execError.stderr ?? '',
                };
            }
            throw error;
        }
    }
    /**
     * Get the structure of a Godot project
     * @param projectPath Path to the Godot project
     * @returns Object representing the project structure
     */
    async getProjectStructure(projectPath) {
        try {
            // Get top-level directories in the project
            const entries = readdirSync(projectPath, { withFileTypes: true });
            const structure = {
                scenes: [],
                scripts: [],
                assets: [],
                other: [],
            };
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const dirName = entry.name.toLowerCase();
                    // Skip hidden directories
                    if (dirName.startsWith('.')) {
                        continue;
                    }
                    // Count files in common directories
                    if (dirName === 'scenes' || dirName.includes('scene')) {
                        structure.scenes.push(entry.name);
                    }
                    else if (dirName === 'scripts' || dirName.includes('script')) {
                        structure.scripts.push(entry.name);
                    }
                    else if (dirName === 'assets' ||
                        dirName === 'textures' ||
                        dirName === 'models' ||
                        dirName === 'sounds' ||
                        dirName === 'music') {
                        structure.assets.push(entry.name);
                    }
                    else {
                        structure.other.push(entry.name);
                    }
                }
            }
            return structure;
        }
        catch (error) {
            this.logDebug(`Error getting project structure: ${error}`);
            return { error: 'Failed to get project structure' };
        }
    }
    /**
     * Find Godot projects in a directory
     * @param directory Directory to search
     * @param recursive Whether to search recursively
     * @returns Array of Godot projects
     */
    findGodotProjects(directory, recursive) {
        const projects = [];
        try {
            // Check if the directory itself is a Godot project
            const projectFile = join(directory, 'project.godot');
            if (existsSync(projectFile)) {
                projects.push({
                    path: directory,
                    name: basename(directory),
                });
            }
            // If not recursive, only check immediate subdirectories
            if (!recursive) {
                const entries = readdirSync(directory, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const subdir = join(directory, entry.name);
                        const projectFile = join(subdir, 'project.godot');
                        if (existsSync(projectFile)) {
                            projects.push({
                                path: subdir,
                                name: entry.name,
                            });
                        }
                    }
                }
            }
            else {
                // Recursive search
                const entries = readdirSync(directory, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const subdir = join(directory, entry.name);
                        // Skip hidden directories
                        if (entry.name.startsWith('.')) {
                            continue;
                        }
                        // Check if this directory is a Godot project
                        const projectFile = join(subdir, 'project.godot');
                        if (existsSync(projectFile)) {
                            projects.push({
                                path: subdir,
                                name: entry.name,
                            });
                        }
                        else {
                            // Recursively search this directory
                            const subProjects = this.findGodotProjects(subdir, true);
                            projects.push(...subProjects);
                        }
                    }
                }
            }
        }
        catch (error) {
            this.logDebug(`Error searching directory ${directory}: ${error}`);
        }
        return projects;
    }
    /**
     * Set up the tool handlers for the MCP server
     */
    setupToolHandlers() {
        // Define available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'launch_editor',
                    description: 'Launch Godot editor for a specific project',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                        },
                        required: ['projectPath'],
                    },
                },
                {
                    name: 'run_project',
                    description: 'Run the Godot project and capture output',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scene: {
                                type: 'string',
                                description: 'Optional: Specific scene to run',
                            },
                        },
                        required: ['projectPath'],
                    },
                },
                {
                    name: 'get_debug_output',
                    description: 'Get the current debug output and errors',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: 'stop_project',
                    description: 'Stop the currently running Godot project',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: 'get_godot_version',
                    description: 'Get the installed Godot version',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: 'list_projects',
                    description: 'List Godot projects in a directory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            directory: {
                                type: 'string',
                                description: 'Directory to search for Godot projects',
                            },
                            recursive: {
                                type: 'boolean',
                                description: 'Whether to search recursively (default: false)',
                            },
                        },
                        required: ['directory'],
                    },
                },
                {
                    name: 'get_project_info',
                    description: 'Retrieve metadata about a Godot project',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                        },
                        required: ['projectPath'],
                    },
                },
                {
                    name: 'create_scene',
                    description: 'Create a new Godot scene file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scenePath: {
                                type: 'string',
                                description: 'Path where the scene file will be saved (relative to project)',
                            },
                            rootNodeType: {
                                type: 'string',
                                description: 'Type of the root node (e.g., Node2D, Node3D)',
                            },
                        },
                        required: ['projectPath', 'scenePath'],
                    },
                },
                {
                    name: 'add_node',
                    description: 'Add a node to an existing scene',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scenePath: {
                                type: 'string',
                                description: 'Path to the scene file (relative to project)',
                            },
                            parentNodePath: {
                                type: 'string',
                                description: 'Path to the parent node (e.g., "root" or "root/Player")',
                            },
                            nodeType: {
                                type: 'string',
                                description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
                            },
                            nodeName: {
                                type: 'string',
                                description: 'Name for the new node',
                            },
                            properties: {
                                type: 'object',
                                description: 'Optional properties to set on the node',
                            },
                        },
                        required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
                    },
                },
                {
                    name: 'load_sprite',
                    description: 'Load a sprite into a Sprite2D node',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scenePath: {
                                type: 'string',
                                description: 'Path to the scene file (relative to project)',
                            },
                            nodePath: {
                                type: 'string',
                                description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
                            },
                            texturePath: {
                                type: 'string',
                                description: 'Path to the texture file (relative to project)',
                            },
                        },
                        required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
                    },
                },
                {
                    name: 'export_mesh_library',
                    description: 'Export a scene as a MeshLibrary resource',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scenePath: {
                                type: 'string',
                                description: 'Path to the scene file (.tscn) to export',
                            },
                            outputPath: {
                                type: 'string',
                                description: 'Path where the mesh library (.res) will be saved',
                            },
                            meshItemNames: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                                description: 'Optional: Names of specific mesh items to include (defaults to all)',
                            },
                        },
                        required: ['projectPath', 'scenePath', 'outputPath'],
                    },
                },
                {
                    name: 'save_scene',
                    description: 'Save changes to a scene file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            scenePath: {
                                type: 'string',
                                description: 'Path to the scene file (relative to project)',
                            },
                            newPath: {
                                type: 'string',
                                description: 'Optional: New path to save the scene to (for creating variants)',
                            },
                        },
                        required: ['projectPath', 'scenePath'],
                    },
                },
                {
                    name: 'get_uid',
                    description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            filePath: {
                                type: 'string',
                                description: 'Path to the file (relative to project) for which to get the UID',
                            },
                        },
                        required: ['projectPath', 'filePath'],
                    },
                },
                {
                    name: 'update_project_uids',
                    description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                        },
                        required: ['projectPath'],
                    },
                },
                {
                    name: 'capture_game_screenshot',
                    description: 'Capture a screenshot of the running Godot game window using Windows API (win32gui). Returns base64 PNG image.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filename: {
                                type: 'string',
                                description: 'Output filename for the screenshot (relative to project or absolute path). Default: godot_game_screenshot.png',
                            },
                            windowTitle: {
                                type: 'string',
                                description: 'Substring of the Godot window title to capture (e.g., "昼与夜" or "day-and-night"). Auto-detects if omitted.',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'capture_editor_screenshot',
                    description: 'Capture a screenshot of the Godot editor window using Windows API (win32gui). Returns base64 PNG image.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filename: {
                                type: 'string',
                                description: 'Output filename for the screenshot (relative to project or absolute path). Default: godot_editor_screenshot.png',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'capture_game_screenshot_diff',
                    description: 'Capture the current game window and compare with the previous screenshot to detect changes. Returns the new screenshot, a diff image highlighting changed regions, and a list of changed pixel coordinates. Useful for tracking UI state changes (HP bars, skill cooldowns, phase transitions).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            windowTitle: {
                                type: 'string',
                                description: 'Substring of the Godot window title to capture. Default: "昼与夜"',
                            },
                            filename: {
                                type: 'string',
                                description: 'Output filename for the new screenshot. Default: godot_game_screenshot_diff.png',
                            },
                            diffFilename: {
                                type: 'string',
                                description: 'Output filename for the diff visualization image. Default: godot_game_diff.png',
                            },
                            threshold: {
                                type: 'number',
                                description: 'Pixel change threshold (0.0-1.0). Pixels with normalized difference above threshold are considered changed. Default: 0.05',
                            },
                        },
                    },
                },
                {
                    name: 'input_sequence',
                    description: 'Inject keyboard and mouse input into a running application using Windows API (win32api). Use this to automate gameplay testing.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            inputs: {
                                type: 'array',
                                description: 'Array of input events to execute in sequence. Each event has action_name (from Input Map), duration_ms (hold time), and start_ms (when to start).',
                                items: {
                                    type: 'object',
                                    properties: {
                                        action_name: { type: 'string', description: 'Input action name (e.g., "ui_accept", "ui_left", "ui_right")' },
                                        duration_ms: { type: 'integer', description: 'How long to hold the input in milliseconds (0 = instant tap)', default: 0 },
                                        start_ms: { type: 'integer', description: 'When to start this input in milliseconds from sequence start', default: 0 },
                                    },
                                    required: ['action_name', 'start_ms'],
                                },
                            },
                            windowTitle: {
                                type: 'string',
                                description: 'Substring of the window title to target (e.g., "昼与夜"). Auto-detects if omitted.',
                            },
                        },
                        required: ['inputs'],
                    },
                },
                {
                    name: 'get_runtime_state',
                    description: 'Query runtime node properties from a running Godot game by executing a GDScript inline via godot --script. Returns structured JSON with node path and property values.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            nodePath: {
                                type: 'string',
                                description: 'Path to the node to query (e.g., "/root/Game/PhaseManager"). Root is "root" not "/root".',
                            },
                            properties: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of property names to query (e.g., ["current_phase", "current_turn"]). Empty array returns all properties.',
                            },
                        },
                        required: ['projectPath', 'nodePath'],
                    },
                },
                {
                    name: 'watch_node',
                    description: 'Start watching a node\'s property values. Stores the current values as a baseline. Use get_watch_results to poll for changes since the last check.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to the Godot project directory',
                            },
                            nodePath: {
                                type: 'string',
                                description: 'Path to the node to watch (e.g., "/root/Game/PhaseManager")',
                            },
                            properties: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of property names to watch (e.g., ["current_phase", "current_turn"]). Empty = all properties.',
                            },
                            watchId: {
                                type: 'string',
                                description: 'Unique identifier for this watch. If omitted, defaults to "watch_<nodePath>".',
                            },
                        },
                        required: ['projectPath', 'nodePath'],
                    },
                },
                {
                    name: 'get_watch_results',
                    description: 'Poll all watched nodes and return their current values along with any detected changes since the last check. Useful for detecting phase transitions, HP changes, or unit state changes without restarting the game.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            watchId: {
                                type: 'string',
                                description: 'Optional: poll only a specific watch by its ID. If omitted, returns results for all active watches.',
                            },
                        },
                    },
                },
            ],
        }));
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            this.logDebug(`Handling tool request: ${request.params.name}`);
            switch (request.params.name) {
                case 'launch_editor':
                    return await this.handleLaunchEditor(request.params.arguments);
                case 'run_project':
                    return await this.handleRunProject(request.params.arguments);
                case 'get_debug_output':
                    return await this.handleGetDebugOutput();
                case 'stop_project':
                    return await this.handleStopProject();
                case 'get_godot_version':
                    return await this.handleGetGodotVersion();
                case 'list_projects':
                    return await this.handleListProjects(request.params.arguments);
                case 'get_project_info':
                    return await this.handleGetProjectInfo(request.params.arguments);
                case 'create_scene':
                    return await this.handleCreateScene(request.params.arguments);
                case 'add_node':
                    return await this.handleAddNode(request.params.arguments);
                case 'load_sprite':
                    return await this.handleLoadSprite(request.params.arguments);
                case 'export_mesh_library':
                    return await this.handleExportMeshLibrary(request.params.arguments);
                case 'save_scene':
                    return await this.handleSaveScene(request.params.arguments);
                case 'get_uid':
                    return await this.handleGetUid(request.params.arguments);
                case 'update_project_uids':
                    return await this.handleUpdateProjectUids(request.params.arguments);
                case 'capture_game_screenshot':
                    return await this.handleCaptureGameScreenshot(request.params.arguments);
                case 'capture_editor_screenshot':
                    return await this.handleCaptureEditorScreenshot(request.params.arguments);
                case 'capture_game_screenshot_diff':
                    return await this.handleCaptureGameScreenshotDiff(request.params.arguments);
                case 'input_sequence':
                    return await this.handleInputSequence(request.params.arguments);
                case 'get_runtime_state':
                    return await this.handleGetRuntimeState(request.params.arguments);
                case 'watch_node':
                    return await this.handleWatchNode(request.params.arguments);
                case 'get_watch_results':
                    return await this.handleGetWatchResults(request.params.arguments);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }
    /**
     * Handle the launch_editor tool
     * @param args Tool arguments
     */
    async handleLaunchEditor(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('Project path is required', ['Provide a valid path to a Godot project directory']);
        }
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', ['Provide a valid path without ".." or other potentially unsafe characters']);
        }
        try {
            // Ensure godotPath is set
            if (!this.godotPath) {
                await this.detectGodotPath();
                if (!this.godotPath) {
                    return this.createErrorResponse('Could not find a valid Godot executable path', [
                        'Ensure Godot is installed correctly',
                        'Set GODOT_PATH environment variable to specify the correct path',
                    ]);
                }
            }
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
            const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
                stdio: 'pipe',
            });
            process.on('error', (err) => {
                console.error('Failed to start Godot editor:', err);
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: `Godot editor launched successfully for project at ${args.projectPath}.`,
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(`Failed to launch Godot editor: ${errorMessage}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the run_project tool
     * @param args Tool arguments
     */
    async handleRunProject(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('Project path is required', ['Provide a valid path to a Godot project directory']);
        }
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', ['Provide a valid path without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Kill any existing process
            if (this.activeProcess) {
                this.logDebug('Killing existing Godot process before starting a new one');
                this.activeProcess.process.kill();
            }
            const cmdArgs = ['-d', '--path', args.projectPath];
            if (args.scene && this.validatePath(args.scene)) {
                this.logDebug(`Adding scene parameter: ${args.scene}`);
                cmdArgs.push(args.scene);
            }
            this.logDebug(`Running Godot project: ${args.projectPath}`);
            const process = spawn(this.godotPath, cmdArgs, { stdio: 'pipe' });
            const output = [];
            const errors = [];
            process.stdout?.on('data', (data) => {
                const lines = data.toString().split('\n');
                output.push(...lines);
                lines.forEach((line) => {
                    if (line.trim())
                        this.logDebug(`[Godot stdout] ${line}`);
                });
            });
            process.stderr?.on('data', (data) => {
                const lines = data.toString().split('\n');
                errors.push(...lines);
                lines.forEach((line) => {
                    if (line.trim())
                        this.logDebug(`[Godot stderr] ${line}`);
                });
            });
            process.on('exit', (code) => {
                this.logDebug(`Godot process exited with code ${code}`);
                if (this.activeProcess && this.activeProcess.process === process) {
                    this.activeProcess = null;
                }
            });
            process.on('error', (err) => {
                console.error('Failed to start Godot process:', err);
                if (this.activeProcess && this.activeProcess.process === process) {
                    this.activeProcess = null;
                }
            });
            this.activeProcess = { process, output, errors };
            return {
                content: [
                    {
                        type: 'text',
                        text: `Godot project started in debug mode. Use get_debug_output to see output.`,
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(`Failed to run Godot project: ${errorMessage}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the get_debug_output tool
     */
    async handleGetDebugOutput() {
        if (!this.activeProcess) {
            return this.createErrorResponse('No active Godot process.', [
                'Use run_project to start a Godot project first',
                'Check if the Godot process crashed unexpectedly',
            ]);
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        output: this.activeProcess.output,
                        errors: this.activeProcess.errors,
                    }, null, 2),
                },
            ],
        };
    }
    /**
     * Handle the stop_project tool
     */
    async handleStopProject() {
        if (!this.activeProcess) {
            return this.createErrorResponse('No active Godot process to stop.', [
                'Use run_project to start a Godot project first',
                'The process may have already terminated',
            ]);
        }
        this.logDebug('Stopping active Godot process');
        this.activeProcess.process.kill();
        const output = this.activeProcess.output;
        const errors = this.activeProcess.errors;
        this.activeProcess = null;
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Godot project stopped',
                        finalOutput: output,
                        finalErrors: errors,
                    }, null, 2),
                },
            ],
        };
    }
    /**
     * Handle the get_godot_version tool
     */
    async handleGetGodotVersion() {
        try {
            // Ensure godotPath is set
            if (!this.godotPath) {
                await this.detectGodotPath();
                if (!this.godotPath) {
                    return this.createErrorResponse('Could not find a valid Godot executable path', [
                        'Ensure Godot is installed correctly',
                        'Set GODOT_PATH environment variable to specify the correct path',
                    ]);
                }
            }
            this.logDebug('Getting Godot version');
            const { stdout } = await execFileAsync(this.godotPath, ['--version']);
            return {
                content: [
                    {
                        type: 'text',
                        text: stdout.trim(),
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(`Failed to get Godot version: ${errorMessage}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
            ]);
        }
    }
    /**
     * Handle the list_projects tool
     */
    async handleListProjects(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.directory) {
            return this.createErrorResponse('Directory is required', ['Provide a valid directory path to search for Godot projects']);
        }
        if (!this.validatePath(args.directory)) {
            return this.createErrorResponse('Invalid directory path', ['Provide a valid path without ".." or other potentially unsafe characters']);
        }
        try {
            this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
            if (!existsSync(args.directory)) {
                return this.createErrorResponse(`Directory does not exist: ${args.directory}`, ['Provide a valid directory path that exists on the system']);
            }
            const recursive = args.recursive === true;
            const projects = this.findGodotProjects(args.directory, recursive);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(projects, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to list projects: ${error?.message || 'Unknown error'}`, [
                'Ensure the directory exists and is accessible',
                'Check if you have permission to read the directory',
            ]);
        }
    }
    /**
     * Get the structure of a Godot project asynchronously by counting files recursively
     * @param projectPath Path to the Godot project
     * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
     */
    getProjectStructureAsync(projectPath) {
        return new Promise((resolve) => {
            try {
                const structure = {
                    scenes: 0,
                    scripts: 0,
                    assets: 0,
                    other: 0,
                };
                const scanDirectory = (currentPath) => {
                    const entries = readdirSync(currentPath, { withFileTypes: true });
                    for (const entry of entries) {
                        const entryPath = join(currentPath, entry.name);
                        // Skip hidden files and directories
                        if (entry.name.startsWith('.')) {
                            continue;
                        }
                        if (entry.isDirectory()) {
                            // Recursively scan subdirectories
                            scanDirectory(entryPath);
                        }
                        else if (entry.isFile()) {
                            // Count file by extension
                            const ext = entry.name.split('.').pop()?.toLowerCase();
                            if (ext === 'tscn') {
                                structure.scenes++;
                            }
                            else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
                                structure.scripts++;
                            }
                            else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
                                structure.assets++;
                            }
                            else {
                                structure.other++;
                            }
                        }
                    }
                };
                // Start scanning from the project root
                scanDirectory(projectPath);
                resolve(structure);
            }
            catch (error) {
                this.logDebug(`Error getting project structure asynchronously: ${error}`);
                resolve({
                    error: 'Failed to get project structure',
                    scenes: 0,
                    scripts: 0,
                    assets: 0,
                    other: 0
                });
            }
        });
    }
    /**
     * Handle the get_project_info tool
     */
    async handleGetProjectInfo(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('Project path is required', ['Provide a valid path to a Godot project directory']);
        }
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', ['Provide a valid path without ".." or other potentially unsafe characters']);
        }
        try {
            // Ensure godotPath is set
            if (!this.godotPath) {
                await this.detectGodotPath();
                if (!this.godotPath) {
                    return this.createErrorResponse('Could not find a valid Godot executable path', [
                        'Ensure Godot is installed correctly',
                        'Set GODOT_PATH environment variable to specify the correct path',
                    ]);
                }
            }
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            this.logDebug(`Getting project info for: ${args.projectPath}`);
            // Get Godot version
            const execOptions = { timeout: 10000 }; // 10 second timeout
            const { stdout } = await execFileAsync(this.godotPath, ['--version'], execOptions);
            // Get project structure using the recursive method
            const projectStructure = await this.getProjectStructureAsync(args.projectPath);
            // Extract project name from project.godot file
            let projectName = basename(args.projectPath);
            try {
                const fs = require('fs');
                const projectFileContent = fs.readFileSync(projectFile, 'utf8');
                const configNameMatch = projectFileContent.match(/config\/name="([^"]+)"/);
                if (configNameMatch && configNameMatch[1]) {
                    projectName = configNameMatch[1];
                    this.logDebug(`Found project name in config: ${projectName}`);
                }
            }
            catch (error) {
                this.logDebug(`Error reading project file: ${error}`);
                // Continue with default project name if extraction fails
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            name: projectName,
                            path: args.projectPath,
                            godotVersion: stdout.trim(),
                            structure: projectStructure,
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to get project info: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the create_scene tool
     */
    async handleCreateScene(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.scenePath) {
            return this.createErrorResponse('Project path and scene path are required', ['Provide valid paths for both the project and the scene']);
        }
        if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                scenePath: args.scenePath,
                rootNodeType: args.rootNodeType || 'Node2D',
            };
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to create scene: ${stderr}`, [
                    'Check if the root node type is valid',
                    'Ensure you have write permissions to the scene path',
                    'Verify the scene path is valid',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to create scene: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the add_node tool
     */
    async handleAddNode(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
            return this.createErrorResponse('Missing required parameters', ['Provide projectPath, scenePath, nodeType, and nodeName']);
        }
        if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Check if the scene file exists
            const scenePath = join(args.projectPath, args.scenePath);
            if (!existsSync(scenePath)) {
                return this.createErrorResponse(`Scene file does not exist: ${args.scenePath}`, [
                    'Ensure the scene path is correct',
                    'Use create_scene to create a new scene first',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                scenePath: args.scenePath,
                nodeType: args.nodeType,
                nodeName: args.nodeName,
            };
            // Add optional parameters
            if (args.parentNodePath) {
                params.parentNodePath = args.parentNodePath;
            }
            if (args.properties) {
                params.properties = args.properties;
            }
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to add node: ${stderr}`, [
                    'Check if the node type is valid',
                    'Ensure the parent node path exists',
                    'Verify the scene file is valid',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to add node: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the load_sprite tool
     */
    async handleLoadSprite(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
            return this.createErrorResponse('Missing required parameters', ['Provide projectPath, scenePath, nodePath, and texturePath']);
        }
        if (!this.validatePath(args.projectPath) ||
            !this.validatePath(args.scenePath) ||
            !this.validatePath(args.nodePath) ||
            !this.validatePath(args.texturePath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Check if the scene file exists
            const scenePath = join(args.projectPath, args.scenePath);
            if (!existsSync(scenePath)) {
                return this.createErrorResponse(`Scene file does not exist: ${args.scenePath}`, [
                    'Ensure the scene path is correct',
                    'Use create_scene to create a new scene first',
                ]);
            }
            // Check if the texture file exists
            const texturePath = join(args.projectPath, args.texturePath);
            if (!existsSync(texturePath)) {
                return this.createErrorResponse(`Texture file does not exist: ${args.texturePath}`, [
                    'Ensure the texture path is correct',
                    'Upload or create the texture file first',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                scenePath: args.scenePath,
                nodePath: args.nodePath,
                texturePath: args.texturePath,
            };
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to load sprite: ${stderr}`, [
                    'Check if the node path is correct',
                    'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
                    'Verify the texture file is a valid image format',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to load sprite: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the export_mesh_library tool
     */
    async handleExportMeshLibrary(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.scenePath || !args.outputPath) {
            return this.createErrorResponse('Missing required parameters', ['Provide projectPath, scenePath, and outputPath']);
        }
        if (!this.validatePath(args.projectPath) ||
            !this.validatePath(args.scenePath) ||
            !this.validatePath(args.outputPath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Check if the scene file exists
            const scenePath = join(args.projectPath, args.scenePath);
            if (!existsSync(scenePath)) {
                return this.createErrorResponse(`Scene file does not exist: ${args.scenePath}`, [
                    'Ensure the scene path is correct',
                    'Use create_scene to create a new scene first',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                scenePath: args.scenePath,
                outputPath: args.outputPath,
            };
            // Add optional parameters
            if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
                params.meshItemNames = args.meshItemNames;
            }
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to export mesh library: ${stderr}`, [
                    'Check if the scene contains valid 3D meshes',
                    'Ensure the output path is valid',
                    'Verify the scene file is valid',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to export mesh library: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the save_scene tool
     */
    async handleSaveScene(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.scenePath) {
            return this.createErrorResponse('Missing required parameters', ['Provide projectPath and scenePath']);
        }
        if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        // If newPath is provided, validate it
        if (args.newPath && !this.validatePath(args.newPath)) {
            return this.createErrorResponse('Invalid new path', ['Provide a valid new path without ".." or other potentially unsafe characters']);
        }
        try {
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Check if the scene file exists
            const scenePath = join(args.projectPath, args.scenePath);
            if (!existsSync(scenePath)) {
                return this.createErrorResponse(`Scene file does not exist: ${args.scenePath}`, [
                    'Ensure the scene path is correct',
                    'Use create_scene to create a new scene first',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                scenePath: args.scenePath,
            };
            // Add optional parameters
            if (args.newPath) {
                params.newPath = args.newPath;
            }
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to save scene: ${stderr}`, [
                    'Check if the scene file is valid',
                    'Ensure you have write permissions to the output path',
                    'Verify the scene can be properly packed',
                ]);
            }
            const savePath = args.newPath || args.scenePath;
            return {
                content: [
                    {
                        type: 'text',
                        text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to save scene: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the get_uid tool
     */
    async handleGetUid(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath || !args.filePath) {
            return this.createErrorResponse('Missing required parameters', ['Provide projectPath and filePath']);
        }
        if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
            return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." or other potentially unsafe characters']);
        }
        try {
            // Ensure godotPath is set
            if (!this.godotPath) {
                await this.detectGodotPath();
                if (!this.godotPath) {
                    return this.createErrorResponse('Could not find a valid Godot executable path', [
                        'Ensure Godot is installed correctly',
                        'Set GODOT_PATH environment variable to specify the correct path',
                    ]);
                }
            }
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Check if the file exists
            const filePath = join(args.projectPath, args.filePath);
            if (!existsSync(filePath)) {
                return this.createErrorResponse(`File does not exist: ${args.filePath}`, ['Ensure the file path is correct']);
            }
            // Get Godot version to check if UIDs are supported
            const { stdout: versionOutput } = await execFileAsync(this.godotPath, ['--version']);
            const version = versionOutput.trim();
            if (!this.isGodot44OrLater(version)) {
                return this.createErrorResponse(`UIDs are only supported in Godot 4.4 or later. Current version: ${version}`, [
                    'Upgrade to Godot 4.4 or later to use UIDs',
                    'Use resource paths instead of UIDs for this version of Godot',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                filePath: args.filePath,
            };
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to get UID: ${stderr}`, [
                    'Check if the file is a valid Godot resource',
                    'Ensure the file path is correct',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `UID for ${args.filePath}: ${stdout.trim()}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to get UID: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Handle the update_project_uids tool
     */
    async handleUpdateProjectUids(args) {
        // Normalize parameters to camelCase
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('Project path is required', ['Provide a valid path to a Godot project directory']);
        }
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', ['Provide a valid path without ".." or other potentially unsafe characters']);
        }
        try {
            // Ensure godotPath is set
            if (!this.godotPath) {
                await this.detectGodotPath();
                if (!this.godotPath) {
                    return this.createErrorResponse('Could not find a valid Godot executable path', [
                        'Ensure Godot is installed correctly',
                        'Set GODOT_PATH environment variable to specify the correct path',
                    ]);
                }
            }
            // Check if the project directory exists and contains a project.godot file
            const projectFile = join(args.projectPath, 'project.godot');
            if (!existsSync(projectFile)) {
                return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
                    'Ensure the path points to a directory containing a project.godot file',
                    'Use list_projects to find valid Godot projects',
                ]);
            }
            // Get Godot version to check if UIDs are supported
            const { stdout: versionOutput } = await execFileAsync(this.godotPath, ['--version']);
            const version = versionOutput.trim();
            if (!this.isGodot44OrLater(version)) {
                return this.createErrorResponse(`UIDs are only supported in Godot 4.4 or later. Current version: ${version}`, [
                    'Upgrade to Godot 4.4 or later to use UIDs',
                    'Use resource paths instead of UIDs for this version of Godot',
                ]);
            }
            // Prepare parameters for the operation (already in camelCase)
            const params = {
                projectPath: args.projectPath,
            };
            // Execute the operation
            const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);
            if (stderr && stderr.includes('Failed to')) {
                return this.createErrorResponse(`Failed to update project UIDs: ${stderr}`, [
                    'Check if the project is valid',
                    'Ensure you have write permissions to the project directory',
                ]);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to update project UIDs: ${error?.message || 'Unknown error'}`, [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the project path is accessible',
            ]);
        }
    }
    /**
     * Capture a screenshot of the running Godot game window using Windows API
     */
    async handleCaptureGameScreenshot(args) {
        args = this.normalizeParameters(args);
        const windowTitle = args.windowTitle || '昼与夜';
        const filename = args.filename || 'godot_game_screenshot.png';
        const script = `
import win32gui, win32ui
from PIL import Image
import sys, os, base64, io

hwnd = None

def find_window(title):
    def callback(h, windows):
        t = win32gui.GetWindowText(h)
        if title in t and win32gui.IsWindowVisible(h):
            windows.append(h)
        return True
    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows[0] if windows else None

hwnd = find_window("${windowTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")
if not hwnd:
    print("ERROR:WINDOW_NOT_FOUND")
    sys.exit(1)

left, top, right, bottom = win32gui.GetWindowRect(hwnd)
w, h = right - left, bottom - top

hwndDC = win32gui.GetWindowDC(hwnd)
mfcDC = win32ui.CreateDCFromHandle(hwndDC)
saveDC = mfcDC.CreateCompatibleDC()
bmp = win32ui.CreateBitmap()
bmp.CreateCompatibleBitmap(mfcDC, w, h)
saveDC.SelectObject(bmp)
saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), 13369376)

bmpinfo = bmp.GetInfo()
bmpstr = bmp.GetBitmapBits(True)
img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRX', 0, 1)

output_path = r"${filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
img.save(output_path)

# Encode to base64 for MCP response
buf = io.BytesIO()
img.save(buf, format='PNG')
b64 = base64.b64encode(buf.getvalue()).decode('ascii')

win32gui.DeleteObject(bmp.GetHandle())
saveDC.DeleteDC()
mfcDC.DeleteDC()
win32gui.ReleaseDC(hwnd, hwndDC)

print(f"OK:{output_path}:{w}:{h}:{b64}")
`.trim();
        try {
            const { stdout } = await execFileAsync('python', ['-c', script]);
            const result = stdout.trim();
            if (result.startsWith('ERROR:')) {
                const msg = result.substring(6);
                if (msg === 'WINDOW_NOT_FOUND') {
                    return this.createErrorResponse(`No Godot game window found with title containing "${windowTitle}"`, [
                        `Ensure the game is running with "${windowTitle}" in the window title`,
                        'Use run_project to start the game first',
                        'Or try a different windowTitle parameter',
                    ]);
                }
                return this.createErrorResponse(`Screenshot failed: ${msg}`, []);
            }
            const parts = result.split(':');
            const path = parts[1];
            const width = parts[2];
            const height = parts[3];
            // base64 is everything after the 3rd colon
            const base64 = parts.slice(3).join(':');
            return {
                content: [
                    {
                        type: 'text',
                        text: `Screenshot captured: ${path} (${width}x${height})`,
                    },
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png',
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to capture screenshot: ${error?.message || 'Unknown error'}`, [
                'Ensure Python and win32gui are installed',
                'Ensure the Godot game window is visible',
            ]);
        }
    }
    /**
     * Capture a screenshot of the Godot editor window using Windows API
     */
    async handleCaptureEditorScreenshot(args) {
        args = this.normalizeParameters(args);
        const filename = args.filename || 'godot_editor_screenshot.png';
        const script = `
import win32gui, win32ui
from PIL import Image
import sys, os, base64, io

def find_editor():
    def callback(h, windows):
        t = win32gui.GetWindowText(h)
        if 'Godot' in t and win32gui.IsWindowVisible(h):
            windows.append(h)
        return True
    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows[0] if windows else None

hwnd = find_editor()
if not hwnd:
    print("ERROR:WINDOW_NOT_FOUND")
    sys.exit(1)

left, top, right, bottom = win32gui.GetWindowRect(hwnd)
w, h = right - left, bottom - top

hwndDC = win32gui.GetWindowDC(hwnd)
mfcDC = win32ui.CreateDCFromHandle(hwndDC)
saveDC = mfcDC.CreateCompatibleDC()
bmp = win32ui.CreateBitmap()
bmp.CreateCompatibleBitmap(mfcDC, w, h)
saveDC.SelectObject(bmp)
saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), 13369376)

bmpinfo = bmp.GetInfo()
bmpstr = bmp.GetBitmapBits(True)
img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRX', 0, 1)

output_path = r"${filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
img.save(output_path)

# Encode to base64 for MCP response
buf = io.BytesIO()
img.save(buf, format='PNG')
b64 = base64.b64encode(buf.getvalue()).decode('ascii')

win32gui.DeleteObject(bmp.GetHandle())
saveDC.DeleteDC()
mfcDC.DeleteDC()
win32gui.ReleaseDC(hwnd, hwndDC)

print(f"OK:{output_path}:{w}:{h}:{b64}")
`.trim();
        try {
            const { stdout } = await execFileAsync('python', ['-c', script]);
            const result = stdout.trim();
            if (result.startsWith('ERROR:')) {
                return this.createErrorResponse('No Godot editor window found', [
                    'Ensure the Godot editor is open with the project',
                    'Use launch_editor to open the Godot editor first',
                ]);
            }
            const parts = result.split(':');
            const path = parts[1];
            const width = parts[2];
            const height = parts[3];
            const base64 = parts.slice(3).join(':');
            return {
                content: [
                    {
                        type: 'text',
                        text: `Editor screenshot captured: ${path} (${width}x${height})`,
                    },
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png',
                    },
                ],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to capture editor screenshot: ${error?.message || 'Unknown error'}`, []);
        }
    }
    /**
     * Capture the current game window and compare with the previous screenshot
     * to detect visual changes. Useful for tracking HP bars, skill cooldowns, phase transitions.
     */
    async handleCaptureGameScreenshotDiff(args) {
        args = this.normalizeParameters(args);
        const windowTitle = args.windowTitle || '昼与夜';
        const filename = args.filename || 'godot_game_screenshot_diff.png';
        const diffFilename = args.diffFilename || 'godot_game_diff.png';
        const threshold = args.threshold != null ? Number(args.threshold) : 0.05;
        // Python script: capture screenshot + compare with stored previous
        const script = `
import win32gui, win32ui
from PIL import Image
import sys, os, base64, io, json, time

PREV_BASE64 = """${this.previousScreenshot ? this.previousScreenshot.base64 : ''}"""
PREV_W = ${this.previousScreenshot ? this.previousScreenshot.width : 0}
PREV_H = ${this.previousScreenshot ? this.previousScreenshot.height : 0}

def find_window(title):
    def callback(h, windows):
        t = win32gui.GetWindowText(h)
        if title in t and win32gui.IsWindowVisible(h):
            windows.append(h)
        return True
    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows[0] if windows else None

hwnd = find_window("${windowTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")
if not hwnd:
    print("ERROR:WINDOW_NOT_FOUND")
    sys.exit(1)

left, top, right, bottom = win32gui.GetWindowRect(hwnd)
w, h = right - left, bottom - top

hwndDC = win32gui.GetWindowDC(hwnd)
mfcDC = win32ui.CreateDCFromHandle(hwndDC)
saveDC = mfcDC.CreateCompatibleDC()
bmp = win32ui.CreateBitmap()
bmp.CreateCompatibleBitmap(mfcDC, w, h)
saveDC.SelectObject(bmp)
saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), 13369376)

bmpinfo = bmp.GetInfo()
bmpstr = bmp.GetBitmapBits(True)
img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRX', 0, 1)

output_path = r"${filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
diff_path = r"${diffFilename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
os.makedirs(os.path.dirname(diff_path) or '.', exist_ok=True)
img.save(output_path)

# Encode current screenshot
buf = io.BytesIO()
img.save(buf, format='PNG')
b64 = base64.b64encode(buf.getvalue()).decode('ascii')

# Compare with previous screenshot
changed_pixels = 0
total_pixels = w * h
changed_regions = []
diff_img = None

if PREV_BASE64 and PREV_W == w and PREV_H == h:
    try:
        prev_bytes = base64.b64decode(PREV_BASE64)
        prev_buf = io.BytesIO(prev_bytes)
        prev_img = Image.open(prev_buf).convert('RGB')

        # Compute per-pixel difference
        diff_img = Image.new('RGB', (w, h), (0, 0, 0))
        pixels = img.load()
        prev_pixels = prev_img.load()
        diff_pixels = diff_img.load()

        threshold_val = ${threshold}
        changed_coords = []

        # Sample every 4th pixel for performance (reduces computation 16x)
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                r1, g1, b1 = pixels[x, y]
                r2, g2, b2 = prev_pixels[x, y]
                diff = abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
                norm_diff = diff / (255.0 * 3)
                if norm_diff > threshold_val:
                    changed_pixels += 1
                    changed_coords.append((x, y))
                    # Highlight in red on diff image
                    diff_pixels[x, y] = (255, 0, 0)

        # Calculate percentage
        sample_total = (w // 4) * (h // 4)
        change_pct = (changed_pixels / sample_total * 100) if sample_total > 0 else 0

        # Find bounding boxes for changed regions
        if changed_coords:
            min_x = min(c[0] for c in changed_coords)
            max_x = max(c[0] for c in changed_coords)
            min_y = min(c[1] for c in changed_coords)
            max_y = max(c[1] for c in changed_coords)
            changed_regions = [{
                "x": min_x, "y": min_y,
                "width": max_x - min_x, "height": max_y - min_y,
                "center_x": (min_x + max_x) // 2,
                "center_y": (min_y + max_y) // 2
            }]

        diff_img.save(diff_path)
    except Exception as e:
        pass  # If comparison fails, just return without diff

# Encode diff image
diff_b64 = ""
if diff_img:
    buf2 = io.BytesIO()
    diff_img.save(buf2, format='PNG')
    diff_b64 = base64.b64encode(buf2.getvalue()).decode('ascii')

win32gui.DeleteObject(bmp.GetHandle())
saveDC.DeleteDC()
mfcDC.DeleteDC()
win32gui.ReleaseDC(hwnd, hwndDC)

result = {
    "path": output_path,
    "width": w,
    "height": h,
    "base64": b64,
    "diff_path": diff_path if diff_img else "",
    "diff_b64": diff_b64,
    "changed_pixels": changed_pixels,
    "total_pixels": total_pixels,
    "change_pct": round((changed_pixels / max(1, (w // 4) * (h // 4)) * 100), 2),
    "changed_regions": changed_regions,
    "has_previous": bool(PREV_BASE64)
}
print("OK:" + json.dumps(result))
`.trim();
        try {
            const { stdout } = await execFileAsync('python', ['-c', script]);
            const result = stdout.trim();
            if (result.startsWith('ERROR:')) {
                const msg = result.substring(6);
                if (msg === 'WINDOW_NOT_FOUND') {
                    return this.createErrorResponse(`No Godot game window found with title containing "${windowTitle}"`, [
                        `Ensure the game is running with "${windowTitle}" in the window title`,
                        'Use run_project to start the game first',
                    ]);
                }
                return this.createErrorResponse(`Screenshot diff failed: ${msg}`, []);
            }
            const jsonStr = result.substring(3); // Remove "OK:"
            const data = JSON.parse(jsonStr);
            // Store this screenshot as the new baseline
            this.previousScreenshot = {
                base64: data.base64,
                width: data.width,
                height: data.height,
                timestamp: Date.now(),
            };
            const response = {
                content: [
                    {
                        type: 'text',
                        text: `Screenshot diff: ${data.width}x${data.height}, ${data.change_pct}% pixels changed${data.has_previous ? '' : ' (no previous screenshot — baseline captured)'}${data.changed_regions.length > 0 ? ', changed region: (' + data.changed_regions[0].center_x + ', ' + data.changed_regions[0].center_y + ')' : ''}`,
                    },
                    {
                        type: 'image',
                        data: data.base64,
                        mimeType: 'image/png',
                    },
                ],
            };
            // Include diff image if comparison was possible
            if (data.diff_b64) {
                response.content.push({
                    type: 'image',
                    data: data.diff_b64,
                    mimeType: 'image/png',
                });
                response.content[0].text += ` | Diff image: ${data.diff_path}`;
            }
            return response;
        }
        catch (error) {
            return this.createErrorResponse(`Failed to capture screenshot diff: ${error?.message || 'Unknown error'}`, ['Ensure Python, win32gui, and PIL are installed']);
        }
    }
    /**
     * Inject keyboard/mouse input into a running application using Windows API.
     * Supports Godot Input Map actions and raw keyboard/mouse events.
     */
    async handleInputSequence(args) {
        args = this.normalizeParameters(args);
        if (!args.inputs || !Array.isArray(args.inputs) || args.inputs.length === 0) {
            return this.createErrorResponse('inputs array is required and must not be empty', ['Provide an array of input events with action_name and start_ms']);
        }
        // Build Python script to find window and inject inputs
        const windowTitle = (args.windowTitle || '昼与夜').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // Map Godot action names to virtual key codes
        const actionKeyMap = {
            'ui_accept': 0x0D, // VK_RETURN
            'ui_cancel': 0x1B, // VK_ESCAPE
            'ui_left': 0x25, // VK_LEFT
            'ui_right': 0x27, // VK_RIGHT
            'ui_up': 0x26, // VK_UP
            'ui_down': 0x28, // VK_DOWN
            'ui_select': 0x0D, // VK_RETURN
            'ui_focus_next': 0x09, // VK_TAB
            'ui_focus_prev': 0x09, // VK_TAB
            'ui_page_up': 0x21, // VK_PRIOR
            'ui_page_down': 0x22, // VK_NEXT
            'ui_home': 0x24, // VK_HOME
            'ui_end': 0x23, // VK_END
            'ui_space': 0x20, // VK_SPACE
        };
        // Serialize inputs into a Python list of tuples
        const inputsPyList = args.inputs.map((input) => {
            const vk = actionKeyMap[input.action_name] ?? 0x0D; // Default to Return
            return `(${vk}, ${input.duration_ms || 0}, ${input.start_ms || 0})`;
        }).join(', ');
        const script = `
import win32api, win32gui, time

def find_window(title):
    def callback(h, windows):
        t = win32gui.GetWindowText(h)
        if title in t and win32gui.IsWindowVisible(h):
            windows.append(h)
        return True
    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows[0] if windows else None

hwnd = find_window("${windowTitle}")
if not hwnd:
    print("ERROR:WINDOW_NOT_FOUND")
    raise SystemExit(1)

win32gui.SetForegroundWindow(hwnd)
time.sleep(0.05)

inputs = [${inputsPyList}]
for vk, duration_ms, start_ms in inputs:
    if start_ms > 0:
        time.sleep(start_ms / 1000.0)
    if duration_ms == 0:
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.02)
        win32api.keybd_event(vk, 0, 2, 0)
    else:
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(duration_ms / 1000.0)
        win32api.keybd_event(vk, 0, 2, 0)

print(f"OK:{len(inputs)}")
`.trim();
        try {
            const { stdout, stderr } = await execFileAsync('python', ['-c', script]);
            if (stdout.trim().startsWith('ERROR:')) {
                const msg = stdout.trim().substring(6);
                if (msg === 'WINDOW_NOT_FOUND') {
                    return this.createErrorResponse(`No window found with title containing "${windowTitle}"`, [
                        `Ensure the game is running with "${windowTitle}" in the title`,
                        'Use run_project to start the game first',
                    ]);
                }
                return this.createErrorResponse(`Input injection failed: ${msg}`, []);
            }
            const count = stdout.trim().replace('OK:', '');
            return {
                content: [{
                        type: 'text',
                        text: `Input sequence executed: ${count} event(s) injected into "${windowTitle}"`,
                    }],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to inject input: ${error?.message || 'Unknown error'}`, [
                'Ensure Python and win32api (pywin32) are installed',
                'Ensure the target window is running and accessible',
            ]);
        }
    }
    /**
     * Query runtime node properties from a running Godot game.
     * Uses godot --script to execute inline GDScript and return structured JSON.
     */
    async handleGetRuntimeState(args) {
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('projectPath is required', []);
        }
        if (!args.nodePath) {
            return this.createErrorResponse('nodePath is required', []);
        }
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', []);
        }
        if (!this.godotPath) {
            await this.detectGodotPath();
            if (!this.godotPath) {
                return this.createErrorResponse('Could not find Godot executable', []);
            }
        }
        const nodePath = args.nodePath.replace(/^\/root\//, 'root');
        const properties = args.properties || [];
        const propsCondition = properties.length > 0
            ? `var props = [${properties.map((p) => `"${p}"`).join(', ')}]; var result = {}\nfor p in props:\n    if n.has(p): result[p] = n.get(p)\nreturn JSON.stringify(result)`
            : 'return JSON.stringify({"exists": true})';
        const gdScript = `
extends Node

func _ready():
    var root = get_tree().root
    var n = root.get_node("${nodePath}")
    if not n:
        print("ERROR:NODE_NOT_FOUND")
        get_tree().quit()
        return
    ${properties.length > 0 ? `var props = [${properties.map((p) => `"${p}"`).join(', ')}]\nvar result = {}\nfor p in props:\n    if n.has(p): result[p] = str(n.get(p))\nprint("OK:" + JSON.stringify(result))` : 'print("OK:{\\\\"exists\\\\": true}")'}
    get_tree().quit()
`;
        // Write script to a temp file
        const os = await import('os');
        const os_path = await import('path');
        const fs = await import('fs');
        const tmpDir = os.tmpdir();
        const tmpScript = os_path.join(tmpDir, `godot_query_${Date.now()}.gd`);
        fs.writeFileSync(tmpScript, gdScript);
        try {
            const { stdout, stderr } = await execFileAsync(this.godotPath, ['--headless', '--path', args.projectPath, '--script', tmpScript], { timeout: 10000 });
            const output = (stdout || '').trim() + (stderr || '').trim();
            if (output.includes('ERROR:NODE_NOT_FOUND')) {
                return this.createErrorResponse(`Node not found at path: ${nodePath}`, ['Verify the node exists in the current scene']);
            }
            const jsonStart = output.indexOf('OK:');
            if (jsonStart === -1) {
                return this.createErrorResponse(`Unexpected Godot output: ${output.substring(0, 200)}`, []);
            }
            const jsonStr = output.substring(jsonStart + 3).split('\n')[0].trim();
            const data = JSON.parse(jsonStr);
            return {
                content: [{
                        type: 'text',
                        text: `Node: ${nodePath}\n${JSON.stringify(data, null, 2)}`,
                    }],
            };
        }
        catch (error) {
            return this.createErrorResponse(`Failed to query runtime state: ${error?.message || 'Unknown error'}`, ['Ensure the game is running and the node path is correct']);
        }
        finally {
            // Clean up temp script
            try {
                const fs = await import('fs');
                fs.unlinkSync(tmpScript);
            }
            catch { /* ignore cleanup errors */ }
        }
    }
    /**
     * Start watching a node's properties. Stores current values as baseline.
     */
    async handleWatchNode(args) {
        args = this.normalizeParameters(args);
        if (!args.projectPath) {
            return this.createErrorResponse('projectPath is required', []);
        }
        if (!args.nodePath) {
            return this.createErrorResponse('nodePath is required', []);
        }
        const watchId = args.watchId || `watch_${args.nodePath.replace(/\//g, '_')}`;
        const properties = args.properties || [];
        if (!this.validatePath(args.projectPath)) {
            return this.createErrorResponse('Invalid project path', []);
        }
        // Get current values via get_runtime_state
        const currentState = await this.handleGetRuntimeState({
            projectPath: args.projectPath,
            nodePath: args.nodePath,
            properties,
        });
        if (currentState.content?.[0]?.type === 'text' && currentState.content[0].text.startsWith('ERROR')) {
            return currentState;
        }
        // Parse current values from the response
        const text = currentState.content?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        let currentValues = new Map();
        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[0]);
                for (const [k, v] of Object.entries(data)) {
                    currentValues.set(k, v);
                }
            }
            catch { /* ignore parse errors */ }
        }
        this.watchedNodes.set(watchId, {
            projectPath: args.projectPath,
            nodePath: args.nodePath,
            properties,
            lastValues: currentValues,
        });
        return {
            content: [{
                    type: 'text',
                    text: `Watching node: ${args.nodePath} [id=${watchId}]\nBaseline values:\n${Array.from(currentValues.entries()).map(([k, v]) => `  ${k} = ${v}`).join('\n') || '  (no properties tracked)'}\nUse get_watch_results to poll for changes.`,
                }],
        };
    }
    /**
     * Poll watched nodes and report any changes since the last check.
     */
    async handleGetWatchResults(args) {
        const watchId = args?.watchId;
        const results = [];
        const watchesToCheck = watchId
            ? (this.watchedNodes.has(watchId) ? [this.watchedNodes.get(watchId)] : [])
            : Array.from(this.watchedNodes.values());
        if (watchesToCheck.length === 0) {
            return {
                content: [{
                        type: 'text',
                        text: watchId
                            ? `No active watch with id: ${watchId}`
                            : 'No active watches. Use watch_node first.',
                    }],
            };
        }
        const watchEntries = watchId
            ? [[watchId, this.watchedNodes.get(watchId)]]
            : Array.from(this.watchedNodes.entries());
        for (const [id, watch] of watchEntries) {
            // Get current values
            const currentState = await this.handleGetRuntimeState({
                projectPath: watch.projectPath,
                nodePath: watch.nodePath,
                properties: watch.properties,
            });
            const text = currentState.content?.[0]?.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            let currentValues = new Map();
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[0]);
                    for (const [k, v] of Object.entries(data)) {
                        currentValues.set(k, v);
                    }
                }
                catch { /* ignore */ }
            }
            // Compare with baseline
            const changes = [];
            for (const [k, v] of currentValues.entries()) {
                const oldVal = watch.lastValues.get(k);
                if (String(oldVal) !== String(v)) {
                    changes.push({ property: k, oldValue: oldVal, newValue: v });
                }
            }
            // Update stored values
            watch.lastValues = currentValues;
            results.push({
                watchId: id,
                nodePath: watch.nodePath,
                changed: changes.length > 0,
                changes,
            });
        }
        const summary = results.map(r => {
            if (!r.changed)
                return `[${r.watchId}] ${r.nodePath}: no changes`;
            return `[${r.watchId}] ${r.nodePath}: CHANGED\n${r.changes.map(c => `  ${c.property}: ${c.oldValue} → ${c.newValue}`).join('\n')}`;
        }).join('\n');
        return {
            content: [{
                    type: 'text',
                    text: `Watch results:\n${summary}`,
                }],
        };
    }
    /**
     * Run the MCP server
     */
    async run() {
        try {
            // Detect Godot path before starting the server
            await this.detectGodotPath();
            if (!this.godotPath) {
                console.error('[SERVER] Failed to find a valid Godot executable path');
                console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
                process.exit(1);
            }
            // Check if the path is valid
            const isValid = await this.isValidGodotPath(this.godotPath);
            if (!isValid) {
                if (this.strictPathValidation) {
                    // In strict mode, exit if the path is invalid
                    console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
                    console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
                    process.exit(1);
                }
                else {
                    // In compatibility mode, warn but continue with the default path
                    console.error(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
                    console.error('[SERVER] This may cause issues when executing Godot commands');
                    console.error('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
                }
            }
            console.error(`[SERVER] Using Godot at: ${this.godotPath}`);
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error('Godot MCP server running on stdio');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[SERVER] Failed to start:', errorMessage);
            process.exit(1);
        }
    }
}
// Create and run the server
const server = new GodotServer();
server.run().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to run server:', errorMessage);
    process.exit(1);
});
