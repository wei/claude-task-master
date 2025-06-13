/**
 * git-utils.js
 * Git integration utilities for Task Master
 * Uses raw git commands and gh CLI for operations
 * MCP-friendly: All functions require projectRoot parameter
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Check if the specified directory is inside a git repository
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<boolean>} True if inside a git repository
 */
async function isGitRepository(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for isGitRepository');
	}

	try {
		await execAsync('git rev-parse --git-dir', { cwd: projectRoot });
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Get the current git branch name
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<string|null>} Current branch name or null if not in git repo
 */
async function getCurrentBranch(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getCurrentBranch');
	}

	try {
		const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
			cwd: projectRoot
		});
		return stdout.trim();
	} catch (error) {
		return null;
	}
}

/**
 * Get list of all local git branches
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<string[]>} Array of branch names
 */
async function getLocalBranches(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getLocalBranches');
	}

	try {
		const { stdout } = await execAsync(
			'git branch --format="%(refname:short)"',
			{ cwd: projectRoot }
		);
		return stdout
			.trim()
			.split('\n')
			.filter((branch) => branch.length > 0)
			.map((branch) => branch.trim());
	} catch (error) {
		return [];
	}
}

/**
 * Get list of all remote branches
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<string[]>} Array of remote branch names (without remote prefix)
 */
async function getRemoteBranches(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getRemoteBranches');
	}

	try {
		const { stdout } = await execAsync(
			'git branch -r --format="%(refname:short)"',
			{ cwd: projectRoot }
		);
		return stdout
			.trim()
			.split('\n')
			.filter((branch) => branch.length > 0 && !branch.includes('HEAD'))
			.map((branch) => branch.replace(/^origin\//, '').trim());
	} catch (error) {
		return [];
	}
}

/**
 * Check if gh CLI is available and authenticated
 * @param {string} [projectRoot] - Directory context (optional for this check)
 * @returns {Promise<boolean>} True if gh CLI is available and authenticated
 */
async function isGhCliAvailable(projectRoot = null) {
	try {
		const options = projectRoot ? { cwd: projectRoot } : {};
		await execAsync('gh auth status', options);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Get GitHub repository information using gh CLI
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<Object|null>} Repository info or null if not available
 */
async function getGitHubRepoInfo(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getGitHubRepoInfo');
	}

	try {
		const { stdout } = await execAsync(
			'gh repo view --json name,owner,defaultBranchRef',
			{ cwd: projectRoot }
		);
		return JSON.parse(stdout);
	} catch (error) {
		return null;
	}
}

/**
 * Sanitize branch name to be a valid tag name
 * @param {string} branchName - Git branch name
 * @returns {string} Sanitized tag name
 */
function sanitizeBranchNameForTag(branchName) {
	if (!branchName || typeof branchName !== 'string') {
		return 'unknown-branch';
	}

	// Replace invalid characters with hyphens and clean up
	return branchName
		.replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid chars with hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
		.replace(/-+/g, '-') // Collapse multiple hyphens
		.toLowerCase() // Convert to lowercase
		.substring(0, 50); // Limit length
}

/**
 * Check if a branch name would create a valid tag name
 * @param {string} branchName - Git branch name
 * @returns {boolean} True if branch name can be converted to valid tag
 */
function isValidBranchForTag(branchName) {
	if (!branchName || typeof branchName !== 'string') {
		return false;
	}

	// Check if it's a reserved branch name that shouldn't become tags
	const reservedBranches = ['main', 'master', 'develop', 'dev', 'HEAD'];
	if (reservedBranches.includes(branchName.toLowerCase())) {
		return false;
	}

	// Check if sanitized name would be meaningful
	const sanitized = sanitizeBranchNameForTag(branchName);
	return sanitized.length > 0 && sanitized !== 'unknown-branch';
}

/**
 * Get git repository root directory
 * @param {string} projectRoot - Directory to start search from (required)
 * @returns {Promise<string|null>} Git repository root path or null
 */
async function getGitRepositoryRoot(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getGitRepositoryRoot');
	}

	try {
		const { stdout } = await execAsync('git rev-parse --show-toplevel', {
			cwd: projectRoot
		});
		return stdout.trim();
	} catch (error) {
		return null;
	}
}

/**
 * Check if specified directory is the git repository root
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<boolean>} True if directory is git root
 */
async function isGitRepositoryRoot(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for isGitRepositoryRoot');
	}

	try {
		const gitRoot = await getGitRepositoryRoot(projectRoot);
		return gitRoot && path.resolve(gitRoot) === path.resolve(projectRoot);
	} catch (error) {
		return false;
	}
}

/**
 * Get the default branch name for the repository
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<string|null>} Default branch name or null
 */
async function getDefaultBranch(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for getDefaultBranch');
	}

	try {
		// Try to get from GitHub first (if gh CLI is available)
		if (await isGhCliAvailable(projectRoot)) {
			const repoInfo = await getGitHubRepoInfo(projectRoot);
			if (repoInfo && repoInfo.defaultBranchRef) {
				return repoInfo.defaultBranchRef.name;
			}
		}

		// Fallback to git remote info
		const { stdout } = await execAsync(
			'git symbolic-ref refs/remotes/origin/HEAD',
			{ cwd: projectRoot }
		);
		return stdout.replace('refs/remotes/origin/', '').trim();
	} catch (error) {
		// Final fallback - common default branch names
		const commonDefaults = ['main', 'master'];
		const branches = await getLocalBranches(projectRoot);

		for (const defaultName of commonDefaults) {
			if (branches.includes(defaultName)) {
				return defaultName;
			}
		}

		return null;
	}
}

/**
 * Check if we're currently on the default branch
 * @param {string} projectRoot - Directory to check (required)
 * @returns {Promise<boolean>} True if on default branch
 */
async function isOnDefaultBranch(projectRoot) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for isOnDefaultBranch');
	}

	try {
		const currentBranch = await getCurrentBranch(projectRoot);
		const defaultBranch = await getDefaultBranch(projectRoot);
		return currentBranch && defaultBranch && currentBranch === defaultBranch;
	} catch (error) {
		return false;
	}
}

/**
 * Check and automatically switch tags based on git branch if enabled
 * This runs automatically during task operations, similar to migration
 * @param {string} projectRoot - Project root directory (required)
 * @param {string} tasksPath - Path to tasks.json file
 * @returns {Promise<void>}
 */
async function checkAndAutoSwitchGitTag(projectRoot, tasksPath) {
	if (!projectRoot) {
		throw new Error('projectRoot is required for checkAndAutoSwitchGitTag');
	}

	try {
		// Only proceed if we have a valid project root
		if (!fs.existsSync(projectRoot)) {
			return;
		}

		// Read configuration to check if git workflow is enabled
		const configPath = path.join(projectRoot, '.taskmaster', 'config.json');
		if (!fs.existsSync(configPath)) {
			return; // No config, git workflow disabled
		}

		const rawConfig = fs.readFileSync(configPath, 'utf8');
		const config = JSON.parse(rawConfig);

		// Check if git workflow features are enabled
		const gitWorkflowEnabled = config.tags?.enabledGitworkflow || false;
		const autoSwitchEnabled = config.tags?.autoSwitchTagWithBranch || false;

		if (!gitWorkflowEnabled || !autoSwitchEnabled) {
			return; // Git integration disabled
		}

		// Check if we're in a git repository
		if (!(await isGitRepository(projectRoot))) {
			return; // Not a git repo
		}

		// Get current git branch
		const currentBranch = await getCurrentBranch(projectRoot);
		if (!currentBranch || !isValidBranchForTag(currentBranch)) {
			return; // No valid branch for tag creation
		}

		// Determine expected tag name from branch
		const expectedTag = sanitizeBranchNameForTag(currentBranch);

		// Get current tag from state.json
		const statePath = path.join(projectRoot, '.taskmaster', 'state.json');
		let currentTag = 'master'; // Default fallback
		if (fs.existsSync(statePath)) {
			try {
				const rawState = fs.readFileSync(statePath, 'utf8');
				const state = JSON.parse(rawState);
				currentTag = state.currentTag || 'master';
			} catch (error) {
				// Use default if state reading fails
			}
		}

		// If we're already on the correct tag, nothing to do
		if (currentTag === expectedTag) {
			return;
		}

		// Check if the expected tag exists by reading tasks.json
		if (!fs.existsSync(tasksPath)) {
			return; // No tasks file to work with
		}

		const rawTasksData = fs.readFileSync(tasksPath, 'utf8');
		const tasksData = JSON.parse(rawTasksData);
		const tagExists = tasksData[expectedTag];

		if (tagExists) {
			// Tag exists, switch to it
			console.log(
				`Auto-switching to tag "${expectedTag}" for branch "${currentBranch}"`
			);

			// Update current tag in state.json
			let state = {};
			if (fs.existsSync(statePath)) {
				const rawState = fs.readFileSync(statePath, 'utf8');
				state = JSON.parse(rawState);
			}

			state.currentTag = expectedTag;
			state.lastSwitched = new Date().toISOString();

			// Ensure branchTagMapping exists and update it
			if (!state.branchTagMapping) {
				state.branchTagMapping = {};
			}
			state.branchTagMapping[currentBranch] = expectedTag;

			fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
		} else {
			// Tag doesn't exist, create it automatically
			console.log(
				`Auto-creating tag "${expectedTag}" for branch "${currentBranch}"`
			);

			// Create the tag with a descriptive name
			const newTagData = {
				tasks: [],
				metadata: {
					created: new Date().toISOString(),
					updated: new Date().toISOString(),
					description: `Automatically created from git branch "${currentBranch}"`
				}
			};

			// Add the new tag to the tasks data
			tasksData[expectedTag] = newTagData;
			fs.writeFileSync(tasksPath, JSON.stringify(tasksData, null, 2), 'utf8');

			// Update branch-tag mapping
			let state = {};
			if (fs.existsSync(statePath)) {
				const rawState = fs.readFileSync(statePath, 'utf8');
				state = JSON.parse(rawState);
			}

			state.currentTag = expectedTag;
			state.lastSwitched = new Date().toISOString();

			if (!state.branchTagMapping) {
				state.branchTagMapping = {};
			}
			state.branchTagMapping[currentBranch] = expectedTag;

			fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
		}
	} catch (error) {
		// Silently fail - don't break normal operations
		console.debug(`Git auto-switch failed: ${error.message}`);
	}
}

/**
 * Synchronous version of git tag checking and switching
 * This runs during readJSON to ensure git integration happens BEFORE tag resolution
 * @param {string} projectRoot - Project root directory (required)
 * @param {string} tasksPath - Path to tasks.json file
 * @returns {void}
 */
function checkAndAutoSwitchGitTagSync(projectRoot, tasksPath) {
	if (!projectRoot) {
		return; // Can't proceed without project root
	}

	try {
		// Only proceed if we have a valid project root
		if (!fs.existsSync(projectRoot)) {
			return;
		}

		// Read configuration to check if git workflow is enabled
		const configPath = path.join(projectRoot, '.taskmaster', 'config.json');
		if (!fs.existsSync(configPath)) {
			return; // No config, git workflow disabled
		}

		const rawConfig = fs.readFileSync(configPath, 'utf8');
		const config = JSON.parse(rawConfig);

		// Check if git workflow features are enabled
		const gitWorkflowEnabled = config.tags?.enabledGitworkflow || false;
		const autoSwitchEnabled = config.tags?.autoSwitchTagWithBranch || false;

		if (!gitWorkflowEnabled || !autoSwitchEnabled) {
			return; // Git integration disabled
		}

		// Check if we're in a git repository (synchronously)
		if (!isGitRepositorySync(projectRoot)) {
			return; // Not a git repo
		}

		// Get current git branch (synchronously)
		const currentBranch = getCurrentBranchSync(projectRoot);
		if (!currentBranch || !isValidBranchForTag(currentBranch)) {
			return; // No valid branch for tag creation
		}

		// Determine expected tag name from branch
		const expectedTag = sanitizeBranchNameForTag(currentBranch);

		// Get current tag from state.json
		const statePath = path.join(projectRoot, '.taskmaster', 'state.json');
		let currentTag = 'master'; // default
		if (fs.existsSync(statePath)) {
			try {
				const rawState = fs.readFileSync(statePath, 'utf8');
				const state = JSON.parse(rawState);
				currentTag = state.currentTag || 'master';
			} catch (error) {
				// Use default if state.json is corrupted
			}
		}

		// If we're already on the correct tag, nothing to do
		if (currentTag === expectedTag) {
			return;
		}

		// Check if the expected tag exists in tasks.json
		let tasksData = {};
		if (fs.existsSync(tasksPath)) {
			try {
				const rawTasks = fs.readFileSync(tasksPath, 'utf8');
				tasksData = JSON.parse(rawTasks);
			} catch (error) {
				return; // Can't read tasks file
			}
		}

		const tagExists = tasksData[expectedTag];

		if (tagExists) {
			// Tag exists, switch to it
			console.log(
				`Auto-switching to tag "${expectedTag}" for branch "${currentBranch}"`
			);

			// Update current tag in state.json
			let state = {};
			if (fs.existsSync(statePath)) {
				try {
					const rawState = fs.readFileSync(statePath, 'utf8');
					state = JSON.parse(rawState);
				} catch (error) {
					state = {}; // Start fresh if corrupted
				}
			}

			state.currentTag = expectedTag;
			state.lastSwitched = new Date().toISOString();

			// Ensure branchTagMapping exists and update it
			if (!state.branchTagMapping) {
				state.branchTagMapping = {};
			}
			state.branchTagMapping[currentBranch] = expectedTag;

			fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
		} else {
			// Tag doesn't exist, create it automatically
			console.log(
				`Auto-creating tag "${expectedTag}" for branch "${currentBranch}"`
			);

			// Create the tag with a descriptive name
			const newTagData = {
				tasks: [],
				metadata: {
					created: new Date().toISOString(),
					updated: new Date().toISOString(),
					description: `Automatically created from git branch "${currentBranch}"`
				}
			};

			// Add the new tag to the tasks data
			tasksData[expectedTag] = newTagData;
			fs.writeFileSync(tasksPath, JSON.stringify(tasksData, null, 2), 'utf8');

			// Update branch-tag mapping and current tag
			let state = {};
			if (fs.existsSync(statePath)) {
				try {
					const rawState = fs.readFileSync(statePath, 'utf8');
					state = JSON.parse(rawState);
				} catch (error) {
					state = {}; // Start fresh if corrupted
				}
			}

			state.currentTag = expectedTag;
			state.lastSwitched = new Date().toISOString();

			if (!state.branchTagMapping) {
				state.branchTagMapping = {};
			}
			state.branchTagMapping[currentBranch] = expectedTag;

			fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
		}
	} catch (error) {
		// Silently fail - don't break normal operations
		if (process.env.TASKMASTER_DEBUG === 'true') {
			console.debug(`Git auto-switch failed: ${error.message}`);
		}
	}
}

/**
 * Synchronous check if directory is in a git repository
 * @param {string} projectRoot - Directory to check (required)
 * @returns {boolean} True if inside a git repository
 */
function isGitRepositorySync(projectRoot) {
	if (!projectRoot) {
		return false;
	}

	try {
		execSync('git rev-parse --git-dir', {
			cwd: projectRoot,
			stdio: 'ignore' // Suppress output
		});
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Synchronous get current git branch name
 * @param {string} projectRoot - Directory to check (required)
 * @returns {string|null} Current branch name or null if not in git repo
 */
function getCurrentBranchSync(projectRoot) {
	if (!projectRoot) {
		return null;
	}

	try {
		const stdout = execSync('git rev-parse --abbrev-ref HEAD', {
			cwd: projectRoot,
			encoding: 'utf8'
		});
		return stdout.trim();
	} catch (error) {
		return null;
	}
}

// Export all functions
export {
	isGitRepository,
	getCurrentBranch,
	getLocalBranches,
	getRemoteBranches,
	isGhCliAvailable,
	getGitHubRepoInfo,
	sanitizeBranchNameForTag,
	isValidBranchForTag,
	getGitRepositoryRoot,
	isGitRepositoryRoot,
	getDefaultBranch,
	isOnDefaultBranch,
	checkAndAutoSwitchGitTag,
	checkAndAutoSwitchGitTagSync,
	isGitRepositorySync,
	getCurrentBranchSync
};
