// database.js
const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = "tesslate.db";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');
        db.run("PRAGMA foreign_keys = ON;", (err) => { // Ensure Foreign Key constraints are enabled
             if(err) console.error("Could not enable foreign keys:", err);
        });
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Use Cases Table (No changes needed)
        db.run(`CREATE TABLE IF NOT EXISTS use_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE
        )`, (err) => { if (err) console.error("Error creating use_cases table:", err.message); });

        // Models Table (Removed fixed benchmarks, added formats, last_updated)
        db.run(`CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            provider TEXT,
            huggingface_link TEXT,
            knowledge_cutoff TEXT,
            is_open_source INTEGER DEFAULT 0, -- 0 for false, 1 for true
            availability TEXT, -- e.g., 'API', 'Download', 'API, Download'
            formats TEXT, -- Comma-separated e.g., "GGUF,AWQ,GPTQ"
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => { if (err) console.error("Error creating models table:", err.message); });

        // Benchmarks Table (New)
        db.run(`CREATE TABLE IF NOT EXISTS benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE, -- Full name e.g., "Massive Multitask Language Understanding Professional"
            short_name TEXT NOT NULL UNIQUE, -- For table header e.g., "MMLU Pro"
            description TEXT,
            source_url TEXT -- Link to benchmark paper/site
        )`, (err) => { if (err) console.error("Error creating benchmarks table:", err.message); });

        // Benchmark Scores Table (New - Junction table)
        db.run(`CREATE TABLE IF NOT EXISTS benchmark_scores (
            model_id INTEGER NOT NULL,
            benchmark_id INTEGER NOT NULL,
            score REAL,
            score_link TEXT, -- Optional: Link to specific result page/entry for this model+benchmark
            PRIMARY KEY (model_id, benchmark_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            FOREIGN KEY (benchmark_id) REFERENCES benchmarks(id) ON DELETE CASCADE
        )`, (err) => { if (err) console.error("Error creating benchmark_scores table:", err.message); });

        // Votes Table (No schema changes, but logic might adapt if timestamps were added later)
        db.run(`CREATE TABLE IF NOT EXISTS votes (
            model_id INTEGER NOT NULL,
            use_case_id INTEGER NOT NULL,
            upvotes INTEGER DEFAULT 0,
            downvotes INTEGER DEFAULT 0,
            PRIMARY KEY (model_id, use_case_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE
        )`, (err) => { if (err) console.error("Error creating votes table:", err.message); });

         // Suggestions Table (New)
         db.run(`CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('model', 'use_case')), -- Ensure valid type
            name TEXT,
            details TEXT,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))
         )`, (err) => {
            if (err) console.error("Error creating suggestions table:", err.message);
            else {
                // Seed initial data only after all tables might exist
                seedData();
            }
        });
    });
}

function seedData() {
    // --- Seed Use Cases (same as before) ---
    const useCases = [
        { name: 'RAG', slug: 'rag' },
        { name: 'Web Dev', slug: 'web-dev' },
        { name: 'General Coding', slug: 'general-coding' },
        { name: 'Reasoning', slug: 'reasoning' },
        { name: 'Knowledge Q&A', slug: 'knowledge-qa' }
    ];
    const useCaseStmt = db.prepare("INSERT OR IGNORE INTO use_cases (name, slug) VALUES (?, ?)");
    useCases.forEach(uc => useCaseStmt.run(uc.name, uc.slug));
    useCaseStmt.finalize(() => console.log("Use cases seeded."));

    // --- Seed Benchmarks ---
    const benchmarks = [
         { name: 'MMLU Pro', short_name: 'MMLU Pro', description: 'Expert-level multi-task accuracy benchmark', source_url: 'https://arxiv.org/abs/2406.01574' },
         { name: 'LiveCodeBench', short_name: 'LCB', description: 'Holistic and Contamination Free Evaluation of Large Language Models for Code', source_url: 'https://livecodebench.github.io/leaderboard.html' },
         { name: 'GPQA Diamond', short_name: 'GPQA', description: 'Graduate-Level Google-Proof Q&A Benchmark', source_url: 'https://github.com/idavidrein/gpqa' },
         { name: 'HumanEval+', short_name: 'HumanEval+', description: 'Code generation benchmark (extended)', source_url: 'https://github.com/evalplus/evalplus' },
         { name: 'LiveBench QA', short_name: 'LiveBench', description: 'Real-time, evolving question answering', source_url: 'https://github.com/livebench/livebench' },
         { name: 'Arena Elo', short_name: 'Arena Elo', description: 'Chatbot Arena Elo rating based on human preference', source_url: 'https://chat.lmsys.org/' }
    ];
    const benchmarkStmt = db.prepare("INSERT OR IGNORE INTO benchmarks (name, short_name, description, source_url) VALUES (?, ?, ?, ?)");
    benchmarks.forEach(b => benchmarkStmt.run(b.name, b.short_name, b.description, b.source_url));
    benchmarkStmt.finalize(() => console.log("Benchmarks seeded."));

    // --- Seed Models (adapt to new schema) ---
     const models = [
        // Add 'formats' where applicable
        { name: 'GPT-4 Turbo', provider: 'OpenAI', knowledge_cutoff: '2023-12', is_open_source: 0, availability: 'API', formats: null },
        { name: 'Claude 3 Opus', provider: 'Anthropic', knowledge_cutoff: '2023-08', is_open_source: 0, availability: 'API', formats: null },
        { name: 'Gemini 1.5 Pro', provider: 'Google', knowledge_cutoff: '2023-11', is_open_source: 0, availability: 'API', formats: null },
        { name: 'Llama 3 70B Instruct', provider: 'Meta', huggingface_link: 'https://huggingface.co/meta-llama/Meta-Llama-3-70B-Instruct', knowledge_cutoff: '2023-03', is_open_source: 1, availability: 'Download, API Providers', formats: "Original,GGUF,AWQ,GPTQ" },
        { name: 'Mixtral 8x7B Instruct', provider: 'Mistral AI', huggingface_link: 'https://huggingface.co/mistralai/Mixtral-8x7B-Instruct-v0.1', knowledge_cutoff: 'Early 2023', is_open_source: 1, availability: 'Download, API', formats: "Original,GGUF,AWQ" },
        { name: 'Command R+', provider: 'Cohere', knowledge_cutoff: '2023-08', is_open_source: 0, availability: 'API', formats: null },
        { name: 'DBRX Instruct', provider: 'Databricks', huggingface_link: 'https://huggingface.co/databricks/dbrx-instruct', knowledge_cutoff: '2023-12', is_open_source: 1, availability: 'Download', formats: "Original,GGUF" },
     ];
    const modelStmt = db.prepare(`INSERT OR IGNORE INTO models
            (name, provider, huggingface_link, knowledge_cutoff, is_open_source, availability, formats)
            VALUES (?, ?, ?, ?, ?, ?, ?)`);
    models.forEach(m => modelStmt.run(
        m.name, m.provider, m.huggingface_link, m.knowledge_cutoff, m.is_open_source, m.availability, m.formats
    ));
    modelStmt.finalize(() => console.log("Models seeded."));

    // --- Seed Benchmark Scores (after models and benchmarks exist) ---
    // Get IDs first to ensure correctness
    db.all("SELECT id, name FROM models", [], (err, modelRows) => {
        if (err) return console.error("Error fetching model IDs for seeding scores:", err);
        const modelMap = new Map(modelRows.map(m => [m.name, m.id]));

        db.all("SELECT id, short_name FROM benchmarks", [], (err, benchRows) => {
            if (err) return console.error("Error fetching benchmark IDs for seeding scores:", err);
            const benchMap = new Map(benchRows.map(b => [b.short_name, b.id]));

            const scores = [
                // GPT-4 Turbo
                { model: 'GPT-4 Turbo', bench: 'MMLU Pro', score: 86.9 }
            ];

            const scoreStmt = db.prepare("INSERT OR IGNORE INTO benchmark_scores (model_id, benchmark_id, score) VALUES (?, ?, ?)");
            scores.forEach(s => {
                const modelId = modelMap.get(s.model);
                const benchId = benchMap.get(s.bench);
                if (modelId && benchId) {
                    scoreStmt.run(modelId, benchId, s.score);
                } else {
                    console.warn(`Skipping score seed: Could not find ID for Model "${s.model}" or Benchmark "${s.bench}"`);
                }
            });
            scoreStmt.finalize(() => console.log("Benchmark scores seeded."));

            // --- Initialize Zero Votes (same as before, ensures votes row exists) ---
            db.run(`
                INSERT OR IGNORE INTO votes (model_id, use_case_id, upvotes, downvotes)
                SELECT m.id, uc.id, 0, 0
                FROM models m, use_cases uc
                LEFT JOIN votes v ON v.model_id = m.id AND v.use_case_id = uc.id
                WHERE v.model_id IS NULL
            `, (err) => {
                if (err) console.error("Error initializing zero votes:", err.message);
                else console.log("Zero votes initialized where missing.");
            });
        }); // end fetch benchmarks
    }); // end fetch models
} // end seedData

module.exports = db;