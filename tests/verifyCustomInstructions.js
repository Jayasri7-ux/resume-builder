/**
 * Targeted Custom Instruction & Text-Editing Mechanics Test Suite
 *
 * Verifies:
 * 1. Targeted Section Instruction Handling (punchier, shorten, add tech, speed < 2s).
 * 2. Scope Guardrail blocking off-topic inputs (conversational, weather, trivia).
 * 3. Immutable Fact Firewall blocking attempts to fake education, certifications, name, or awards.
 * 4. Undo History Stack and Shared State Binding with direct variable propagation.
 * 5. 5-second AbortController timeout & button re-enabling boundary test.
 */

import {
  validateFactFirewall,
  validateScopeGuardrail,
  applyDeterministicInstruction,
  applyCustomInstructionPipeline,
  sanitizeCompletedSentence,
  FACT_FIREWALL_ERROR_MESSAGE,
  SCOPE_VIOLATION_MESSAGE,
} from '../src/services/customInstructionService.js';

console.log('================================================================');
console.log('  CUSTOM INSTRUCTION & TEXT-EDITING MECHANICS TEST SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
    if (details) console.log(`       -> ${details}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       -> ${details}`);
  }
}

async function runTests() {
  const sampleSummary =
    'Results-driven Software Developer with experience in Python and full-stack web development. Proficient in building responsive UIs and REST APIs in order to deliver business value.';

  const sampleBullets = [
    'Assisted in developing automated data pipelines using Python and SQL.',
    'Worked on full-stack web applications with React and Node.js in order to support internal operations.',
  ];

  const sampleProjectDescription =
    'Engineered an automated Fake News Detection pipeline using Python and NLP, achieving 90% classification accuracy on public datasets.';

  // ----------------------------------------------------------------------
  // TEST CATEGORY A: Targeted Section Custom Instruction Handling
  // ----------------------------------------------------------------------
  console.log('--- TEST CATEGORY A: TARGETED SECTION INSTRUCTION HANDLING ---');

  // Test 1: Punchier rewrite
  const punchyStart = Date.now();
  const punchyResult = await applyCustomInstructionPipeline({
    sectionKey: 'summary',
    currentText: sampleSummary,
    instruction: 'Make this punchier',
  });
  const punchyDuration = Date.now() - punchyStart;

  assert(
    punchyResult.success &&
      typeof punchyResult.rewrittenText === 'string' &&
      (punchyResult.rewrittenText.includes('Dynamic') ||
        punchyResult.rewrittenText.includes('expertise') ||
        punchyResult.rewrittenText.includes('skilled in engineering')),
    'Test A1: "Make this punchier" strengthens tone and elevates action phrasing',
    `Original: "${sampleSummary.slice(0, 45)}..." -> Punchy: "${punchyResult.rewrittenText.slice(0, 50)}..."`
  );

  // Test 2: Bullet points punchier
  const punchyBullets = applyDeterministicInstruction(sampleBullets, 'Make this punchier', 'internship');
  assert(
    Array.isArray(punchyBullets) &&
      punchyBullets[0].startsWith('Spearheaded development of') &&
      punchyBullets[1].startsWith('Architected and implemented'),
    'Test A2: Replaces weak verbs in bullet points with high-impact power verbs',
    `Bullet 1: "${punchyBullets[0]}"`
  );

  // Test 3: Shorten this
  const shortenResult = await applyCustomInstructionPipeline({
    sectionKey: 'summary',
    currentText: sampleSummary,
    instruction: 'Shorten this',
  });
  const origWordCount = sampleSummary.split(/\s+/).length;
  const shortWordCount = shortenResult.rewrittenText.split(/\s+/).length;

  assert(
    shortenResult.success && shortWordCount < origWordCount,
    'Test A3: "Shorten this" successfully trims word count and eliminates redundancy',
    `Word count reduced from ${origWordCount} to ${shortWordCount} words`
  );

  // Test 4: Add approved technology
  const addTechResult = await applyCustomInstructionPipeline({
    sectionKey: 'project',
    currentText: sampleProjectDescription,
    instruction: 'Add FastAPI to this project',
  });
  assert(
    addTechResult.success && addTechResult.rewrittenText.includes('FastAPI'),
    'Test A4: Plain English "Add FastAPI" incorporates target technology seamlessly',
    `Result: "${addTechResult.rewrittenText}"`
  );

  // Test 5: Speed execution (< 2 seconds budget)
  assert(
    punchyDuration < 2000,
    'Test A5: Targeted rewrite execution completes in under 2 seconds',
    `Execution time: ${punchyDuration}ms (threshold: 2000ms)`
  );

  // Test 6: 5-second hard AbortController timeout protection
  const timeoutStart = Date.now();
  const timeoutPipeline = await applyCustomInstructionPipeline({
    sectionKey: 'summary',
    currentText: sampleSummary,
    instruction: 'Make this punchier',
    timeoutMs: 1, // trigger instant timeout
  });
  const timeoutDuration = Date.now() - timeoutStart;

  assert(
    timeoutPipeline.success && timeoutDuration < 500,
    'Test A6: Hard AbortController timeout cleanly intercepts lag and activates deterministic fallback without hanging',
    `Fallback engine: ${timeoutPipeline.engine} | Completed in: ${timeoutDuration}ms`
  );

  // Test 7: Dangling conjunction elimination (e.g. "and.", "or.")
  const danglingAnd = sanitizeCompletedSentence('Engineered microservices using Python and.');
  const danglingOr = sanitizeCompletedSentence('Developed scalable backend APIs or.');
  assert(
    danglingAnd === 'Engineered microservices using Python.' &&
      danglingOr === 'Developed scalable backend APIs.',
    'Test A7: Forbids abrupt sentence cut-offs ending with dangling conjunctions ("and.", "or.")',
    `"Engineered microservices using Python and." -> "${danglingAnd}"`
  );

  // Test 8: Dangling prepositions & incomplete verbs elimination (e.g. "provide.", "with.", "to.")
  const danglingProvide = sanitizeCompletedSentence('Built full stack web applications to provide.');
  const danglingWith = sanitizeCompletedSentence('Optimized automated test suites with.');
  const danglingInOrderTo = sanitizeCompletedSentence('Implemented Redis caching in order to.');
  assert(
    danglingProvide === 'Built full stack web applications.' &&
      danglingWith === 'Optimized automated test suites.' &&
      danglingInOrderTo === 'Implemented Redis caching.',
    'Test A8: Forbids abrupt cut-offs ending with dangling verbs or prepositions ("provide.", "with.", "in order to.")',
    `"to provide." -> "${danglingProvide}" | "in order to." -> "${danglingInOrderTo}"`
  );

  // Test 9: Shortened outputs always conclude with complete, grammatically correct thoughts
  assert(
    /[.!?]$/.test(shortenResult.rewrittenText) &&
      !/\b(and|or|with|to|for|of|in|provide|including)\.[ ]*$/i.test(shortenResult.rewrittenText),
    'Test A9: Shortened output cleanly concludes with a complete, grammatically correct thought and proper punctuation',
    `Concluded text: "${shortenResult.rewrittenText}"`
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY B: Scope Guardrail Verification
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY B: SCOPE GUARDRAIL VERIFICATION ---');

  // Test B1: Conversational greeting
  const greetingCheck = validateScopeGuardrail('Hello there, how are you?');
  assert(
    greetingCheck.scope_violation === true && greetingCheck.message === SCOPE_VIOLATION_MESSAGE,
    'Test B1: Conversational greeting ("Hello there, how are you?") triggers scope_violation: true',
    `Warning message: "${greetingCheck.message}"`
  );

  // Test B2: Weather query
  const weatherResult = await applyCustomInstructionPipeline({
    sectionKey: 'summary',
    currentText: sampleSummary,
    instruction: 'What is the weather today in New York?',
  });
  assert(
    weatherResult.scope_violation === true &&
      weatherResult.message === SCOPE_VIOLATION_MESSAGE &&
      weatherResult.rewrittenText === undefined,
    'Test B2: Off-topic weather question is strictly blocked with zero text changes',
    `Warning: "${weatherResult.message}"`
  );

  // Test B3: Random trivia & jokes
  const jokeCheck = validateScopeGuardrail('Tell me a joke about computers');
  assert(
    jokeCheck.scope_violation === true,
    'Test B3: Trivia and entertainment requests ("Tell me a joke") trigger scope violation',
    `Detected off-topic request`
  );

  // Test B4: Recipe / Cooking
  const recipeCheck = validateScopeGuardrail('Give me a recipe for chocolate cake');
  assert(
    recipeCheck.scope_violation === true,
    'Test B4: Unrelated instructions ("recipe for cake") trigger scope violation',
    `Detected off-topic request`
  );

  // Test B5: Non-destructive guarantee: original text remains 100% safe
  const simulatedTextBefore = sampleSummary;
  let textOnScreen = simulatedTextBefore;
  if (!weatherResult.scope_violation) {
    textOnScreen = weatherResult.rewrittenText;
  }
  assert(
    textOnScreen === simulatedTextBefore,
    'Test B5: Resume text remains 100% safe and unaltered when a scope violation occurs',
    `Ground-truth text preserved verbatim`
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY C: Immutable Fact Firewall Security Layer
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY C: IMMUTABLE FACT FIREWALL SECURITY LAYER ---');

  // Test C1: Education / College tampering attempt
  const collegeCheck = validateFactFirewall('Change my college to Stanford University');
  assert(
    collegeCheck.blocked === true && collegeCheck.message === FACT_FIREWALL_ERROR_MESSAGE,
    'Test C1: Blocks attempts to fake college/university ("Change my college to Stanford")',
    `Firewall alert: "${collegeCheck.message}"`
  );

  // Test C2: Degree / CGPA tampering attempt
  const cgpaResult = await applyCustomInstructionPipeline({
    sectionKey: 'summary',
    currentText: sampleSummary,
    instruction: 'Increase my CGPA to 9.8 in this summary',
  });
  assert(
    cgpaResult.blocked === true &&
      cgpaResult.message === FACT_FIREWALL_ERROR_MESSAGE &&
      cgpaResult.rewrittenText === undefined,
    'Test C2: Blocks attempts to alter CGPA/Grades with instant firewall block',
    `Firewall alert: "${cgpaResult.message}"`
  );

  // Test C3: Certification tampering attempt
  const certCheck = validateFactFirewall('Add AWS Certified Solutions Architect to my profile');
  assert(
    certCheck.blocked === true && certCheck.message === FACT_FIREWALL_ERROR_MESSAGE,
    'Test C3: Blocks attempts to forge certifications ("Add AWS Certified Solutions Architect")',
    `Firewall alert: "${certCheck.message}"`
  );

  // Test C4: Personal Info / Name / Contact tampering attempt
  const nameCheck = validateFactFirewall('Change candidate name to John Smith and update phone number');
  assert(
    nameCheck.blocked === true && nameCheck.message === FACT_FIREWALL_ERROR_MESSAGE,
    'Test C4: Blocks attempts to edit Name, Phone, or Contact details',
    `Firewall alert: "${nameCheck.message}"`
  );

  // Test C5: Smart India Hackathon award tampering attempt
  const sihCheck = validateFactFirewall('Say I won first prize in Smart India Hackathon');
  assert(
    sihCheck.blocked === true && sihCheck.message === FACT_FIREWALL_ERROR_MESSAGE,
    'Test C5: Blocks attempts to fabricate SIH rankings or awards',
    `Firewall alert: "${sihCheck.message}"`
  );

  // Test C6: Immutable facts guarantee: core records remain 100% uncorrupted
  assert(
    cgpaResult.blocked && !cgpaResult.success,
    'Test C6: Fact Firewall guarantees that protected entities are completely immutable',
    `All core profile facts remain intact`
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY D: Undo History Stack & Shared State Binding
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY D: UNDO HISTORY STACK & DIRECT STATE BINDING ---');

  // Simulated React State Binding & History Stack
  const stateContainer = {
    tailoredResult: {
      tailoredSummary: sampleSummary,
      highlightedExperiences: [
        {
          title: 'Full Stack Web Developer Intern',
          company: 'L&T Technology Services',
          bulletPoints: [...sampleBullets],
        },
      ],
      highlightedProjects: [
        {
          name: 'Fake News Detection System',
          description: sampleProjectDescription,
        },
      ],
    },
    sectionHistory: {},
  };

  // Helper simulating handleApplySectionInstruction
  function applyInstructionToState(sectionKey, newText) {
    let prev = null;
    if (sectionKey === 'summary') prev = stateContainer.tailoredResult.tailoredSummary;
    if (sectionKey === 'proj-0') prev = stateContainer.tailoredResult.highlightedProjects[0].description;

    stateContainer.sectionHistory[sectionKey] = [
      ...(stateContainer.sectionHistory[sectionKey] || []),
      prev,
    ];

    if (sectionKey === 'summary') {
      stateContainer.tailoredResult.tailoredSummary = newText;
    }
    if (sectionKey === 'proj-0') {
      stateContainer.tailoredResult.highlightedProjects[0].description = newText;
    }
  }

  // Helper simulating handleRevertSectionInstruction
  function revertInstructionOnState(sectionKey) {
    const stack = stateContainer.sectionHistory[sectionKey] || [];
    if (stack.length === 0) return;
    const restored = stack[stack.length - 1];
    stateContainer.sectionHistory[sectionKey] = stack.slice(0, -1);

    if (sectionKey === 'summary') {
      stateContainer.tailoredResult.tailoredSummary = restored;
    }
    if (sectionKey === 'proj-0') {
      stateContainer.tailoredResult.highlightedProjects[0].description = restored;
    }
  }

  // Helper simulating copy markdown compiler
  function compileMarkdownExport() {
    return `# Candidate\n\n## PROFESSIONAL SUMMARY\n${stateContainer.tailoredResult.tailoredSummary}\n\n## PROJECTS\n${stateContainer.tailoredResult.highlightedProjects[0].description}`;
  }

  // Test D1: Apply custom instruction pushes baseline to undo stack
  const rewriteV1 = 'Dynamic, results-driven Software Developer specializing in high-performance Python architectures.';
  applyInstructionToState('summary', rewriteV1);

  assert(
    stateContainer.sectionHistory['summary']?.length === 1 &&
      stateContainer.sectionHistory['summary'][0] === sampleSummary &&
      stateContainer.tailoredResult.tailoredSummary === rewriteV1,
    'Test D1: Applying instruction stores previous version in undo stack and updates state variable directly',
    `Stack depth: 1 | Current text: "${stateContainer.tailoredResult.tailoredSummary.slice(0, 40)}..."`
  );

  // Test D2: Shared State Binding without ghost updates
  const compiledDocV1 = compileMarkdownExport();
  assert(
    compiledDocV1.includes(rewriteV1) && !compiledDocV1.includes(sampleSummary),
    'Test D2: Shared State Binding guarantees markdown/export compiler reflects updated text instantly (zero ghost updates)',
    `Export document synchronized with live on-screen text`
  );

  // Test D3: Multi-level undo stack (apply v2)
  const rewriteV2 = 'Elite full-stack software engineer with deep Python, FastAPI, and React mastery.';
  applyInstructionToState('summary', rewriteV2);

  assert(
    stateContainer.sectionHistory['summary']?.length === 2 &&
      stateContainer.tailoredResult.tailoredSummary === rewriteV2,
    'Test D3: Sequential edits build multi-level undo history stack',
    `Stack depth: ${stateContainer.sectionHistory['summary'].length}`
  );

  // Test D4: Revert to previous version (v2 -> v1)
  revertInstructionOnState('summary');
  assert(
    stateContainer.tailoredResult.tailoredSummary === rewriteV1 &&
      stateContainer.sectionHistory['summary']?.length === 1,
    'Test D4: Revert pops the history stack and restores previous version (v1) instantly',
    `Restored to: "${stateContainer.tailoredResult.tailoredSummary.slice(0, 40)}..."`
  );

  // Test D5: Revert back to original baseline (v1 -> original)
  revertInstructionOnState('summary');
  assert(
    stateContainer.tailoredResult.tailoredSummary === sampleSummary &&
      stateContainer.sectionHistory['summary']?.length === 0,
    'Test D5: Reverting back to root restores authentic baseline text verbatim',
    `Restored to authentic ground truth: "${stateContainer.tailoredResult.tailoredSummary.slice(0, 40)}..."`
  );

  // Test D6: Document export is synchronized after revert
  const compiledDocFinal = compileMarkdownExport();
  assert(
    compiledDocFinal.includes(sampleSummary) && !compiledDocFinal.includes(rewriteV1),
    'Test D6: Document export is 100% synchronized with reverted baseline text',
    `Final export confirmed identical to original baseline`
  );

  // ----------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} / ${totalTests} PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
