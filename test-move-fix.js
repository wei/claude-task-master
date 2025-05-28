/**
 * Test script for move-task functionality
 *
 * This script tests various scenarios for the move-task command to ensure
 * it works correctly without creating duplicate tasks or leaving orphaned data.
 *
 * Test scenarios covered:
 * 1. Moving a subtask to become a standalone task (with specific target ID)
 * 2. Moving a task to replace another task
 *
 * Usage:
 *   node test-move-fix.js                    # Run all tests
 *
 * Or import specific test functions:
 *   import { testMoveSubtaskToTask } from './test-move-fix.js';
 *
 * This was created to verify the fix for the bug where moving subtasks
 * to standalone tasks was creating duplicate entries.
 */

import fs from "fs";
import path from "path";
import moveTask from "./scripts/modules/task-manager/move-task.js";

// Create a test tasks.json file
const testData = {
  tasks: [
    {
      id: 1,
      title: "Parent Task",
      description: "A parent task with subtasks",
      status: "pending",
      priority: "medium",
      details: "Parent task details",
      testStrategy: "Parent test strategy",
      subtasks: [
        {
          id: 1,
          title: "Subtask 1",
          description: "First subtask",
          status: "pending",
          details: "Subtask 1 details",
          testStrategy: "Subtask 1 test strategy",
        },
        {
          id: 2,
          title: "Subtask 2",
          description: "Second subtask",
          status: "pending",
          details: "Subtask 2 details",
          testStrategy: "Subtask 2 test strategy",
        },
      ],
    },
    {
      id: 2,
      title: "Another Task",
      description: "Another standalone task",
      status: "pending",
      priority: "low",
      details: "Another task details",
      testStrategy: "Another test strategy",
    },
    {
      id: 3,
      title: "Third Task",
      description: "A third standalone task",
      status: "done",
      priority: "high",
      details: "Third task details",
      testStrategy: "Third test strategy",
    },
  ],
};

const testFile = "./test-tasks.json";

function logSeparator(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function logTaskState(data, label) {
  console.log(`\n${label}:`);
  console.log(
    "Tasks:",
    data.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))
  );

  data.tasks.forEach((task) => {
    if (task.subtasks && task.subtasks.length > 0) {
      console.log(
        `Task ${task.id} subtasks:`,
        task.subtasks.map((st) => ({ id: st.id, title: st.title }))
      );
    }
  });
}

async function testMoveSubtaskToTask() {
  try {
    logSeparator("TEST: Move Subtask to Standalone Task");

    // Write test data
    fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));

    const beforeData = JSON.parse(fs.readFileSync(testFile, "utf8"));
    logTaskState(beforeData, "Before move");

    // Move subtask 1.2 to become task 26
    console.log("\n🔄 Moving subtask 1.2 to task 26...");
    const result = await moveTask(testFile, "1.2", "26", false);

    const afterData = JSON.parse(fs.readFileSync(testFile, "utf8"));
    logTaskState(afterData, "After move");

    // Verify the result
    const task26 = afterData.tasks.find((t) => t.id === 26);
    if (task26) {
      console.log("\n✅ SUCCESS: Task 26 created with correct content:");
      console.log("  Title:", task26.title);
      console.log("  Description:", task26.description);
      console.log("  Details:", task26.details);
      console.log("  Dependencies:", task26.dependencies);
      console.log("  Priority:", task26.priority);
    } else {
      console.log("\n❌ FAILED: Task 26 not found");
    }

    // Check for duplicates
    const taskIds = afterData.tasks.map((t) => t.id);
    const duplicates = taskIds.filter(
      (id, index) => taskIds.indexOf(id) !== index
    );
    if (duplicates.length > 0) {
      console.log("\n❌ FAILED: Duplicate task IDs found:", duplicates);
    } else {
      console.log("\n✅ SUCCESS: No duplicate task IDs");
    }

    // Check that original subtask was removed
    const task1 = afterData.tasks.find((t) => t.id === 1);
    const hasSubtask2 = task1.subtasks?.some((st) => st.id === 2);
    if (hasSubtask2) {
      console.log("\n❌ FAILED: Original subtask 1.2 still exists");
    } else {
      console.log("\n✅ SUCCESS: Original subtask 1.2 was removed");
    }

    return true;
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    return false;
  }
}

async function testMoveTaskToTask() {
  try {
    logSeparator("TEST: Move Task to Replace Another Task");

    // Reset test data
    fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));

    const beforeData = JSON.parse(fs.readFileSync(testFile, "utf8"));
    logTaskState(beforeData, "Before move");

    // Move task 2 to replace task 3
    console.log("\n🔄 Moving task 2 to replace task 3...");
    const result = await moveTask(testFile, "2", "3", false);

    const afterData = JSON.parse(fs.readFileSync(testFile, "utf8"));
    logTaskState(afterData, "After move");

    // Verify the result
    const task3 = afterData.tasks.find((t) => t.id === 3);
    const task2Gone = !afterData.tasks.find((t) => t.id === 2);

    if (task3 && task3.title === "Another Task" && task2Gone) {
      console.log("\n✅ SUCCESS: Task 2 replaced task 3 correctly");
      console.log("  New Task 3 title:", task3.title);
      console.log("  New Task 3 description:", task3.description);
    } else {
      console.log("\n❌ FAILED: Task replacement didn't work correctly");
    }

    return true;
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    return false;
  }
}

async function runAllTests() {
  console.log("🧪 Running Move Task Tests");

  const results = [];

  results.push(await testMoveSubtaskToTask());
  results.push(await testMoveTaskToTask());

  const passed = results.filter((r) => r).length;
  const total = results.length;

  logSeparator("TEST SUMMARY");
  console.log(`\n📊 Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("⚠️  Some tests failed. Check the output above.");
  }

  // Clean up
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
    console.log("\n🧹 Cleaned up test files");
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

// Export for use in other test files
export { testMoveSubtaskToTask, testMoveTaskToTask, runAllTests };
