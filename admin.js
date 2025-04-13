// admin.js
require('dotenv').config(); // Load .env file variables
const express = require('express');
const path = require('path');
const basicAuth = require('basic-auth');
const db = require('./database.js'); // Reuse your existing database connection

const app = express();
const PORT = process.env.ADMIN_PORT || 3060;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USER || !ADMIN_PASSWORD) {
    console.error("ERROR: ADMIN_USER and ADMIN_PASSWORD must be set in the .env file.");
    process.exit(1);
}

// --- Middleware ---
app.set('view engine', 'ejs'); // Set EJS as the templating engine
app.set('views', path.join(__dirname, 'views')); // Set the directory for EJS templates
app.use('/admin_static', express.static(path.join(__dirname, 'public_admin'))); // Serve admin-specific static files
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies (form submissions)
app.use(express.json()); // Parse JSON bodies (less likely needed here, but good practice)


// --- Authentication Middleware ---
const authMiddleware = (req, res, next) => {
    const user = basicAuth(req);

    if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASSWORD) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required.');
    }
    // Store current path for navigation highlighting
    res.locals.currentPath = req.path;
    next();
};

// Apply authentication to all /admin routes
app.use('/admin', authMiddleware);

// --- Helper Functions for DB (Promisified) ---
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err); else resolve(this);
        });
    });
}
function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}
function allAsync(sql, params = []) {
     return new Promise((resolve, reject) => {
         db.all(sql, params, (err, rows) => {
             if (err) reject(err); else resolve(rows);
         });
     });
}

// --- Admin Routes ---

// Dashboard
app.get('/admin', (req, res) => {
    res.render('admin_dashboard', { title: 'Dashboard' });
});

// Download Database
app.get('/admin/download-db', (req, res, next) => {
    const dbPath = path.join(__dirname, 'tesslate.db');
    // Set headers to prompt download
    res.setHeader('Content-Disposition', 'attachment; filename=tesslate.db');
    res.setHeader('Content-Type', 'application/vnd.sqlite3'); // Correct MIME type
    res.download(dbPath, 'tesslate.db', (err) => {
        if (err) {
            console.error("Error downloading database file:", err);
            // Pass error to error handler middleware
            next(err);
        } else {
            console.log('Database file downloaded successfully.');
        }
    });
});

// --- Models CRUD ---
app.get('/admin/models', async (req, res, next) => {
    try {
        const models = await allAsync('SELECT id, name, provider, is_open_source, formats, last_updated FROM models ORDER BY last_updated DESC');
        res.render('models', {
            title: 'Models',
            models: models,
            success_msg: req.query.success, // Pass success/error messages from redirects
            error_msg: req.query.error
         });
    } catch (err) {
        next(err); // Pass error to the error handler
    }
});

app.get('/admin/models/new', (req, res) => {
    res.render('edit_model', { title: 'Add Model', model: null, allBenchmarks: [] }); // Pass empty model and benchmarks for the 'add' case
});

app.post('/admin/models', async (req, res, next) => {
    const { name, provider, huggingface_link, knowledge_cutoff, availability, formats } = req.body;
    const is_open_source = req.body.is_open_source ? 1 : 0; // Handle checkbox value

    if (!name) {
        return res.status(400).render('edit_model', { title: 'Add Model', model: req.body, allBenchmarks: [], error_msg: 'Model name is required.' });
    }

    const sql = `INSERT INTO models (name, provider, huggingface_link, knowledge_cutoff, is_open_source, availability, formats)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    try {
        await runAsync(sql, [name, provider, huggingface_link, knowledge_cutoff, is_open_source, availability, formats]);
        res.redirect('/admin/models?success=Model+added+successfully');
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
             res.status(400).render('edit_model', { title: 'Add Model', model: req.body, allBenchmarks: [], error_msg: `Model name "${name}" already exists.` });
        } else {
             next(err);
        }
    }
});

app.get('/admin/models/:id/edit', async (req, res, next) => {
    const modelId = req.params.id;
    try {
        const model = await getAsync('SELECT * FROM models WHERE id = ?', [modelId]);
        if (!model) {
            return res.status(404).render('error', { message: 'Model not found.', error: null });
        }
        const existingScores = await allAsync('SELECT * FROM benchmark_scores WHERE model_id = ?', [modelId]);
        const allBenchmarks = await allAsync('SELECT id, short_name FROM benchmarks ORDER BY short_name');

        model.scores = existingScores; // Attach scores to model object

        res.render('edit_model', { title: 'Edit Model', model, allBenchmarks });
    } catch (err) {
        next(err);
    }
});

app.post('/admin/models/:id/edit', async (req, res, next) => {
    const modelId = req.params.id;
    const { name, provider, huggingface_link, knowledge_cutoff, availability, formats } = req.body;
    const is_open_source = req.body.is_open_source ? 1 : 0;
    const scoresData = req.body.scores || {}; // Structure: { benchmark_id: { score: '...', score_link: '...' } }

     if (!name) {
         // Re-fetch needed data for rendering the form with error
         try {
             const model = await getAsync('SELECT * FROM models WHERE id = ?', [modelId]);
             model.scores = await allAsync('SELECT * FROM benchmark_scores WHERE model_id = ?', [modelId]);
             const allBenchmarks = await allAsync('SELECT id, short_name FROM benchmarks ORDER BY short_name');
             return res.status(400).render('edit_model', { title: 'Edit Model', model: { ...model, ...req.body, is_open_source }, allBenchmarks, error_msg: 'Model name is required.' });
         } catch(fetchErr) { return next(fetchErr); }
    }


    const updateModelSql = `UPDATE models SET
        name = ?, provider = ?, huggingface_link = ?, knowledge_cutoff = ?,
        is_open_source = ?, availability = ?, formats = ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?`;

    // Use a transaction to update model and scores atomically
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        let transactionError = null;

        // 1. Update Model Info
        db.run(updateModelSql, [name, provider, huggingface_link, knowledge_cutoff, is_open_source, availability, formats, modelId], (err) => {
            if (err) { transactionError = err; return; }

            // 2. Process Benchmark Scores
            const scorePromises = Object.entries(scoresData).map(([benchmarkId, data]) => {
                return new Promise((resolve, reject) => {
                    const score = data.score ? parseFloat(data.score) : null;
                    const scoreLink = data.score_link || null;

                    if (score !== null && !isNaN(score)) {
                        // Insert or Replace Score if value exists
                        const scoreSql = `INSERT OR REPLACE INTO benchmark_scores (model_id, benchmark_id, score, score_link) VALUES (?, ?, ?, ?)`;
                        db.run(scoreSql, [modelId, benchmarkId, score, scoreLink], (err) => {
                            if (err) reject(err); else resolve();
                        });
                    } else {
                        // Delete Score if value is empty/invalid
                        const deleteSql = `DELETE FROM benchmark_scores WHERE model_id = ? AND benchmark_id = ?`;
                         db.run(deleteSql, [modelId, benchmarkId], (err) => {
                             if (err) reject(err); else resolve();
                         });
                    }
                });
            });

            // Wait for all score operations to attempt completion
            Promise.all(scorePromises)
                .then(() => {
                    // 3. Commit or Rollback Transaction
                    if (transactionError) {
                        db.run('ROLLBACK');
                        if (transactionError.message.includes('UNIQUE constraint failed')) {
                             res.status(400).render('edit_model', { title: 'Edit Model', model: { id: modelId, ...req.body, is_open_source }, allBenchmarks: [], error_msg: `Model name "${name}" already exists.` }); // Need to refetch benchmarks ideally
                        } else {
                            next(transactionError); // Pass other errors to handler
                        }
                    } else {
                        db.run('COMMIT');
                        res.redirect('/admin/models?success=Model+updated+successfully');
                    }
                })
                .catch(scoreErr => {
                    db.run('ROLLBACK');
                    console.error("Error processing scores:", scoreErr);
                    next(new Error("Failed to update benchmark scores.")); // Pass specific score error
                });
        }); // End update model run
    }); // End serialize
});

app.post('/admin/models/:id/delete', async (req, res, next) => {
    const modelId = req.params.id;
    // Foreign key constraints with ON DELETE CASCADE should handle associated scores/votes
    const sql = 'DELETE FROM models WHERE id = ?';
    try {
        const result = await runAsync(sql, [modelId]);
        if (result.changes === 0) {
             res.redirect('/admin/models?error=Model+not+found+or+already+deleted');
        } else {
            res.redirect('/admin/models?success=Model+deleted+successfully');
        }
    } catch (err) {
        next(err);
    }
});

// --- Use Cases CRUD (Simplified Example - Adapt from Models) ---
app.get('/admin/usecases', async (req, res, next) => {
     try {
        const items = await allAsync('SELECT * FROM use_cases ORDER BY name');
        res.render('usecases', { title: 'Use Cases', items, success_msg: req.query.success, error_msg: req.query.error });
     } catch(err) { next(err); }
});
app.get('/admin/usecases/new', (req, res) => res.render('edit_usecase', { title: 'Add Use Case', item: null }));
app.post('/admin/usecases', async (req, res, next) => {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).render('edit_usecase', { title: 'Add Use Case', item: req.body, error_msg: 'Name and Slug are required.' });
    try {
        await runAsync('INSERT INTO use_cases (name, slug) VALUES (?, ?)', [name, slug]);
        res.redirect('/admin/usecases?success=Use+Case+added');
    } catch(err) { next(err); }
});
app.get('/admin/usecases/:id/edit', async (req, res, next) => {
    try {
        const item = await getAsync('SELECT * FROM use_cases WHERE id = ?', [req.params.id]);
        if (!item) return res.status(404).render('error', { message: 'Use Case not found.'});
        res.render('edit_usecase', { title: 'Edit Use Case', item });
    } catch(err) { next(err); }
});
app.post('/admin/usecases/:id/edit', async (req, res, next) => {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).render('edit_usecase', { title: 'Edit Use Case', item: {id: req.params.id, ...req.body}, error_msg: 'Name and Slug are required.' });
    try {
        await runAsync('UPDATE use_cases SET name = ?, slug = ? WHERE id = ?', [name, slug, req.params.id]);
        res.redirect('/admin/usecases?success=Use+Case+updated');
    } catch(err) { next(err); }
});
app.post('/admin/usecases/:id/delete', async (req, res, next) => {
     try {
        await runAsync('DELETE FROM use_cases WHERE id = ?', [req.params.id]);
        res.redirect('/admin/usecases?success=Use+Case+deleted');
     } catch(err) { next(err); }
});

// --- Benchmarks CRUD (Simplified Example - Adapt from Models) ---
app.get('/admin/benchmarks', async (req, res, next) => {
     try {
        const items = await allAsync('SELECT * FROM benchmarks ORDER BY name');
        res.render('benchmarks', { title: 'Benchmarks', items, success_msg: req.query.success, error_msg: req.query.error });
     } catch(err) { next(err); }
});
app.get('/admin/benchmarks/new', (req, res) => res.render('edit_benchmark', { title: 'Add Benchmark', item: null }));
app.post('/admin/benchmarks', async (req, res, next) => {
    const { name, short_name, description, source_url } = req.body;
     if (!name || !short_name) return res.status(400).render('edit_benchmark', { title: 'Add Benchmark', item: req.body, error_msg: 'Name and Short Name are required.' });
     try {
         await runAsync('INSERT INTO benchmarks (name, short_name, description, source_url) VALUES (?, ?, ?, ?)', [name, short_name, description, source_url]);
         res.redirect('/admin/benchmarks?success=Benchmark+added');
     } catch(err) { next(err); }
});
app.get('/admin/benchmarks/:id/edit', async (req, res, next) => {
    try {
        const item = await getAsync('SELECT * FROM benchmarks WHERE id = ?', [req.params.id]);
        if (!item) return res.status(404).render('error', { message: 'Benchmark not found.'});
        res.render('edit_benchmark', { title: 'Edit Benchmark', item });
    } catch(err) { next(err); }
});
app.post('/admin/benchmarks/:id/edit', async (req, res, next) => {
    const { name, short_name, description, source_url } = req.body;
    if (!name || !short_name) return res.status(400).render('edit_benchmark', { title: 'Edit Benchmark', item: {id: req.params.id, ...req.body}, error_msg: 'Name and Short Name are required.' });
    try {
        await runAsync('UPDATE benchmarks SET name = ?, short_name = ?, description = ?, source_url = ? WHERE id = ?', [name, short_name, description, source_url, req.params.id]);
        res.redirect('/admin/benchmarks?success=Benchmark+updated');
    } catch(err) { next(err); }
});
app.post('/admin/benchmarks/:id/delete', async (req, res, next) => {
     try {
         await runAsync('DELETE FROM benchmarks WHERE id = ?', [req.params.id]);
         res.redirect('/admin/benchmarks?success=Benchmark+deleted');
     } catch(err) { next(err); }
});


// --- Suggestions ---
app.get('/admin/suggestions', async (req, res, next) => {
    try {
        const suggestions = await allAsync('SELECT * FROM suggestions ORDER BY submitted_at DESC');
        res.render('suggestions', { title: 'Suggestions', suggestions });
    } catch (err) {
        next(err);
    }
});
// Add POST routes here later to update suggestion status (e.g., /admin/suggestions/:id/approve)

// --- Error Handling Middleware ---
// Basic error handler - logs error and shows a generic error page
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    // Avoid leaking stack trace in production ideally
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500);
    res.render('error', {
        message: err.message || 'Something went wrong on the server.',
        error: isDev ? err : {} // Only show stack in development
    });
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Admin server running on http://localhost:${PORT}/admin`);
    console.log(`Use user "${ADMIN_USER}" and the password from your .env file to log in.`);
});