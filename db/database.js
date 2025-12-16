const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Connected to SQLite database at', dbPath);

const SAMPLE_MOVIES = [
    { title: "Inception", description: "A thief who steals corporate secrets through the use of dream-sharing technology.", duration: 148, genre: "Sci-Fi", poster_url: "https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg" },
    { title: "The Dark Knight", description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham.", duration: 152, genre: "Action", poster_url: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg" },
    { title: "Interstellar", description: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.", duration: 169, genre: "Sci-Fi", poster_url: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" },
    { title: "Parasite", description: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.", duration: 132, genre: "Thriller", poster_url: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg" },
    { title: "Avengers: Endgame", description: "The Avengers assemble once more to reverse Thanos' actions and restore balance to the universe.", duration: 181, genre: "Action", poster_url: "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg" },
    { title: "La La Land", description: "A jazz pianist and an aspiring actress fall in love while pursuing their dreams in Los Angeles.", duration: 128, genre: "Drama", poster_url: "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg" },
    { title: "Joker", description: "Arthur Fleck, a party clown, leads an impoverished life with his ailing mother.", duration: 122, genre: "Thriller", poster_url: "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg" },
    { title: "Spider-Man: Into the Spider-Verse", description: "Teen Miles Morales becomes Spider-Man and joins counterparts from other dimensions to save the multiverse.", duration: 117, genre: "Action", poster_url: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg" },
    { title: "Dune: Part Two", description: "Paul Atreides unites with the Fremen to wage war and exact revenge against House Harkonnen.", duration: 166, genre: "Sci-Fi", poster_url: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg" },
    { title: "Mad Max: Fury Road", description: "In a post-apocalyptic wasteland, Max teams up with Furiosa to flee a tyrant and his army.", duration: 120, genre: "Action", poster_url: "https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg" }
];

db.serialize(() => {
    // Movies Table
    db.run(`CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        duration_minutes INTEGER,
        genre TEXT,
        poster_url TEXT
    )`);

    // Showtimes Table
    db.run(`CREATE TABLE IF NOT EXISTS showtimes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER,
        showtime_datetime TEXT,
        FOREIGN KEY(movie_id) REFERENCES movies(id)
    )`);

    // Bookings Table
    db.run(`CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER,
        showtime_id INTEGER,
        customer_name TEXT,
        customer_email TEXT,
        seats TEXT,
        created_at TEXT,
        FOREIGN KEY(movie_id) REFERENCES movies(id),
        FOREIGN KEY(showtime_id) REFERENCES showtimes(id)
    )`);

    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_title ON movies(title)");

});

function seedMovies() {
    const insertStmt = db.prepare("INSERT OR IGNORE INTO movies (title, description, duration_minutes, genre, poster_url) VALUES (?, ?, ?, ?, ?)");
    const updateStmt = db.prepare("UPDATE movies SET description = ?, duration_minutes = ?, genre = ?, poster_url = ? WHERE title = ?");

    SAMPLE_MOVIES.forEach(movie => {
        insertStmt.run(movie.title, movie.description, movie.duration, movie.genre, movie.poster_url);
        updateStmt.run(movie.description, movie.duration, movie.genre, movie.poster_url, movie.title);
    });

    insertStmt.finalize(() => {
        updateStmt.finalize(() => {
            console.log("Sample movies ensured.");
            seedShowtimes();
        });
    });
}

function cleanupRemovedMovies(titles, done) {
    if (!titles || titles.length === 0) return done();
    let remaining = titles.length;

    titles.forEach(title => {
        db.get("SELECT id FROM movies WHERE title = ?", [title], (err, row) => {
            if (err) {
                console.error(err);
                return checkDone();
            }
            if (!row) return checkDone();

            const movieId = row.id;
            db.run("DELETE FROM bookings WHERE movie_id = ?", [movieId], err1 => {
                if (err1) console.error(err1);
                db.run("DELETE FROM showtimes WHERE movie_id = ?", [movieId], err2 => {
                    if (err2) console.error(err2);
                    db.run("DELETE FROM movies WHERE id = ?", [movieId], err3 => {
                        if (err3) console.error(err3);
                        checkDone();
                    });
                });
            });
        });
    });

    function checkDone() {
        remaining -= 1;
        if (remaining === 0) done();
    }
}

function seedShowtimes() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    db.all(`
        SELECT movies.id FROM movies
        LEFT JOIN showtimes ON showtimes.movie_id = movies.id
        GROUP BY movies.id
        HAVING COUNT(showtimes.id) = 0
    `, (err, rows) => {
        if (err) return console.error(err);
        if (rows.length === 0) {
            console.log("Showtimes already seeded.");
            return;
        }

        const stmt = db.prepare("INSERT INTO showtimes (movie_id, showtime_datetime) VALUES (?, ?)");
        rows.forEach(movie => {
            stmt.run(movie.id, `${today} 18:00`);
            stmt.run(movie.id, `${today} 21:00`);
            stmt.run(movie.id, `${tomorrow} 19:00`);
        });
        stmt.finalize(() => console.log("Showtimes seeded for new movies."));
    });
}

module.exports = db;
