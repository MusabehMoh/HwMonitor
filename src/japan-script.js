// Simple Japan Trip Countdown Script

class JapanCountdown {
    constructor() {
        this.initCountdown();
        this.initFPSCounter();
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

    initFPSCounter() {
        let frames = 0;
        let lastTime = performance.now();
        let fps = 0;
        
        const fpsElement = document.getElementById('fps-counter');
        
        const updateFPS = () => {
            frames++;
            const currentTime = performance.now();
            
            if (currentTime - lastTime >= 1000) {
                fps = Math.round((frames * 1000) / (currentTime - lastTime));
                
                // Update display
                fpsElement.textContent = `${fps} FPS`;
                
                // Color coding based on performance
                fpsElement.className = 'fps-counter';
                if (fps >= 50) {
                    fpsElement.classList.add('fps-good');
                } else if (fps >= 30) {
                    fpsElement.classList.add('fps-medium');
                } else {
                    fpsElement.classList.add('fps-bad');
                }
                
                frames = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(updateFPS);
        };
        
        updateFPS();
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
