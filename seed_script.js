#!/usr/bin/env node
// ^^ Makes the script executable directly (after chmod +x)

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// --- Configuration ---
const DB_FILE = path.join(__dirname, 'tesslate.db'); // Assumes script is in the same folder as the db
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error(`Error opening database ${DB_FILE}:`, err.message);
        process.exit(1); // Exit if DB connection fails
    } else {
        console.log(`Connected to the database: ${DB_FILE}`);
        // Enable foreign keys for this connection
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if(pragmaErr) {
                 console.error("Could not enable foreign keys:", pragmaErr);
                 process.exit(1);
            } else {
                 runSeedingOperations(); // Start the seeding process
            }
        });
    }
});

// --- Data to Add/Update ---
// Edit the arrays below with the data you want to insert or update.

const useCasesToAdd = [
    { name: 'RAG', slug: 'rag' },
    { name: 'Web Dev', slug: 'web-dev' },
    { name: 'General Coding', slug: 'general-coding' },
    { name: 'Reasoning', slug: 'reasoning' },
    { name: 'Knowledge Q&A', slug: 'knowledge-qa' },
    { name: 'Creative Writing', slug: 'creative-writing' },
    { name: 'Translation', slug: 'translation' },
    // Add more use cases here
];

const benchmarksToAdd = [
    { name: 'MMLU Pro', short_name: 'MMLU Pro', description: 'Expert-level multi-task accuracy benchmark', source_url: 'https://github.com/google-deepmind/mmmu' },
    { name: 'GPQA Diamond', short_name: 'GPQA', description: 'Graduate-Level Google-Proof Q&A Benchmark', source_url: 'https://github.com/idavidrein/gpqa' },
    { name: 'HumanEval+', short_name: 'HumanEval+', description: 'Code generation benchmark (extended)', source_url: 'https://github.com/evalplus/evalplus' },
    { name: 'LiveBench QA', short_name: 'LiveBench', description: 'Real-time, evolving question answering', source_url: 'https://github.com/livebench/livebench' },
    { name: 'Arena Elo', short_name: 'Arena Elo', description: 'Chatbot Arena Elo rating based on human preference', source_url: 'https://chat.lmsys.org/' },
    { name: 'GSM8K', short_name: 'GSM8K', description: 'Grade School Math Word Problems', source_url: 'https://github.com/openai/grade-school-math' },
    // Add more benchmarks here
];

const modelsToAdd = [
    { name: 'Qwen2.5-0.5B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-0.5B' },
    { name: 'Qwen2.5-1.5B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-1.5B' },
    { name: 'Qwen2.5-3B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 0, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-3B' },
    { name: 'Qwen2.5-7B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-7B' },
    { name: 'Qwen2.5-14B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-14B' },
    { name: 'Qwen2.5-32B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-32B' },
    { name: 'Qwen2.5-72B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 0, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-72B' },
    
    { name: 'Qwen2.5-Coder-1.5B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B' },
    { name: 'Qwen2.5-Coder-7B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B' },
    { name: 'Qwen2.5-Coder-32B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download (on the way)', formats: null, huggingface_link: null },

    { name: 'Qwen2.5-Math-1.5B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-Math-1.5B' },
    { name: 'Qwen2.5-Math-7B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-Math-7B' },
    { name: 'Qwen2.5-Math-72B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original,GGUF,AWQ,GPTQ', huggingface_link: 'https://huggingface.co/Qwen/Qwen2.5-Math-72B' },

    { name: 'Qwen-Plus', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 0, availability: 'API', formats: null, huggingface_link: null },
    { name: 'Qwen-Turbo', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 0, availability: 'API', formats: null, huggingface_link: null },
    { name: 'Qwen2-VL-72B', provider: 'Qwen Team', knowledge_cutoff: 'Unknown', is_open_source: 1, availability: 'Download', formats: 'Original', huggingface_link: 'https://huggingface.co/Qwen/Qwen2-VL-72B' },
];


const benchmarkScoresToAdd = [
    // Use the exact 'name' for model and 'short_name' for benchmark as defined above
    // 'score_link' is optional (can be null)
    { modelName: 'GPT-4 Turbo', benchShortName: 'MMLU Pro', score: 86.9, score_link: null },
    { modelName: 'GPT-4 Turbo', benchShortName: 'GPQA', score: 58.2, score_link: null },
    { modelName: 'GPT-4 Turbo', benchShortName: 'LiveBench', score: 9.1, score_link: null },
    { modelName: 'GPT-4 Turbo', benchShortName: 'Arena Elo', score: 1251, score_link: 'https://chat.lmsys.org/' },
    { modelName: 'GPT-4 Turbo', benchShortName: 'GSM8K', score: 95.3, score_link: null }, // Added new score

    { modelName: 'Claude 3 Opus', benchShortName: 'MMLU Pro', score: 88.1, score_link: null },
    { modelName: 'Claude 3 Opus', benchShortName: 'GPQA', score: 60.1, score_link: null },
    { modelName: 'Claude 3 Opus', benchShortName: 'LiveBench', score: 9.3, score_link: null },
    { modelName: 'Claude 3 Opus', benchShortName: 'Arena Elo', score: 1253, score_link: 'https://chat.lmsys.org/' },
    { modelName: 'Claude 3 Opus', benchShortName: 'GSM8K', score: 96.9, score_link: null }, // Added new score

    { modelName: 'Llama 3 70B Instruct', benchShortName: 'MMLU Pro', score: 82.0, score_link: null },
    { modelName: 'Llama 3 70B Instruct', benchShortName: 'GPQA', score: 55.1, score_link: null },
    { modelName: 'Llama 3 70B Instruct', benchShortName: 'LiveBench', score: 8.5, score_link: null },
    { modelName: 'Llama 3 70B Instruct', benchShortName: 'Arena Elo', score: 1215, score_link: 'https://chat.lmsys.org/' },
    { modelName: 'Llama 3 70B Instruct', benchShortName: 'GSM8K', score: 94.1, score_link: null }, // Added new score

    { modelName: 'Qwen 1.5 72B Chat', benchShortName: 'MMLU Pro', score: 79.5, score_link: null }, // Added scores for new model
    { modelName: 'Qwen 1.5 72B Chat', benchShortName: 'GSM8K', score: 91.6, score_link: null },
    { modelName: 'Qwen 1.5 72B Chat', benchShortName: 'HumanEval+', score: 81.1, score_link: null }, // Assuming HumanEval+ score
    { modelName: 'Qwen 1.5 72B Chat', benchShortName: 'Arena Elo', score: 1180, score_link: 'https://chat.lmsys.org/' }, // Placeholder Elo
    { modelName: 'Qwen2.5-3B', benchShortName: 'MMLU Pro', score: 67.0, score_link: null },
    { modelName: 'Qwen2.5-7B', benchShortName: 'MMLU Pro', score: 80.0, score_link: null },
    { modelName: 'Qwen2.5-7B', benchShortName: 'HumanEval+', score: 85.0, score_link: null },
    { modelName: 'Qwen2.5-7B', benchShortName: 'GSM8K', score: 90.0, score_link: null },
    { modelName: 'Qwen2.5-14B', benchShortName: 'MMLU Pro', score: 83.0, score_link: null },
    { modelName: 'Qwen2.5-14B', benchShortName: 'GSM8K', score: 92.0, score_link: null },
    { modelName: 'Qwen2.5-14B', benchShortName: 'HumanEval+', score: 86.0, score_link: null },
    { modelName: 'Qwen2.5-32B', benchShortName: 'MMLU Pro', score: 84.0, score_link: null },
    { modelName: 'Qwen2.5-32B', benchShortName: 'GSM8K', score: 93.0, score_link: null },
    { modelName: 'Qwen2.5-32B', benchShortName: 'HumanEval+', score: 86.5, score_link: null },
    { modelName: 'Qwen2.5-72B', benchShortName: 'MMLU Pro', score: 85.1, score_link: null },
    { modelName: 'Qwen2.5-72B', benchShortName: 'GSM8K', score: 94.0, score_link: null },
    { modelName: 'Qwen2.5-72B', benchShortName: 'HumanEval+', score: 87.0, score_link: null },
    { modelName: 'Qwen2.5-Coder-7B', benchShortName: 'HumanEval+', score: 85.0, score_link: null },
    { modelName: 'Qwen2.5-Math-1.5B', benchShortName: 'GSM8K', score: 89.0, score_link: null },
    { modelName: 'Qwen2.5-Math-7B', benchShortName: 'GSM8K', score: 92.0, score_link: null },
    { modelName: 'Qwen2.5-Math-72B', benchShortName: 'GSM8K', score: 96.0, score_link: null },
    { modelName: 'Qwen2-VL-72B', benchShortName: 'MMLU Pro', score: 82.0, score_link: null },

    // ... Add scores for all relevant model/benchmark combinations
];

// --- Helper Functions for DB Operations ---

// Wrap db.run in a Promise
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { // Use function() for 'this'
            if (err) {
                console.error('SQL Error:', err.message, '\nSQL:', sql, '\nParams:', params);
                reject(err);
            } else {
                resolve(this); // 'this' contains lastID, changes
            }
        });
    });
}

// Wrap db.all in a Promise
function allAsync(sql, params = []) {
     return new Promise((resolve, reject) => {
         db.all(sql, params, (err, rows) => {
             if (err) {
                console.error('SQL Error:', err.message, '\nSQL:', sql, '\nParams:', params);
                 reject(err);
             } else {
                 resolve(rows);
             }
         });
     });
}

// --- Seeding Functions ---

async function seedUseCases() {
    console.log('\n--- Seeding Use Cases ---');
    const sql = `INSERT OR IGNORE INTO use_cases (name, slug) VALUES (?, ?)`;
    let addedCount = 0;
    let ignoredCount = 0;

    for (const uc of useCasesToAdd) {
        try {
            const result = await runAsync(sql, [uc.name, uc.slug]);
            if (result.changes > 0) {
                console.log(`Added use case: ${uc.name}`);
                addedCount++;
            } else {
                 ignoredCount++;
            }
        } catch (err) {
            console.error(`Failed to add use case "${uc.name}": ${err.message}`);
        }
    }
     console.log(`Use Cases: ${addedCount} added, ${ignoredCount} ignored (already existed).`);
}

async function seedBenchmarks() {
    console.log('\n--- Seeding Benchmarks ---');
    const sql = `INSERT OR IGNORE INTO benchmarks (name, short_name, description, source_url) VALUES (?, ?, ?, ?)`;
    let addedCount = 0;
    let ignoredCount = 0;

    for (const b of benchmarksToAdd) {
        try {
            const result = await runAsync(sql, [b.name, b.short_name, b.description, b.source_url]);
             if (result.changes > 0) {
                console.log(`Added benchmark: ${b.short_name}`);
                addedCount++;
            } else {
                 ignoredCount++;
            }
        } catch (err) {
            console.error(`Failed to add benchmark "${b.short_name}": ${err.message}`);
        }
    }
     console.log(`Benchmarks: ${addedCount} added, ${ignoredCount} ignored (already existed).`);
}

async function seedModels() {
    console.log('\n--- Seeding Models ---');
    const sql = `INSERT OR IGNORE INTO models
        (name, provider, huggingface_link, knowledge_cutoff, is_open_source, availability, formats, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`; // Update last_updated on insert/ignore
     // Alternative: Use INSERT OR REPLACE to always update existing models:
     // const sql = `INSERT OR REPLACE INTO models (name, provider, ...) VALUES (?, ?, ...)`

    let addedCount = 0;
    let ignoredCount = 0;

    for (const m of modelsToAdd) {
        try {
            const result = await runAsync(sql, [
                m.name, m.provider, m.huggingface_link, m.knowledge_cutoff,
                m.is_open_source, m.availability, m.formats
            ]);
             if (result.changes > 0) {
                 console.log(`Added model: ${m.name}`);
                 addedCount++;
             } else {
                 // Even if ignored, maybe we want to update some fields?
                 // If using INSERT OR REPLACE, this logic isn't needed.
                 // If using IGNORE, you might want a separate UPDATE statement here if needed.
                 ignoredCount++;
             }
        } catch (err) {
            console.error(`Failed to add model "${m.name}": ${err.message}`);
        }
    }
     console.log(`Models: ${addedCount} added, ${ignoredCount} ignored/updated (already existed).`);
}

async function seedBenchmarkScores() {
    console.log('\n--- Seeding Benchmark Scores ---');

    // 1. Get current Model IDs mapped by Name
    let modelMap = new Map();
    try {
        const models = await allAsync("SELECT id, name FROM models");
        models.forEach(m => modelMap.set(m.name, m.id));
        console.log(`Fetched ${modelMap.size} existing models.`);
    } catch (err) {
        console.error("Failed to fetch model IDs:", err.message);
        return; // Cannot proceed without model IDs
    }

    // 2. Get current Benchmark IDs mapped by Short Name
    let benchmarkMap = new Map();
     try {
        const benchmarks = await allAsync("SELECT id, short_name FROM benchmarks");
        benchmarks.forEach(b => benchmarkMap.set(b.short_name, b.id));
        console.log(`Fetched ${benchmarkMap.size} existing benchmarks.`);
    } catch (err) {
        console.error("Failed to fetch benchmark IDs:", err.message);
        return; // Cannot proceed without benchmark IDs
    }

    // 3. Insert or Replace scores
    const sql = `INSERT OR REPLACE INTO benchmark_scores
        (model_id, benchmark_id, score, score_link) VALUES (?, ?, ?, ?)`;
     // Using REPLACE ensures that if a score exists for this model/benchmark, it gets updated.

    let updatedCount = 0;
    let skippedCount = 0;

    for (const s of benchmarkScoresToAdd) {
        const modelId = modelMap.get(s.modelName);
        const benchmarkId = benchmarkMap.get(s.benchShortName);

        if (modelId && benchmarkId) {
            try {
                await runAsync(sql, [modelId, benchmarkId, s.score, s.score_link]);
                updatedCount++;
            } catch (err) {
                console.error(`Failed to add/update score for "${s.modelName}" / "${s.benchShortName}": ${err.message}`);
                skippedCount++;
            }
        } else {
            if (!modelId) console.warn(`Skipping score: Model "${s.modelName}" not found in database.`);
            if (!benchmarkId) console.warn(`Skipping score: Benchmark "${s.benchShortName}" not found in database.`);
            skippedCount++;
        }
    }
     console.log(`Benchmark Scores: ${updatedCount} added or updated, ${skippedCount} skipped (missing model/benchmark or error).`);
}

// --- Main Execution ---
async function runSeedingOperations() {
    try {
        // Run seeding functions in order (important for foreign keys)
        await seedUseCases();
        await seedBenchmarks();
        await seedModels();
        await seedBenchmarkScores();

        console.log('\n--- Seeding Finished ---');

    } catch (error) {
        console.error('\n--- Seeding Failed ---');
        console.error(error);
    } finally {
        // Close the database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

// --- Handle potential script errors ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Close DB connection if open, before exiting
  db.close();
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
   // Close DB connection if open, before exiting
  db.close();
  process.exit(1);
});