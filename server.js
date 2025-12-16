const express = require('express');
const app = express();
const db = require('./db/database');
const path = require('path');

const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// API Endpoints

// 1. Get all movies
app.get('/api/movies', (req, res) => {
    db.all("SELECT * FROM movies", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Get showtimes for a movie
app.get('/api/movies/:id/showtimes', (req, res) => {
    const movieId = req.params.id;
    db.get("SELECT * FROM movies WHERE id = ?", [movieId], (err, movie) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!movie) return res.status(404).json({ error: "Movie not found" });

        db.all("SELECT * FROM showtimes WHERE movie_id = ?", [movieId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ movie, showtimes: rows });
        });
    });
});

// 3. Get seats for a showtime
app.get('/api/showtimes/:id/seats', (req, res) => {
    const showtimeId = req.params.id;
    const ROWS = 8;
    const COLS = 10;
    const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    db.get("SELECT * FROM showtimes WHERE id = ?", [showtimeId], (err, showtime) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!showtime) return res.status(404).json({ error: "Showtime not found" });

        db.all("SELECT seats FROM bookings WHERE showtime_id = ?", [showtimeId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const reservedSeats = [];
            rows.forEach(row => {
                if (row.seats) {
                    reservedSeats.push(...row.seats.split(','));
                }
            });

            res.json({
                showtime,
                layout: { rows: ROWS, cols: COLS, rowLabels: ROW_LABELS },
                reservedSeats
            });
        });
    });
});

// 4. Create a booking
app.post('/api/bookings', (req, res) => {
    const { movie_id, showtime_id, customer_name, customer_email, seats } = req.body;

    if (!movie_id || !showtime_id || !customer_name || !customer_email || !seats || seats.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if seats are already reserved
    db.all("SELECT seats FROM bookings WHERE showtime_id = ?", [showtime_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const allReserved = new Set();
        rows.forEach(row => {
            if (row.seats) {
                row.seats.split(',').forEach(s => allReserved.add(s));
            }
        });

        // Check availability
        const requestedSeats = Array.isArray(seats) ? seats : seats.split(',');
        const conflict = requestedSeats.some(s => allReserved.has(s));

        if (conflict) {
            return res.status(400).json({ error: "One or more seats are already booked." });
        }

        const seatsString = requestedSeats.join(',');
        const created_at = new Date().toISOString();

        const stmt = db.prepare("INSERT INTO bookings (movie_id, showtime_id, customer_name, customer_email, seats, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run(movie_id, showtime_id, customer_name, customer_email, seatsString, created_at, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({
                message: "Booking confirmed",
                booking_id: this.lastID,
                booking: { movie_id, showtime_id, customer_name, customer_email, seats: requestedSeats }
            });
        });
        stmt.finalize();
    });
});

// 5. Get bookings (all or by email)
app.get('/api/bookings', (req, res) => {
    const { email } = req.query;
    let query = `
        SELECT bookings.*, movies.title as movie_title, showtimes.showtime_datetime 
        FROM bookings 
        JOIN movies ON bookings.movie_id = movies.id 
        JOIN showtimes ON bookings.showtime_id = showtimes.id
    `;
    const params = [];

    if (email) {
        query += ` WHERE bookings.customer_email = ?`;
        params.push(email);
    }

    query += ` ORDER BY bookings.id DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 6. Delete a booking (Cancel ticket)
app.delete('/api/bookings/:id', (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM bookings WHERE id = ?");
    stmt.run(id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Booking not found" });
        res.json({ message: "Booking cancelled successfully" });
    });
    stmt.finalize();
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
