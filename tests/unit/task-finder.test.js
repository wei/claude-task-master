/**
 * Task finder tests
 */

import { jest } from '@jest/globals';

// Set up mock before imports
const mockReadComplexityReport = jest.fn().mockReturnValue(null);

// Mock utils module to control readComplexityReport behavior
jest.mock('../../scripts/modules/utils.js', () => {
	// Get the original module
	const originalModule = jest.requireActual('../../scripts/modules/utils.js');
	
	// Return a modified version
	return {
		...originalModule,
		readComplexityReport: mockReadComplexityReport
	};
});

// Import after mocks are set up
import { findTaskById } from '../../scripts/modules/utils.js';
import { emptySampleTasks, sampleTasks } from '../fixtures/sample-tasks.js';

describe('Task Finder', () => {
	describe('findTaskById function', () => {
		test('should find a task by numeric ID', () => {
			const task = findTaskById(sampleTasks.tasks, 2);
			expect(task).toBeDefined();
			expect(task.id).toBe(2);
			expect(task.title).toBe('Create Core Functionality');
		});

		test('should find a task by string ID', () => {
			const task = findTaskById(sampleTasks.tasks, '2');
			expect(task).toBeDefined();
			expect(task.id).toBe(2);
		});

		test('should find a subtask using dot notation', () => {
			const subtask = findTaskById(sampleTasks.tasks, '3.1');
			expect(subtask).toBeDefined();
			expect(subtask.id).toBe(1);
			expect(subtask.title).toBe('Create Header Component');
		});

		test('should return null for non-existent task ID', () => {
			const task = findTaskById(sampleTasks.tasks, 99);
			expect(task).toBeNull();
		});

		test('should return null for non-existent subtask ID', () => {
			const subtask = findTaskById(sampleTasks.tasks, '3.99');
			expect(subtask).toBeNull();
		});

		test('should return null for non-existent parent task ID in subtask notation', () => {
			const subtask = findTaskById(sampleTasks.tasks, '99.1');
			expect(subtask).toBeNull();
		});

		test('should return null when tasks array is empty', () => {
			const task = findTaskById(emptySampleTasks.tasks, 1);
			expect(task).toBeNull();
		});

		test('should include complexity score when report exists', () => {
			// call readComplexityReport
			// Set up mock implementation for this test
			mockReadComplexityReport.mockReturnValue({
				meta: {
					generatedAt: '2023-01-01T00:00:00.000Z',
					tasksAnalyzed: 3,
					thresholdScore: 5
				},
				complexityAnalysis: [
					{
						taskId: 1,
						taskTitle: 'Initialize Project',
						complexityScore: 3,
						recommendedSubtasks: 2
					},
					{
						taskId: 2,
						taskTitle: 'Create Core Functionality',
						complexityScore: 8,
						recommendedSubtasks: 5
					},
					{
						taskId: 3,
						taskTitle: 'Implement UI Components',
						complexityScore: 6,
						recommendedSubtasks: 4
					}
				]
			});

			const task = findTaskById(sampleTasks.tasks, 2);
			
			expect(task).toBeDefined();
			expect(task.id).toBe(2);
			expect(task.complexityScore).toBe(8);
		});

		test('should work correctly when task has no complexity data', () => {
			// Set up mock implementation for this test
			mockReadComplexityReport.mockReturnValue({
				complexityAnalysis: [{ taskId: 999, complexityScore: 5 }]
			});
			
			const task = findTaskById(sampleTasks.tasks, 2);
			
			expect(task).toBeDefined();
			expect(task.id).toBe(2);
			expect(task.complexityScore).toBeUndefined();
		});

		test('should work correctly when no complexity report exists', () => {
			// Set up mock implementation for this test
			mockReadComplexityReport.mockReturnValue(null);
			
			const task = findTaskById(sampleTasks.tasks, 2);
			
			expect(task).toBeDefined();
			expect(task.id).toBe(2);
			expect(task.complexityScore).toBeUndefined();
		});
	});
});
