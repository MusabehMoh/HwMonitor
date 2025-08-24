// Beautiful Dashboard System Monitor
// Prefer dynamic import of Tauri API (works in module scripts without bundlers)
let importedInvoke = null;
// Attempt to dynamically import the Tauri API; ignore errors and fall back to globals
import("@tauri-apps/api/tauri").then(mod => {
    importedInvoke = mod.invoke;
}).catch(() => {
    // ignore; will try window.__TAURI__ fallbacks
});
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
        // Prefer the officially imported API if available
        if (importedInvoke) {
            console.log('Using imported @tauri-apps/api invoke');
            return importedInvoke;
        }
        // Fallbacks for older/newer global injections
        if (window.__TAURI__) {
            if (typeof window.__TAURI__.invoke === 'function') {
                console.log('Using __TAURI__.invoke');
                return window.__TAURI__.invoke;
            }
            if (window.__TAURI__.tauri && typeof window.__TAURI__.tauri.invoke === 'function') {
                console.log('Using __TAURI__.tauri.invoke');
                return window.__TAURI__.tauri.invoke;
            }
            if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                console.log('Using __TAURI__.core.invoke');
                return window.__TAURI__.core.invoke;
            }
        }
        console.error('Could not find any Tauri invoke function');
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
            
            if (this.memoryFill) this.memoryFill.style.width = '0%';
            if (this.processCountElement) this.processCountElement.textContent = '--';
            if (this.loadAvgElement) this.loadAvgElement.textContent = '--';
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
            if (this.memoryFill) this.memoryFill.style.width = `${memoryUsage}%`;
            
            // Format and display memory usage
            const usedMemoryFormatted = this.formatBytes(systemInfo.used_memory);
            const totalMemoryFormatted = this.formatBytes(systemInfo.total_memory);
            
            if (this.usedMemoryElement) {
                this.usedMemoryElement.textContent = usedMemoryFormatted;
            }
            if (this.totalMemoryDisplayElement) {
                this.totalMemoryDisplayElement.textContent = totalMemoryFormatted;
            }

            // Update CPU temperature if available
            if (tempInfo && tempInfo.temperature != null) {
                const cpuTemp = Math.round(tempInfo.temperature);
                this.tempElement.textContent = cpuTemp;
                this.applyColorCoding(this.tempElement, cpuTemp, 70, 80);
            } else {
                this.tempElement.textContent = '--';
                this.tempElement.classList.remove('good', 'warning', 'danger');
            }

            // Update uptime
            const uptime = Math.floor(systemInfo.uptime / 3600);
            this.uptimeElement.textContent = uptime;

            // Update additional metrics
            if (this.processCountElement) this.processCountElement.textContent = '--';
            if (this.loadAvgElement) this.loadAvgElement.textContent = '--';

            // Update chart with new data
            this.updateChartData(cpuUsage, memoryUsage, tempInfo?.temperature)

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
            
            if (this.memoryFill) this.memoryFill.style.width = '0%';
        }
    }

    // Remove the updateFallbackData function entirely

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
        const canvas = document.getElementById('performance-chart');
        if (!canvas) return;
        
        this.ctx = canvas.getContext('2d');
        this.chartData = {
            cpu: [],
            memory: [],
            temperature: []
        };
        this.maxDataPoints = 50; // Show last 50 data points
        this.animationSpeed = 0.1; // Smooth animation factor
        
        // Force canvas to fill entire container
        const container = canvas.parentElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // Set actual canvas dimensions for crisp rendering
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        this.ctx.scale(2, 2);
        
        this.drawChart();
    }

    updateChartData(cpuUsage, memoryUsage, temperature) {
        // Add new data points
        this.chartData.cpu.push(cpuUsage);
        this.chartData.memory.push(memoryUsage);
        this.chartData.temperature.push(temperature || 0);
        
        // Remove old data points to maintain smooth scrolling
        if (this.chartData.cpu.length > this.maxDataPoints) {
            this.chartData.cpu.shift();
            this.chartData.memory.shift();
            this.chartData.temperature.shift();
        }
        
        // Redraw chart with smooth animation
        this.drawChart();
    }

    drawChart() {
        if (!this.ctx) return;
        
        const canvas = this.ctx.canvas;
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const padding = 15; // Minimal padding for edge-to-edge appearance
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // Clear canvas with gradient background matching HIVEMIND theme
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1e1e1e');
        gradient.addColorStop(1, '#2a2a2a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        this.drawGrid(padding, chartWidth, chartHeight);
        
        // Draw data lines with HIVEMIND theme colors
        this.drawLine(this.chartData.cpu, '#00ff88', 'CPU', padding, chartWidth, chartHeight);
        this.drawLine(this.chartData.memory, '#ff6b35', 'Memory', padding, chartWidth, chartHeight);
        
        if (this.chartData.temperature.some(t => t > 0)) {
            // Scale temperature (0-100°C) to 0-100% for display
            const tempScaled = this.chartData.temperature.map(t => (t / 100) * 100);
            this.drawLine(tempScaled, '#3498db', 'Temp', padding, chartWidth, chartHeight);
        }
        
        // Draw legend in top-right corner
        this.drawLegend(width - 70, 5);
        
        // Draw current values in bottom-left corner
        this.drawCurrentValues(5, height - 35);
    }

    drawGrid(padding, chartWidth, chartHeight) {
        this.ctx.strokeStyle = '#404040';
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.3;
        
        // Horizontal grid lines extend to edges
        for (let i = 0; i <= 4; i++) {
            const y = padding + (i * chartHeight / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(0, y); // Start from left edge
            this.ctx.lineTo(this.ctx.canvas.width / 2, y); // Go to right edge
            this.ctx.stroke();
            
            // Y-axis labels - positioned at very edge with theme colors
            if (i < 4) { // Don't draw label at top
                this.ctx.fillStyle = '#888';
                this.ctx.font = '9px SF Mono, monospace';
                this.ctx.fillText(`${100 - i * 25}%`, 1, y + 3);
            }
        }
        
        // Vertical grid lines extend to edges
        const timeIntervals = 15;
        for (let i = 0; i <= timeIntervals; i++) {
            const x = (i * (this.ctx.canvas.width / 2) / timeIntervals);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0); // Start from top edge
            this.ctx.lineTo(x, this.ctx.canvas.height / 2); // Go to bottom edge
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1;
    }

    drawLine(data, color, label, padding, chartWidth, chartHeight) {
        if (data.length < 2) return;
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 0.9;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const x = padding + (i / (this.maxDataPoints - 1)) * chartWidth;
            const y = padding + chartHeight - (data[i] / 100) * chartHeight;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        
        // Add glow effect
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 3;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        
        this.ctx.globalAlpha = 1;
    }

    drawLegend(x, y) {
        const legends = [
            { color: '#00ff88', label: 'CPU' },
            { color: '#ff6b35', label: 'Memory' },
            { color: '#3498db', label: 'Temp' }
        ];
        
        this.ctx.font = '10px SF Mono, monospace';
        
        legends.forEach((legend, index) => {
            const legendY = y + index * 18;
            
            // Color indicator with glow
            this.ctx.shadowColor = legend.color;
            this.ctx.shadowBlur = 2;
            this.ctx.fillStyle = legend.color;
            this.ctx.fillRect(x, legendY, 12, 2);
            this.ctx.shadowBlur = 0;
            
            // Label with theme color
            this.ctx.fillStyle = '#ccc';
            this.ctx.fillText(legend.label, x + 16, legendY + 4);
        });
    }

    drawCurrentValues(x, y) {
        if (this.chartData.cpu.length === 0) return;
        
        const currentCpu = this.chartData.cpu[this.chartData.cpu.length - 1] || 0;
        const currentMemory = this.chartData.memory[this.chartData.memory.length - 1] || 0;
        const currentTemp = this.chartData.temperature[this.chartData.temperature.length - 1] || 0;
        
        this.ctx.font = '10px SF Mono, monospace';
        this.ctx.fillStyle = '#ccc';
        
        // Add subtle background for better readability
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(x - 2, y - 12, 80, currentTemp > 0 ? 38 : 26);
        
        this.ctx.fillStyle = '#ccc';
        this.ctx.fillText(`CPU: ${currentCpu.toFixed(1)}%`, x, y);
        this.ctx.fillText(`MEM: ${currentMemory.toFixed(1)}%`, x, y + 12);
        if (currentTemp > 0) {
            this.ctx.fillText(`TEMP: ${currentTemp.toFixed(1)}°C`, x, y + 24);
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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
    
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
