# HIVEMIND Hardware Monitor

A real-time system monitoring dashboard built with Tauri (Rust + JavaScript) featuring hardware information display with live CPU temperature, memory usage, and system specifications.

## Features

- 🖥️ **Real-time System Monitoring**
  - CPU usage and temperature with color-coded alerts
  - Memory usage with visual progress bar
  - System uptime tracking
  - FPS counter for smooth performance

- 🔧 **Hardware Specifications**
  - CPU model, architecture, and core count
  - Total system memory
  - Operating system information
  - Hostname display

- 🌡️ **Intel CPU Temperature Support**
  - Intelligent temperature estimation for Intel processors
  - Based on real CPU load with thermal modeling
  - Supports Intel i7-8700K and similar CPUs

- 🎨 **Professional UI**
  - Clean, modern dashboard design
  - Responsive grid layout
  - Color-coded metrics (green/yellow/red)
  - Interactive ripple effects

## Technology Stack

- **Backend**: Rust with Tauri framework
- **Frontend**: Vanilla JavaScript with CSS3
- **System APIs**: sysinfo crate, Windows WMI
- **Temperature Detection**: Multi-method approach (WMI, PowerShell, load-based estimation)

## Getting Started

### Prerequisites
- Rust (latest stable)
- Node.js (for Tauri)
- Windows 10/11

### Installation & Running

```bash
# Clone the repository
git clone https://github.com/MusabehMoh/HwMonitor.git
cd HwMonitor

# Install Tauri CLI (if not already installed)
cargo install tauri-cli

# Run the development version
cd src-tauri
cargo tauri dev -- --features windows-temp

# Build for production
cargo tauri build -- --features windows-temp
```

## Architecture

### Rust Backend (`src-tauri/src/main.rs`)
- `get_system_info()` - Real-time CPU/memory metrics
- `get_cpu_temperature()` - Multi-method temperature detection
- `get_hardware_specs()` - Static hardware information

### Frontend (`src/`)
- `index.html` - Dashboard structure
- `script.js` - Real-time data fetching and UI updates
- `styles.css` - Professional styling and animations

## Temperature Detection Methods

1. **LibreHardwareMonitor/OpenHardwareMonitor WMI**
2. **Windows ACPI Thermal Zones**
3. **Win32_TemperatureProbe**
4. **Intel CPU Load-Based Estimation** (fallback)

## Supported Systems

- ✅ Windows 10/11
- ✅ Intel CPUs (i3, i5, i7, i9)
- ✅ AMD CPUs (basic support)
- ⚠️ Requires Windows WMI access

## Screenshots

The dashboard displays:
- Live system metrics in an organized grid
- Color-coded temperature and usage indicators
- Professional dark theme with accent colors
- Real-time performance monitoring

## License

This project is open source. See LICENSE file for details.

## Contributing

Feel free to submit issues and enhancement requests!
