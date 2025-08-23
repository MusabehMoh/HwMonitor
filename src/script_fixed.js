// Beautiful Dashboard System Monitor
class DashboardManager {
    constructor() {
        this.tauriInvoke = this.setupTauriInvoke();
        this.initializeElements();
        this.initializeChart();
        this.loadHardwareSpecs();
        this.startSystemMonitoring();
        this.startClock();
        this.initializeFPSCounter();
    }

    setupTauriInvoke() {
        console.log('Setting up Tauri invoke...');
        console.log('window.__TAURI__ exists:', !!window.__TAURI__);
        
        if (window.__TAURI__) {
            console.log('Available Tauri keys:', Object.keys(window.__TAURI__));
            
            // Try the invoke function directly first
            if (typeof window.__TAURI__.invoke === 'function') {
                console.log('Using __TAURI__.invoke');
                return window.__TAURI__.invoke;
            }
            
            // Try tauri namespace
            if (window.__TAURI__.tauri && typeof window.__TAURI__.tauri.invoke === 'function') {
                console.log('Using __TAURI__.tauri.invoke');
                return window.__TAURI__.tauri.invoke;
            }
            
            // Try core namespace
            if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                console.log('Using __TAURI__.core.invoke');
                return window.__TAURI__.core.invoke;
            }
        }
        
        console.error('Could not find Tauri invoke function!');
        return null;
    }

    initializeElements() {
        // System stats
        this.cpuElement = document.getElementById('cpu-usage');
        this.memoryElement = document.getElementById('memory-usage');
        this.tempElement = document.getElementById('cpu-temp');
        this.uptimeElement = document.getElementById('uptime');
        
        // Hardware specs
        this.cpuModelElement = document.getElementById('cpu-model');
        this.cpuArchElement = document.getElementById('cpu-arch');
        this.cpuCoresElement = document.getElementById('cpu-cores');
        this.totalMemoryElement = document.getElementById('total-memory');
        this.osInfoElement = document.getElementById('os-info');
        this.hostnameElement = document.getElementById('hostname');
        
        // Memory display
        this.memoryFill = document.getElementById('memory-fill');
        this.usedMemoryElement = document.getElementById('used-memory');
        this.totalMemoryDisplayElement = document.getElementById('total-memory-display');
        
        // Metrics
        this.fpsElement = document.getElementById('fps-counter');
        this.processCountElement = document.getElementById('process-count');
        this.loadAvgElement = document.getElementById('load-avg');
        this.bootTimeElement = document.getElementById('boot-time');
        
        // Time
        this.timeElement = document.getElementById('system-time');
    }

    async loadHardwareSpecs() {
        console.log('Loading hardware specs...');
        if (!this.tauriInvoke) {
            console.log('Tauri not available, showing placeholder data');
            this.cpuModelElement.textContent = 'Tauri Not Available';
            this.cpuArchElement.textContent = 'BROWSER';
            this.cpuCoresElement.textContent = 'N/A';
            this.totalMemoryElement.textContent = 'N/A';
            this.osInfoElement.textContent = 'Browser Mode';
            this.hostnameElement.textContent = 'localhost';
            return;
        }

        try {
            const specs = await this.tauriInvoke('get_hardware_specs');
            console.log('Hardware specs loaded:', specs);
            
            this.cpuModelElement.textContent = specs.cpu_model;
            this.cpuArchElement.textContent = specs.cpu_arch.toUpperCase();
            this.cpuCoresElement.textContent = `${specs.cpu_cores} Cores`;
            this.totalMemoryElement.textContent = `${specs.total_memory_gb.toFixed(1)} GB`;
            this.osInfoElement.textContent = `${specs.os_name} ${specs.os_version}`;
            this.hostnameElement.textContent = specs.hostname;
        } catch (error) {
            console.error('Failed to load hardware specs:', error);
            this.cpuModelElement.textContent = 'Failed to load';
            this.cpuArchElement.textContent = 'Failed to load';
            this.cpuCoresElement.textContent = 'Failed to load';
            this.totalMemoryElement.textContent = 'Failed to load';
            this.osInfoElement.textContent = 'Failed to load';
            this.hostnameElement.textContent = 'Failed to load';
        }
    }

    async startSystemMonitoring() {
        await this.updateSystemInfo();
        setInterval(() => this.updateSystemInfo(), 2000);
    }

    async updateSystemInfo() {
        console.log('Updating system info...');
        if (!this.tauriInvoke) {
            console.log('Tauri not available, showing placeholder data');
            this.cpuElement.textContent = '--';
            this.memoryElement.textContent = '--';
            this.tempElement.textContent = '--';
            this.uptimeElement.textContent = '--';
            
            if (this.usedMemoryElement) {
                this.usedMemoryElement.textContent = '--';
            }
            if (this.totalMemoryDisplayElement) {
                this.totalMemoryDisplayElement.textContent = '--';
            }
            
            this.memoryFill.style.width = '0%';
            this.processCountElement.textContent = '--';
            this.loadAvgElement.textContent = '--';
            return;
        }

        try {
            const [systemInfo, tempInfo] = await Promise.all([
                this.tauriInvoke('get_system_info'),
                this.tauriInvoke('get_cpu_temperature')
            ]);

            console.log('System info received:', systemInfo, tempInfo);

            // Update CPU usage
            const cpuUsage = Math.round(systemInfo.cpu_usage);
            this.cpuElement.textContent = cpuUsage;
            this.applyColorCoding(this.cpuElement, cpuUsage, 70, 85);

            // Update Memory usage
            const memoryUsage = Math.round(systemInfo.memory_usage);
            this.memoryElement.textContent = memoryUsage;
            this.applyColorCoding(this.memoryElement, memoryUsage, 75, 90);

            // Update memory bar and details
            this.memoryFill.style.width = `${memoryUsage}%`;
            
            // Format and display memory usage
            const usedMemoryFormatted = this.formatBytes(systemInfo.used_memory);
            const totalMemoryFormatted = this.formatBytes(systemInfo.total_memory);
            
            if (this.usedMemoryElement) {
                this.usedMemoryElement.textContent = usedMemoryFormatted;
            }
            if (this.totalMemoryDisplayElement) {
                this.totalMemoryDisplayElement.textContent = totalMemoryFormatted;
            }

            // Update CPU temperature
            const cpuTemp = Math.round(tempInfo.temperature);
            this.tempElement.textContent = cpuTemp;
            this.applyColorCoding(this.tempElement, cpuTemp, 70, 80);

            // Update uptime
            const uptime = Math.floor(systemInfo.uptime / 3600);
            this.uptimeElement.textContent = uptime;

            // Update additional metrics
            this.processCountElement.textContent = '--';
            this.loadAvgElement.textContent = '--';

        } catch (error) {
            console.error('Failed to get system info:', error);
            // Show error state instead of fake data
            this.cpuElement.textContent = '--';
            this.memoryElement.textContent = '--';
            this.tempElement.textContent = '--';
            this.uptimeElement.textContent = '--';
            
            if (this.usedMemoryElement) {
                this.usedMemoryElement.textContent = '--';
            }
            if (this.totalMemoryDisplayElement) {
                this.totalMemoryDisplayElement.textContent = '--';
            }
            
            this.memoryFill.style.width = '0%';
        }
    }

    applyColorCoding(element, value, warningThreshold, dangerThreshold) {
        element.classList.remove('good', 'warning', 'danger');
        
        if (value >= dangerThreshold) {
            element.classList.add('danger');
        } else if (value >= warningThreshold) {
            element.classList.add('warning');
        } else {
            element.classList.add('good');
        }
    }

    formatBytes(bytes) {
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) {
            return `${gb.toFixed(1)} GB`;
        }
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(0)} MB`;
    }

    startClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        this.timeElement.textContent = timeString;
    }

    initializeFPSCounter() {
        this.fps = 0;
        this.frames = 0;
        this.lastTime = performance.now();
        this.updateFPS();
    }

    updateFPS() {
        const now = performance.now();
        this.frames++;

        if (now >= this.lastTime + 1000) {
            this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.frames = 0;
            this.lastTime = now;
            
            if (this.fpsElement) {
                this.fpsElement.textContent = this.fps;
                this.applyColorCoding(this.fpsElement, this.fps, 30, 55);
            }
        }

        requestAnimationFrame(() => this.updateFPS());
    }

    initializeChart() {
        // Clean, minimal performance chart
        const canvas = document.getElementById('performance-chart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            
            // Clear canvas with white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw minimal grid lines
            ctx.strokeStyle = '#f0f0f0';
            ctx.lineWidth = 1;
            
            // Horizontal grid lines
            for (let y = 0; y <= canvas.height; y += 40) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
            
            // Vertical grid lines
            for (let x = 0; x <= canvas.width; x += 50) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            
            // Draw a simple black line chart
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            
            // Draw a sample performance line
            for (let x = 0; x < canvas.width; x += 10) {
                const y = canvas.height / 2 + Math.sin(x * 0.02) * 30 + Math.random() * 20 - 10;
                ctx.lineTo(x, Math.max(10, Math.min(canvas.height - 10, y)));
            }
            ctx.stroke();
            
            // Add minimal text label
            ctx.fillStyle = '#999999';
            ctx.font = '12px SF Mono, monospace';
            ctx.fillText('PERFORMANCE', 15, 25);
        }
    }
}

// Wait for Tauri to be ready, then initialize dashboard
async function initializeApp() {
    console.log('🚀 HIVEMIND Dashboard initializing...');
    
    // Wait a moment for Tauri to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('Current window location:', window.location.href);
    console.log('User agent:', navigator.userAgent);
    console.log('window.__TAURI__ available:', !!window.__TAURI__);
    
    if (window.__TAURI__) {
        console.log('✅ Tauri API detected!');
        console.log('Tauri object keys:', Object.keys(window.__TAURI__));
    } else {
        console.error('❌ window.__TAURI__ is undefined!');
        console.log('This should not happen in a Tauri app!');
    }
    
    // Initialize dashboard
    new DashboardManager();
    
    // Add click interaction
    document.addEventListener('click', function(e) {
        // Create ripple effect on card clicks
        if (e.target.closest('.card')) {
            const card = e.target.closest('.card');
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.1);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            const rect = card.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
            ripple.style.top = e.clientY - rect.top - size / 2 + 'px';
            
            card.style.position = 'relative';
            card.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        }
    });
    
    console.log('✨ HIVEMIND Dashboard ready!');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Add ripple animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
