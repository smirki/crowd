// server.js
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const db = require('./database.js');
const path = require('path'); // Needed for sendFile

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Session Middleware
app.use(session({
    secret: 'tesslate-super-secret-key-CHANGE-ME', // Change this!
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set true if using HTTPS
        httpOnly: true, // Protect against XSS
        maxAge: 24 * 60 * 60 * 1000 // Example: 1 day session persistence
     }
}));

// Initialize session votes if not present
app.use((req, res, next) => {
    if (!req.session.votes) {
        req.session.votes = {}; // { 'use_case_slug': { 'model_id': 'up'/'down'/null } }
    }
    next();
});

// --- Helper Functions ---
function sanitizeInput(input) {
    // Basic sanitization: Remove potential script tags or harmful characters.
    // For production, consider a dedicated library like DOMPurify (if dealing with HTML) or express-validator.
    if (typeof input !== 'string') return input;
    return input.replace(/<script.*?>.*?<\/script>/gi, '') // Remove script tags
                .replace(/</g, "<") // Convert < to HTML entity
                .replace(/>/g, ">"); // Convert > to HTML entity
}


// --- API Routes ---

// GET Use Cases (Unchanged)
app.get('/api/usecases', (req, res) => {
    db.all("SELECT id, name, slug FROM use_cases ORDER BY name ASC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// GET Available Benchmarks
app.get('/api/benchmarks', (req, res) => {
    db.all("SELECT id, name, short_name, description, source_url FROM benchmarks ORDER BY short_name ASC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});


// GET Models (with Pagination, Dynamic Benchmarks)
app.get('/api/models', async (req, res) => {
    try {
        const useCaseSlug = req.query.use_case_slug;
        const searchTerm = req.query.search || '';
        const sortBy = req.query.sort_by || 'score_diff'; // Default sort: vote difference
        const sortOrder = (req.query.sort_order || 'desc').toUpperCase(); // Default order: desc
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '15', 10); // Items per page

        if (!useCaseSlug) {
            return res.status(400).json({ "error": "use_case_slug parameter is required" });
        }
        if (isNaN(page) || page < 1) {
             return res.status(400).json({ error: 'Invalid page number' });
        }
         if (isNaN(limit) || limit < 1 || limit > 100) { // Limit max items per page
             return res.status(400).json({ error: 'Invalid limit value (1-100)' });
        }

        const offset = (page - 1) * limit;

        // 1. Find Use Case ID
        const useCaseRow = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM use_cases WHERE slug = ?", [useCaseSlug], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        if (!useCaseRow) {
            return res.status(404).json({ "error": "Use case not found" });
        }
        const useCaseId = useCaseRow.id;

        // 2. Validate Sort Column
        // Core fields + vote score diff. Sorting by dynamic benchmarks needs more complex logic.
        const allowedSortColumns = ['name', 'provider', 'knowledge_cutoff', 'is_open_source', 'availability', 'score_diff', 'last_updated'];
        const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'score_diff'; // Default
        const safeSortOrder = (sortOrder === 'ASC') ? 'ASC' : 'DESC'; // Default desc

        let orderByClause = '';
         if (safeSortBy === 'score_diff') {
             // Sort by (Upvotes - Downvotes). Handle potential NULLs from LEFT JOIN.
             orderByClause = `ORDER BY (COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0)) ${safeSortOrder}, m.name ASC`; // Secondary sort by name
         } else if (['is_open_source', 'last_updated'].includes(safeSortBy)) {
             orderByClause = `ORDER BY m.${safeSortBy} ${safeSortOrder}, m.name ASC`;
         } else { // Text fields - case-insensitive sort often preferred
             orderByClause = `ORDER BY LOWER(m.${safeSortBy}) ${safeSortOrder}, m.name ASC`;
         }


        // 3. Build Base Query Parts
        const selectFields = `
            m.id, m.name, m.provider, m.huggingface_link,
            m.knowledge_cutoff, m.is_open_source, m.availability, m.formats,
            strftime('%Y-%m-%d', m.last_updated) as last_updated, -- Format date
            COALESCE(v.upvotes, 0) as upvotes,
            COALESCE(v.downvotes, 0) as downvotes
        `;
        const fromJoinClause = `
            FROM models m
            LEFT JOIN votes v ON m.id = v.model_id AND v.use_case_id = ?
        `;
        const whereClause = `WHERE (m.name LIKE ? OR m.provider LIKE ? OR m.formats LIKE ?)`;
        const params = [useCaseId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]; // Add formats to search

        // 4. Get Total Count for Pagination (matching the filter)
        const countSql = `SELECT COUNT(m.id) as total FROM models m ${whereClause}`;
        const countParams = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]; // Search params only for count
        const totalResult = await new Promise((resolve, reject) => {
             db.get(countSql, countParams, (err, row) => {
                 if (err) reject(err); else resolve(row);
             });
        });
        const totalItems = totalResult ? totalResult.total : 0;

        // 5. Get Paginated Model Data
        const modelsSql = `
            SELECT ${selectFields}
            ${fromJoinClause}
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;
        const modelsParams = [...params, limit, offset];
         const modelsRows = await new Promise((resolve, reject) => {
             db.all(modelsSql, modelsParams, (err, rows) => {
                 if (err) reject(err); else resolve(rows);
             });
         });

        // 6. Fetch Benchmark Scores for the retrieved models
        const modelIds = modelsRows.map(m => m.id);
        let benchmarkScores = {}; // { modelId: [{ benchmark_short_name: 'MMLU Pro', score: 86.5, ... }, ...], ... }

        if (modelIds.length > 0) {
             const scoresSql = `
                 SELECT
                     bs.model_id, bs.score, bs.score_link,
                     b.id as benchmark_id, b.short_name as benchmark_short_name, b.name as benchmark_name, b.source_url as benchmark_source_url
                 FROM benchmark_scores bs
                 JOIN benchmarks b ON bs.benchmark_id = b.id
                 WHERE bs.model_id IN (${modelIds.map(() => '?').join(',')})
                 ORDER BY bs.model_id, b.short_name
             `;
             const scoreRows = await new Promise((resolve, reject) => {
                 db.all(scoresSql, modelIds, (err, rows) => {
                     if (err) reject(err); else resolve(rows);
                 });
             });

             // Group scores by model_id
             scoreRows.forEach(row => {
                 if (!benchmarkScores[row.model_id]) {
                     benchmarkScores[row.model_id] = [];
                 }
                 benchmarkScores[row.model_id].push({
                     benchmark_id: row.benchmark_id,
                     benchmark_short_name: row.benchmark_short_name,
                     benchmark_name: row.benchmark_name,
                     benchmark_source_url: row.benchmark_source_url,
                     score: row.score,
                     score_link: row.score_link
                 });
             });
        }

        // 7. Combine data and add session vote status
        const modelsWithDetails = modelsRows.map(model => ({
            ...model,
            scores: benchmarkScores[model.id] || [], // Attach scores array
            userVote: req.session.votes[useCaseSlug]?.[model.id] || null
        }));

        // 8. Send Response
        res.json({
            models: modelsWithDetails,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems: totalItems,
            limit: limit
        });

    } catch (error) {
        console.error("Error fetching models:", error);
        res.status(500).json({ "error": "Failed to retrieve models: " + error.message });
    }
});


// POST Vote (Logic remains the same, session-based)
app.post('/api/vote/:model_id/:use_case_slug/:direction', (req, res) => {
    const { model_id, use_case_slug, direction } = req.params;
    const modelId = parseInt(model_id, 10);

    if (!['up', 'down'].includes(direction)) {
        return res.status(400).json({ error: 'Invalid vote direction' });
    }
    if (isNaN(modelId)) {
         return res.status(400).json({ error: 'Invalid model ID' });
    }

    // Find use_case_id (using async/await style for consistency)
    db.get("SELECT id FROM use_cases WHERE slug = ?", [use_case_slug], (err, useCaseRow) => {
         if (err) return res.status(500).json({ "error": err.message });
         if (!useCaseRow) return res.status(404).json({ "error": "Use case not found" });
         const useCaseId = useCaseRow.id;

         // Check if model exists
         db.get("SELECT id FROM models WHERE id = ?", [modelId], (err, modelRow) => {
            if(err) return res.status(500).json({ error: err.message });
            if(!modelRow) return res.status(404).json({ error: "Model not found" });

            // Initialize session structure if needed
            if (!req.session.votes[use_case_slug]) {
                req.session.votes[use_case_slug] = {};
            }

            const previousVote = req.session.votes[use_case_slug][modelId];
            let voteChangeSql = '';
            let undoChangeSql = '';
            let newVoteStatus = direction;

            if (previousVote === direction) { // Undo vote
                voteChangeSql = direction === 'up' ? 'upvotes = MAX(0, upvotes - 1)' : 'downvotes = MAX(0, downvotes - 1)';
                newVoteStatus = null;
            } else { // New vote or changing vote
                voteChangeSql = direction === 'up' ? 'upvotes = upvotes + 1' : 'downvotes = downvotes + 1';
                if (previousVote === 'up') undoChangeSql = 'upvotes = MAX(0, upvotes - 1)';
                else if (previousVote === 'down') undoChangeSql = 'downvotes = MAX(0, downvotes - 1)';
            }

            // Ensure the vote row exists
            db.run(`INSERT OR IGNORE INTO votes (model_id, use_case_id, upvotes, downvotes) VALUES (?, ?, 0, 0)`, [modelId, useCaseId], (err) => {
                if (err) return res.status(500).json({ "error": "Failed to ensure vote row: "+ err.message });

                // Transaction for atomic updates
                db.serialize(() => {
                    db.run("BEGIN TRANSACTION");
                    let operations = [];
                    if (undoChangeSql) {
                        operations.push(new Promise((resolve, reject) => {
                            db.run(`UPDATE votes SET ${undoChangeSql} WHERE model_id = ? AND use_case_id = ?`, [modelId, useCaseId], function(err) { if (err) reject(err); else resolve(); });
                        }));
                    }
                    operations.push(new Promise((resolve, reject) => {
                        db.run(`UPDATE votes SET ${voteChangeSql} WHERE model_id = ? AND use_case_id = ?`, [modelId, useCaseId], function(err) { if (err) reject(err); else resolve(); });
                    }));

                    Promise.all(operations)
                        .then(() => {
                            db.run("COMMIT", (commitErr) => {
                                if (commitErr) {
                                    console.error("Commit Error:", commitErr.message);
                                    db.run("ROLLBACK"); // Attempt rollback
                                    return res.status(500).json({ error: "Failed to commit vote transaction." });
                                }

                                // Update session *after* successful DB commit
                                req.session.votes[use_case_slug][modelId] = newVoteStatus;
                                req.session.save((saveErr) => { // Ensure session is saved before responding
                                     if(saveErr) {
                                         console.error("Session save error:", saveErr);
                                         // Proceed to send response anyway, but log the error
                                     }
                                    // Fetch updated counts to send back
                                    db.get("SELECT upvotes, downvotes FROM votes WHERE model_id = ? AND use_case_id = ?", [modelId, useCaseId], (err, finalCounts) => {
                                        if(err) return res.status(500).json({ error: "Failed to fetch final counts." });
                                        res.json({
                                            success: true,
                                            modelId: modelId,
                                            useCase: use_case_slug,
                                            newVoteStatus: newVoteStatus,
                                            upvotes: finalCounts?.upvotes ?? 0,
                                            downvotes: finalCounts?.downvotes ?? 0
                                        });
                                    });
                                });
                            });
                        })
                        .catch(opErr => {
                            console.error("Vote update error during transaction:", opErr.message);
                            db.run("ROLLBACK");
                            res.status(500).json({ error: "Failed to update vote counts." });
                        });
                }); // end serialize
            }); // end ensure row exists
         }); // end check model exists
    }); // end find use case
});

// POST Suggestion
app.post('/api/suggestions', (req, res) => {
    const { type, name, details } = req.body;

    // Validation
    if (!type || !['model', 'use_case'].includes(type)) {
        return res.status(400).json({ error: 'Invalid suggestion type.' });
    }
    if (type === 'model' && (!name || name.trim().length === 0)) {
        return res.status(400).json({ error: 'Model name is required for model suggestions.' });
    }
     if (type === 'use_case' && (!name || name.trim().length === 0)) {
        return res.status(400).json({ error: 'Use case name is required for use case suggestions.' });
    }
    if (!details || details.trim().length === 0) {
        return res.status(400).json({ error: 'Details/justification are required.' });
    }

    // Sanitize inputs (basic example)
    const sanitizedType = type; // Already validated against specific values
    const sanitizedName = sanitizeInput(name.trim());
    const sanitizedDetails = sanitizeInput(details.trim());

     // Limit input length
    if (sanitizedName.length > 150) return res.status(400).json({ error: 'Suggested name is too long (max 150 chars).' });
    if (sanitizedDetails.length > 1000) return res.status(400).json({ error: 'Details are too long (max 1000 chars).' });


    const sql = `INSERT INTO suggestions (type, name, details) VALUES (?, ?, ?)`;
    const params = [sanitizedType, sanitizedName, sanitizedDetails];

    db.run(sql, params, function(err) { // Use function() to get this.lastID
        if (err) {
            console.error("Error saving suggestion:", err.message);
            return res.status(500).json({ error: "Failed to save suggestion." });
        }
        res.status(201).json({ success: true, message: "Suggestion submitted successfully!", id: this.lastID });
    });
});


// --- Root Route ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Catch-all for SPA routing (if needed later) ---
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});