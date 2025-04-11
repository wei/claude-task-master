/**
 * tools/analyze.js
 * Tool for analyzing task complexity and generating recommendations
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse
	// getProjectRootFromSession // No longer needed here
} from './utils.js';
import { analyzeTaskComplexityDirect } from '../core/task-master-core.js';

/**
 * Register the analyze tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerAnalyzeTool(server) {
	server.addTool({
		name: 'analyze_project_complexity',
		description:
			'Analyze task complexity and generate expansion recommendations. Requires the project root path.',
		parameters: z.object({
			projectRoot: z
				.string()
				.describe(
					'Required. Absolute path to the root directory of the project being analyzed.'
				),
			output: z
				.string()
				.optional()
				.describe(
					'Output file path for the report, relative to projectRoot (default: scripts/task-complexity-report.json)'
				),
			threshold: z.coerce
				.number()
				.min(1)
				.max(10)
				.optional()
				.describe(
					'Minimum complexity score to recommend expansion (1-10) (default: 5). If the complexity score is below this threshold, the tool will not recommend adding subtasks.'
				),
			research: z
				.boolean()
				.optional()
				.describe('Use Perplexity AI for research-backed complexity analysis')
		}),
		execute: async (args, { log, session }) => {
			try {
				log.info(
					`Analyzing task complexity with required projectRoot: ${args.projectRoot}, other args: ${JSON.stringify(args)}`
				);

				const result = await analyzeTaskComplexityDirect(args, log, {
					session
				});

				if (result.success && result.data) {
					log.info(`Task complexity analysis complete: ${result.data.message}`);
					log.info(
						`Report summary: ${JSON.stringify(result.data.reportSummary)}`
					);
				} else if (!result.success && result.error) {
					log.error(
						`Failed to analyze task complexity: ${result.error.message} (Code: ${result.error.code})`
					);
				}

				return handleApiResult(result, log, 'Error analyzing task complexity');
			} catch (error) {
				log.error(
					`Unexpected error in analyze tool execute method: ${error.message}`,
					{ stack: error.stack }
				);
				return createErrorResponse(
					`Unexpected error in analyze tool: ${error.message}`
				);
			}
		}
	});
}
