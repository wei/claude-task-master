/**
 * path-utils.js
 * Utility functions for file path operations in Task Master
 *
 * This module provides robust path resolution for both:
 * 1. PACKAGE PATH: Where task-master code is installed
 *    (global node_modules OR local ./node_modules/task-master OR direct from repo)
 * 2. PROJECT PATH: Where user's tasks.json resides (typically user's project root)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';
// Removed lastFoundProjectRoot as it's not suitable for MCP server
// Assuming getProjectRootFromSession is available
import { getProjectRootFromSession } from '../../tools/utils.js';

// Project marker files that indicate a potential project root (can be kept for potential future use or logging)
export const PROJECT_MARKERS = [
	// Task Master specific
	'tasks.json',
	'tasks/tasks.json',

	// Common version control
	'.git',
	'.svn',

	// Common package files
	'package.json',
	'pyproject.toml',
	'Gemfile',
	'go.mod',
	'Cargo.toml',

	// Common IDE/editor folders
	'.cursor',
	'.vscode',
	'.idea',

	// Common dependency directories (check if directory)
	'node_modules',
	'venv',
	'.venv',

	// Common config files
	'.env',
	'.eslintrc',
	'tsconfig.json',
	'babel.config.js',
	'jest.config.js',
	'webpack.config.js',

	// Common CI/CD files
	'.github/workflows',
	'.gitlab-ci.yml',
	'.circleci/config.yml'
];

/**
 * Gets the path to the task-master package installation directory
 * NOTE: This might become unnecessary if CLI fallback in MCP utils is removed.
 * @returns {string} - Absolute path to the package installation directory
 */
export function getPackagePath() {
	// When running from source, __dirname is the directory containing this file
	// When running from npm, we need to find the package root
	const thisFilePath = fileURLToPath(import.meta.url);
	const thisFileDir = path.dirname(thisFilePath);

	// Navigate from core/utils up to the package root
	// In dev: /path/to/task-master/mcp-server/src/core/utils -> /path/to/task-master
	// In npm: /path/to/node_modules/task-master/mcp-server/src/core/utils -> /path/to/node_modules/task-master
	return path.resolve(thisFileDir, '../../../../');
}

/**
 * Finds the absolute path to the tasks.json file and returns the validated project root.
 * Determines the project root using args and session, validates it, searches for tasks.json.
 *
 * @param {Object} args - Command arguments, potentially including 'projectRoot' and 'file'.
 * @param {Object} log - Logger object.
 * @param {Object} session - MCP session object.
 * @returns {Promise<{tasksPath: string, validatedProjectRoot: string}>} - Object containing absolute path to tasks.json and the validated root.
 * @throws {Error} - If a valid project root cannot be determined or tasks.json cannot be found.
 */
export function findTasksJsonPath(args, log, session) {
	const homeDir = os.homedir();
	let targetDirectory = null;
	let rootSource = 'unknown';

	log.info(
		`Finding tasks.json path. Args: ${JSON.stringify(args)}, Session available: ${!!session}`
	);

	// --- Determine Target Directory ---
	if (
		args.projectRoot &&
		args.projectRoot !== '/' &&
		args.projectRoot !== homeDir
	) {
		log.info(`Using projectRoot directly from args: ${args.projectRoot}`);
		targetDirectory = args.projectRoot;
		rootSource = 'args.projectRoot';
	} else {
		log.warn(
			`args.projectRoot ('${args.projectRoot}') is missing or invalid. Attempting to derive from session.`
		);
		const sessionDerivedPath = getProjectRootFromSession(session, log);
		if (
			sessionDerivedPath &&
			sessionDerivedPath !== '/' &&
			sessionDerivedPath !== homeDir
		) {
			log.info(
				`Using project root derived from session: ${sessionDerivedPath}`
			);
			targetDirectory = sessionDerivedPath;
			rootSource = 'session';
		} else {
			log.error(
				`Could not derive a valid project root from session. Session path='${sessionDerivedPath}'`
			);
		}
	}

	// --- Validate the final targetDirectory ---
	if (!targetDirectory) {
		const error = new Error(
			`Cannot find tasks.json: Could not determine a valid project root directory. Please ensure a workspace/folder is open or specify projectRoot.`
		);
		error.code = 'INVALID_PROJECT_ROOT';
		error.details = {
			attemptedArgsProjectRoot: args.projectRoot,
			sessionAvailable: !!session,
			// Add session derived path attempt for better debugging
			attemptedSessionDerivedPath: getProjectRootFromSession(session, {
				info: () => {},
				warn: () => {},
				error: () => {}
			}), // Call again silently for details
			finalDeterminedRoot: targetDirectory // Will be null here
		};
		log.error(`Validation failed: ${error.message}`, error.details);
		throw error;
	}

	// --- Verify targetDirectory exists ---
	if (!fs.existsSync(targetDirectory)) {
		const error = new Error(
			`Determined project root directory does not exist: ${targetDirectory}`
		);
		error.code = 'PROJECT_ROOT_NOT_FOUND';
		error.details = {
			/* ... add details ... */
		};
		log.error(error.message, error.details);
		throw error;
	}
	if (!fs.statSync(targetDirectory).isDirectory()) {
		const error = new Error(
			`Determined project root path is not a directory: ${targetDirectory}`
		);
		error.code = 'PROJECT_ROOT_NOT_A_DIRECTORY';
		error.details = {
			/* ... add details ... */
		};
		log.error(error.message, error.details);
		throw error;
	}

	// --- Search within the validated targetDirectory ---
	log.info(
		`Validated project root (${rootSource}): ${targetDirectory}. Searching for tasks file.`
	);
	try {
		const tasksPath = findTasksJsonInDirectory(targetDirectory, args.file, log);
		// Return both the tasks path and the validated root
		return { tasksPath: tasksPath, validatedProjectRoot: targetDirectory };
	} catch (error) {
		// Augment the error
		error.message = `Tasks file not found within validated project root "${targetDirectory}" (source: ${rootSource}). Ensure 'tasks.json' exists at the root or in a 'tasks/' subdirectory.\nOriginal Error: ${error.message}`;
		error.details = {
			...(error.details || {}), // Keep original details if any
			validatedProjectRoot: targetDirectory,
			rootSource: rootSource,
			attemptedArgsProjectRoot: args.projectRoot,
			sessionAvailable: !!session
		};
		log.error(`Search failed: ${error.message}`, error.details);
		throw error;
	}
}

/**
 * Search for tasks.json in a specific directory (now assumes dirPath is a validated project root)
 * @param {string} dirPath - The validated project root directory to search in.
 * @param {string} explicitFilePath - Optional explicit file path relative to dirPath (e.g., args.file)
 * @param {Object} log - Logger object
 * @returns {string} - Absolute path to tasks.json
 * @throws {Error} - If tasks.json cannot be found in the standard locations within dirPath.
 */
function findTasksJsonInDirectory(dirPath, explicitFilePath, log) {
	const possiblePaths = [];

	// 1. If an explicit file path is provided (relative to dirPath)
	if (explicitFilePath) {
		// Ensure it's treated as relative to the project root if not absolute
		const resolvedExplicitPath = path.isAbsolute(explicitFilePath)
			? explicitFilePath
			: path.resolve(dirPath, explicitFilePath);
		possiblePaths.push(resolvedExplicitPath);
		log.info(`Explicit file path provided, checking: ${resolvedExplicitPath}`);
	}

	// 2. Check the standard locations relative to dirPath
	possiblePaths.push(
		path.join(dirPath, 'tasks.json'),
		path.join(dirPath, 'tasks', 'tasks.json')
	);

	// Deduplicate paths in case explicitFilePath matches a standard location
	const uniquePaths = [...new Set(possiblePaths)];

	log.info(
		`Checking for tasks file in validated root ${dirPath}. Potential paths: ${uniquePaths.join(', ')}`
	);

	// Find the first existing path
	for (const p of uniquePaths) {
		// log.info(`Checking if exists: ${p}`); // Can reduce verbosity
		const exists = fs.existsSync(p);
		// log.info(`Path ${p} exists: ${exists}`); // Can reduce verbosity

		if (exists) {
			log.info(`Found tasks file at: ${p}`);
			// No need to set lastFoundProjectRoot anymore
			return p;
		}
	}

	// If no file was found, throw an error
	const error = new Error(
		`Tasks file not found in any of the expected locations within directory ${dirPath}: ${uniquePaths.join(', ')}`
	);
	error.code = 'TASKS_FILE_NOT_FOUND_IN_ROOT';
	error.details = { searchedDirectory: dirPath, checkedPaths: uniquePaths };
	throw error;
}

// Removed findTasksJsonWithParentSearch, hasProjectMarkers, and findTasksWithNpmConsideration
// as the project root is now determined upfront and validated.

/**
 * Resolves a relative path against the project root, ensuring it's within the project.
 * @param {string} relativePath - The relative path (e.g., 'scripts/report.json').
 * @param {string} projectRoot - The validated absolute path to the project root.
 * @param {Object} log - Logger object.
 * @returns {string} - The absolute path.
 * @throws {Error} - If the resolved path is outside the project root or resolution fails.
 */
export function resolveProjectPath(relativePath, projectRoot, log) {
	if (!projectRoot || !path.isAbsolute(projectRoot)) {
		log.error(
			`Cannot resolve project path: Invalid projectRoot provided: ${projectRoot}`
		);
		throw new Error(
			`Internal Error: Cannot resolve project path due to invalid projectRoot: ${projectRoot}`
		);
	}
	if (!relativePath || typeof relativePath !== 'string') {
		log.error(
			`Cannot resolve project path: Invalid relativePath provided: ${relativePath}`
		);
		throw new Error(
			`Internal Error: Cannot resolve project path due to invalid relativePath: ${relativePath}`
		);
	}

	// If relativePath is already absolute, check if it's within the project root
	if (path.isAbsolute(relativePath)) {
		if (!relativePath.startsWith(projectRoot)) {
			log.error(
				`Path Security Violation: Absolute path \"${relativePath}\" provided is outside the project root \"${projectRoot}\"`
			);
			throw new Error(
				`Provided absolute path is outside the project directory: ${relativePath}`
			);
		}
		log.info(
			`Provided path is already absolute and within project root: ${relativePath}`
		);
		return relativePath; // Return as is if valid absolute path within project
	}

	// Resolve relative path against project root
	const absolutePath = path.resolve(projectRoot, relativePath);

	// Security check: Ensure the resolved path is still within the project root boundary
	// Normalize paths to handle potential .. usages properly before comparison
	const normalizedAbsolutePath = path.normalize(absolutePath);
	const normalizedProjectRoot = path.normalize(projectRoot + path.sep); // Ensure trailing separator for accurate startsWith check

	if (
		!normalizedAbsolutePath.startsWith(normalizedProjectRoot) &&
		normalizedAbsolutePath !== path.normalize(projectRoot)
	) {
		log.error(
			`Path Security Violation: Resolved path \"${normalizedAbsolutePath}\" is outside project root \"${normalizedProjectRoot}\"`
		);
		throw new Error(
			`Resolved path is outside the project directory: ${relativePath}`
		);
	}

	log.info(`Resolved project path: \"${relativePath}\" -> \"${absolutePath}\"`);
	return absolutePath;
}

/**
 * Ensures a directory exists, creating it if necessary.
 * Also verifies that if the path already exists, it is indeed a directory.
 * @param {string} dirPath - The absolute path to the directory.
 * @param {Object} log - Logger object.
 */
export function ensureDirectoryExists(dirPath, log) {
	// Validate dirPath is an absolute path before proceeding
	if (!path.isAbsolute(dirPath)) {
		log.error(
			`Cannot ensure directory: Path provided is not absolute: ${dirPath}`
		);
		throw new Error(
			`Internal Error: ensureDirectoryExists requires an absolute path.`
		);
	}

	if (!fs.existsSync(dirPath)) {
		log.info(`Directory does not exist, creating recursively: ${dirPath}`);
		try {
			fs.mkdirSync(dirPath, { recursive: true });
			log.info(`Successfully created directory: ${dirPath}`);
		} catch (error) {
			log.error(`Failed to create directory ${dirPath}: ${error.message}`);
			// Re-throw the error after logging
			throw new Error(
				`Could not create directory: ${dirPath}. Reason: ${error.message}`
			);
		}
	} else {
		// Path exists, verify it's a directory
		try {
			const stats = fs.statSync(dirPath);
			if (!stats.isDirectory()) {
				log.error(`Path exists but is not a directory: ${dirPath}`);
				throw new Error(
					`Expected directory but found file at path: ${dirPath}`
				);
			}
			log.info(`Directory already exists and is valid: ${dirPath}`);
		} catch (error) {
			// Handle potential errors from statSync (e.g., permissions) or the explicit throw above
			log.error(
				`Error checking existing directory ${dirPath}: ${error.message}`
			);
			throw new Error(
				`Error verifying existing directory: ${dirPath}. Reason: ${error.message}`
			);
		}
	}
}
