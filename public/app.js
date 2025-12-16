const app = {
    state: {
        currentMovie: null,
        currentShowtime: null,
        selectedSeats: new Set(),
        reservedSeats: new Set(),
        seatLayout: null,
        movies: []
    },

    init: () => {
        app.showMovieList();
    },

    // --- Navigation ---
    hideAllViews: () => {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
    },

    // --- Movie List & Search ---
    showMovieList: async () => {
        app.hideAllViews();
        document.getElementById('movie-list-view').classList.remove('hidden');

        // Only fetch if we haven't already (or force refresh if needed)
        if (app.state.movies.length === 0) {
            try {
                const res = await fetch('/api/movies');
                app.state.movies = await res.json();
            } catch (e) {
                console.error('Error fetching movies:', e);
            }
        }
        app.renderMovies(app.state.movies);
    },

    renderMovies: (movies) => {
        const grid = document.getElementById('movies-grid');
        grid.innerHTML = '';

        if (movies.length === 0) {
            grid.innerHTML = '<p style="color: #fff; font-size: 1.2rem; text-align: center; grid-column: 1/-1;">No movies found.</p>';
            return;
        }

        movies.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `
                <img src="${movie.poster_url}" alt="${movie.title}" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x450?text=Poster';">
                <div class="card-content">
                    <h3>${movie.title}</h3>
                    <p>${movie.genre} • ${movie.duration_minutes} min</p>
                    <button onclick="app.showShowtimes(${movie.id})">Book Now</button>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    filterMovies: () => {
        const query = document.getElementById('movie-search').value.toLowerCase();
        const genre = document.getElementById('genre-filter').value;

        const filtered = app.state.movies.filter(movie => {
            const matchesQuery = movie.title.toLowerCase().includes(query);
            const matchesGenre = genre === '' || movie.genre.includes(genre);
            return matchesQuery && matchesGenre;
        });

        app.renderMovies(filtered);
    },

    // --- Showtimes ---
    showShowtimes: async (movieId) => {
        app.hideAllViews();
        document.getElementById('showtimes-view').classList.remove('hidden');

        try {
            const res = await fetch(`/api/movies/${movieId}/showtimes`);
            const data = await res.json();
            app.state.currentMovie = data.movie;

            document.getElementById('selected-movie-details').innerHTML = `
                <img src="${data.movie.poster_url}" alt="${data.movie.title}">
                <div>
                    <h2>${data.movie.title}</h2>
                    <p>${data.movie.description}</p>
                    <p><strong>Duration:</strong> ${data.movie.duration_minutes} min</p>
                </div>
            `;

            const list = document.getElementById('showtimes-list');
            list.innerHTML = '';

            data.showtimes.forEach(st => {
                const btn = document.createElement('button');
                const date = new Date(st.showtime_datetime);
                btn.textContent = date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
                btn.onclick = () => app.showSeatSelection(st.id, st.showtime_datetime);
                list.appendChild(btn);
            });

        } catch (e) {
            console.error(e);
        }
    },

    goBackToShowtimes: () => {
        if (app.state.currentMovie) {
            app.showShowtimes(app.state.currentMovie.id);
        } else {
            app.showMovieList();
        }
    },

    // --- Seat Selection ---
    showSeatSelection: async (showtimeId, showtimeStr) => {
        app.hideAllViews();
        document.getElementById('seat-selection-view').classList.remove('hidden');
        app.state.currentShowtime = { id: showtimeId, datetime: showtimeStr };
        app.state.selectedSeats = new Set(); // Reset selection

        document.getElementById('seat-booking-info').innerHTML = `
            <p><strong>Movie:</strong> ${app.state.currentMovie.title}</p>
            <p><strong>Time:</strong> ${new Date(showtimeStr).toLocaleString()}</p>
        `;

        try {
            const res = await fetch(`/api/showtimes/${showtimeId}/seats`);
            const data = await res.json();
            app.state.seatLayout = data.layout;
            app.state.reservedSeats = new Set(data.reservedSeats);

            app.renderSeatMap(data.layout, app.state.reservedSeats);
            app.updateBookingSummary();
        } catch (e) {
            console.error(e);
        }
    },

    renderSeatMap: (layout, reservedSet) => {
        const map = document.getElementById('seat-map');
        map.style.gridTemplateColumns = `repeat(${layout.cols}, 30px)`;
        map.innerHTML = '';

        for (let r = 0; r < layout.rows; r++) {
            for (let c = 1; c <= layout.cols; c++) {
                const rowLabel = layout.rowLabels[r];
                const seatId = `${rowLabel}${c}`;
                const seatDiv = document.createElement('div');
                seatDiv.className = 'seat';
                seatDiv.textContent = seatId; // For debugging/visual checking
                seatDiv.dataset.seat = seatId;
                seatDiv.title = seatId;

                if (reservedSet.has(seatId)) {
                    seatDiv.classList.add('reserved');
                } else {
                    seatDiv.classList.add('available');
                    seatDiv.onclick = () => app.toggleSeat(seatId);
                }
                map.appendChild(seatDiv);
            }
        }
    },

    toggleSeat: (seatId) => {
        const seatDiv = document.querySelector(`.seat[data-seat="${seatId}"]`);
        if (app.state.selectedSeats.has(seatId)) {
            app.state.selectedSeats.delete(seatId);
            seatDiv.classList.remove('selected');
        } else {
            app.state.selectedSeats.add(seatId);
            seatDiv.classList.add('selected');
        }
        app.updateBookingSummary();
    },

    updateBookingSummary: () => {
        const summary = document.getElementById('booking-summary');
        const seatSpan = document.getElementById('summary-seats');
        const selectedArr = Array.from(app.state.selectedSeats).sort();

        if (selectedArr.length > 0) {
            summary.classList.remove('hidden');
            seatSpan.textContent = selectedArr.join(', ');
        } else {
            summary.classList.add('hidden');
        }
    },

    // --- Booking Submission ---
    submitBooking: async (e) => {
        e.preventDefault();
        const name = document.getElementById('customer-name').value;
        const email = document.getElementById('customer-email').value;
        const seats = Array.from(app.state.selectedSeats);

        if (seats.length === 0) return alert("Please select seats.");

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    movie_id: app.state.currentMovie.id,
                    showtime_id: app.state.currentShowtime.id,
                    customer_name: name,
                    customer_email: email,
                    seats: seats
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Booking failed");
            }

            const result = await res.json();
            app.showBookingConfirmation(result);
        } catch (err) {
            alert(err.message);
        }
    },

    showBookingConfirmation: (data) => {
        app.hideAllViews();
        document.getElementById('booking-confirmation-view').classList.remove('hidden');

        const details = document.getElementById('confirmation-details');
        details.innerHTML = `
            <p><strong>Booking ID:</strong> #${data.booking_id}</p>
            <p><strong>Movie:</strong> ${app.state.currentMovie.title}</p>
            <p><strong>Showtime:</strong> ${new Date(app.state.currentShowtime.datetime).toLocaleString()}</p>
            <p><strong>Seats:</strong> ${data.booking.seats.join(', ')}</p>
            <p><strong>Name:</strong> ${data.booking.customer_name}</p>
            <p><strong>Email:</strong> ${data.booking.customer_email}</p>
        `;
    },

    // --- My Bookings ---
    showMyBookings: () => {
        app.hideAllViews();
        document.getElementById('my-bookings-view').classList.remove('hidden');
        document.getElementById('bookings-list').innerHTML = ''; // Start empty
        document.getElementById('lookup-email').value = '';
    },

    lookupBookings: async (e) => {
        e.preventDefault();
        const email = document.getElementById('lookup-email').value;
        const list = document.getElementById('bookings-list');
        list.innerHTML = '<p style="color: #999;">Loading...</p>';

        try {
            const res = await fetch(`/api/bookings?email=${encodeURIComponent(email)}`);
            const bookings = await res.json();
            list.innerHTML = '';

            if (bookings.length === 0) {
                list.innerHTML = '<p>No bookings found for this email.</p>';
                return;
            }

            bookings.forEach(b => {
                const item = document.createElement('div');
                item.className = 'booking-item';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h4>Booking #${b.id}</h4>
                            <p><strong>Movie:</strong> ${b.movie_title}</p>
                            <p><strong>Time:</strong> ${new Date(b.showtime_datetime).toLocaleString()}</p>
                            <p><strong>Seats:</strong> ${b.seats}</p>
                            <p><strong>Customer:</strong> ${b.customer_name} (${b.customer_email})</p>
                        </div>
                        <button onclick="app.cancelBooking(${b.id})" style="background: #333; color: #ff6b6b; font-size: 0.8rem; padding: 6px 12px;">Cancel</button>
                    </div>
                `;
                list.appendChild(item);
            });
        } catch (e) {
            console.error(e);
            list.innerHTML = '<p style="color: red;">Error fetching bookings.</p>';
        }
    },

    cancelBooking: async (id) => {
        if (!confirm("Are you sure you want to cancel this booking?")) return;

        try {
            const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Failed to cancel booking");

            alert("Booking cancelled.");
            // Refresh logic - simulate form submit
            const event = { preventDefault: () => { } };
            app.lookupBookings(event);
        } catch (e) {
            alert(e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
