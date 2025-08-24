// Simple Japan Trip Countdown Script

class JapanCountdown {
    constructor() {
        this.initCountdown();
    }

    initCountdown() {
        // Calculate days until Japan trip
        const today = new Date();
        const departureDate = new Date(today);
        departureDate.setDate(today.getDate() + 97); // 97 days from today
        
        // Start countdown timer
        this.startCountdown(departureDate);
    }

    startCountdown(departureDate) {
        const updateCountdown = () => {
            const now = new Date();
            const timeDiff = departureDate - now;
            
            if (timeDiff > 0) {
                const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                document.getElementById('days-count').textContent = days;
            } else {
                document.getElementById('days-count').textContent = '🇯🇵';
                document.querySelector('.countdown-unit').textContent = 'ARRIVED!';
            }
        };
        
        updateCountdown();
        setInterval(updateCountdown, 1000 * 60 * 60); // Update every hour
    }
}

// Go back to main dashboard
function goBack() {
    window.location.href = 'index.html';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new JapanCountdown();
});
