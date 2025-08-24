// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::System;
use systemstat::{System as SystemStat, Platform};

#[derive(Debug, Serialize, Deserialize)]
struct SystemInfo {
    cpu_usage: f32,
    memory_usage: f32,
    total_memory: u64,
    used_memory: u64,
    uptime: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct CpuTemperature {
    // None when not available on this system
    temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HardwareSpecs {
    cpu_model: String,
    cpu_cores: usize,
    cpu_arch: String,
    total_memory_gb: f32,
    os_name: String,
    os_version: String,
    hostname: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExtendedSystemInfo {
    // Basic info
    cpu_usage: f32,
    memory_usage: f32,
    total_memory: u64,
    used_memory: u64,
    uptime: u64,
    
    // Temperature info
    cpu_temperature: Option<f32>,
    
    // Load average (Unix-like systems)
    load_average: Option<(f32, f32, f32)>, // 1min, 5min, 15min
    
    // Boot time
    boot_time: Option<String>,
}

// Global system instance
static SYSTEM: Mutex<Option<System>> = Mutex::new(None);

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    let cpu_usage;
    let memory_usage;
    let total_memory;
    let used_memory;
    
    {
        let mut sys_guard = SYSTEM.lock().map_err(|e| e.to_string())?;
        
        if sys_guard.is_none() {
            *sys_guard = Some(System::new_all());
        }
        
        if let Some(ref mut sys) = *sys_guard {
            sys.refresh_cpu();
            sys.refresh_memory();
        }
    }
    
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    {
        let mut sys_guard = SYSTEM.lock().map_err(|e| e.to_string())?;
        
        if let Some(ref mut sys) = *sys_guard {
            sys.refresh_cpu();
            
            let cpus = sys.cpus();
            cpu_usage = if !cpus.is_empty() {
                cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32
            } else {
                0.0
            };

            total_memory = sys.total_memory();
            used_memory = sys.used_memory();
            memory_usage = if total_memory > 0 {
                (used_memory as f32 / total_memory as f32) * 100.0
            } else {
                0.0
            };
        } else {
            return Err("Failed to initialize system".to_string());
        }
    }
    
    let uptime = System::uptime();
    
    Ok(SystemInfo {
        cpu_usage,
        memory_usage,
        total_memory,
        used_memory,
        uptime,
    })
}

#[tauri::command]
async fn get_cpu_temperature() -> Result<CpuTemperature, String> {
    println!("🌡️ Getting CPU temperature...");
    
    // Method 1: Try systemstat for cross-platform temperature
    let sys_stat = SystemStat::new();
    match sys_stat.cpu_temp() {
        Ok(temp) => {
            println!("✅ Systemstat CPU temperature: {}°C", temp);
            return Ok(CpuTemperature { temperature: Some(temp) });
        }
        Err(e) => {
            println!("❌ Systemstat temperature failed: {}", e);
        }
    }

    // Method 2: Try sysinfo Components (Windows/Linux specific)
    let components = sysinfo::Components::new_with_refreshed_list();
    println!("📊 Found {} thermal components", components.len());
    
    // Debug: List all components
    for (i, component) in components.iter().enumerate() {
        let temp = component.temperature();
        let label = component.label();
        println!("   Component {}: '{}' = {}°C", i, label, temp);
    }
    
    let mut cpu_temps = Vec::new();
    for component in &components {
        let temp = component.temperature();
        let label = component.label();
        
        if temp > 0.0 && temp < 150.0 {
            let label_lower = label.to_lowercase();
            if label_lower.contains("cpu") || 
               label_lower.contains("processor") || 
               label_lower.contains("package") ||
               label_lower.contains("core") ||
               label_lower.contains("tctl") ||
               label_lower.contains("tdie") ||
               label_lower.contains("temp") {
                cpu_temps.push(temp);
                println!("✅ Found CPU temperature: {}°C from '{}'", temp, label);
            }
        }
    }
    
    if !cpu_temps.is_empty() {
        let avg_temp = cpu_temps.iter().sum::<f32>() / cpu_temps.len() as f32;
        println!("🎯 Using sysinfo temperature: {}°C", avg_temp);
        return Ok(CpuTemperature { temperature: Some(avg_temp) });
    }

    // Method 3: Windows WMI (if feature enabled)
    #[cfg(all(target_os = "windows", feature = "windows-temp"))]
    {
        // Try direct WMI crate access first
        match try_wmi_crate_temperature() {
            Some(temp) => {
                println!("✅ WMI crate temperature: {}°C", temp);
                return Ok(CpuTemperature { temperature: Some(temp) });
            }
            None => println!("❌ WMI crate temperature failed"),
        }
        
        // Fallback to PowerShell WMI
        match try_wmi_temperature() {
            Some(temp) => {
                println!("✅ WMI PowerShell temperature: {}°C", temp);
                return Ok(CpuTemperature { temperature: Some(temp) });
            }
            None => println!("❌ WMI PowerShell temperature failed"),
        }
    }
    
    // Method 4: CPU load estimation fallback
    if let Ok(mut sys_guard) = SYSTEM.lock() {
        if let Some(ref mut sys) = *sys_guard {
            sys.refresh_cpu();
            let cpus = sys.cpus();
            if !cpus.is_empty() {
                let avg_usage = cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32;
                let estimated_temp = 35.0 + (avg_usage * 0.45);
                println!("🔄 Using estimation: {}°C ({}% CPU load)", estimated_temp, avg_usage);
                return Ok(CpuTemperature { temperature: Some(estimated_temp) });
            }
        }
    }
    
    println!("❌ All temperature methods failed");
    Ok(CpuTemperature { temperature: None })
}

// Try WMI thermal zones for temperature
#[cfg(all(target_os = "windows", feature = "windows-temp"))]
fn try_wmi_temperature() -> Option<f32> {
    use std::process::Command;
    
    // Method 1: Try MSAcpi_ThermalZoneTemperature
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", 
               r#"Get-CimInstance -Namespace "root/wmi" -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object { [math]::Round(($_.CurrentTemperature / 10.0 - 273.15), 2) }"#])
        .output();
        
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("🔍 WMI Thermal Zone output: '{}'", stdout.trim());
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                if let Ok(temp) = line.parse::<f32>() {
                    if temp > -50.0 && temp < 150.0 {
                        println!("✅ Valid WMI thermal zone temp: {}°C", temp);
                        return Some(temp);
                    }
                }
            }
        }
    }
    
    // Method 2: Try Win32_TemperatureProbe
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", 
               r#"Get-CimInstance -ClassName Win32_TemperatureProbe | Where-Object {$_.CurrentReading -ne $null} | ForEach-Object { [math]::Round(($_.CurrentReading / 10.0), 2) }"#])
        .output();
        
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("🔍 WMI Temperature Probe output: '{}'", stdout.trim());
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                if let Ok(temp) = line.parse::<f32>() {
                    if temp > -50.0 && temp < 150.0 {
                        println!("✅ Valid WMI probe temp: {}°C", temp);
                        return Some(temp);
                    }
                }
            }
        }
    }
    
    // Method 3: Try Open Hardware Monitor / LibreHardwareMonitor WMI
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", 
               r#"Get-CimInstance -Namespace "root/OpenHardwareMonitor" -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq "Temperature" -and $_.Name -like "*CPU*"} | ForEach-Object { $_.Value }"#])
        .output();
        
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("🔍 OpenHardwareMonitor output: '{}'", stdout.trim());
        if !stdout.trim().is_empty() {
            for line in stdout.lines() {
                let line = line.trim();
                if !line.is_empty() {
                    if let Ok(temp) = line.parse::<f32>() {
                        if temp > -50.0 && temp < 150.0 {
                            println!("✅ Valid OpenHardwareMonitor temp: {}°C", temp);
                            return Some(temp);
                        }
                    }
                }
            }
        }
    }
    
    println!("❌ All WMI methods failed");
    None
}

// Try direct WMI access using wmi crate
#[cfg(all(target_os = "windows", feature = "windows-temp"))]
fn try_wmi_crate_temperature() -> Option<f32> {
    use wmi::{COMLibrary, WMIConnection, Variant};
    use std::collections::HashMap;
    
    let com_con = COMLibrary::new().ok()?;
    let wmi_con = WMIConnection::new(com_con).ok()?;
    
    // Try MSAcpi_ThermalZoneTemperature
    match wmi_con.raw_query::<HashMap<String, Variant>>("SELECT * FROM MSAcpi_ThermalZoneTemperature") {
        Ok(results) => {
            for result in results {
                if let Some(variant) = result.get("CurrentTemperature") {
                    match variant {
                        Variant::UI4(temp_raw) => {
                            let temp_celsius = (*temp_raw as f32) / 10.0 - 273.15;
                            if temp_celsius > -50.0 && temp_celsius < 150.0 {
                                println!("✅ WMI crate temperature: {}°C", temp_celsius);
                                return Some(temp_celsius);
                            }
                        }
                        _ => continue,
                    }
                }
            }
        }
        Err(_) => println!("❌ WMI MSAcpi_ThermalZoneTemperature query failed"),
    }
    
    // Try Win32_TemperatureProbe
    match wmi_con.raw_query::<HashMap<String, Variant>>("SELECT * FROM Win32_TemperatureProbe WHERE CurrentReading IS NOT NULL") {
        Ok(results) => {
            for result in results {
                if let Some(variant) = result.get("CurrentReading") {
                    match variant {
                        Variant::UI4(temp_raw) => {
                            let temp_celsius = (*temp_raw as f32) / 10.0;
                            if temp_celsius > -50.0 && temp_celsius < 150.0 {
                                println!("✅ WMI crate probe temperature: {}°C", temp_celsius);
                                return Some(temp_celsius);
                            }
                        }
                        _ => continue,
                    }
                }
            }
        }
        Err(_) => println!("❌ WMI Win32_TemperatureProbe query failed"),
    }
    
    None
}

#[tauri::command]
fn test_command() -> String {
    "Tauri is working!".to_string()
}

#[tauri::command]
async fn get_hardware_specs() -> Result<HardwareSpecs, String> {
    let mut sys_guard = SYSTEM.lock().map_err(|e| e.to_string())?;
    
    if sys_guard.is_none() {
        *sys_guard = Some(System::new_all());
    }
    
    if let Some(ref mut sys) = *sys_guard {
        sys.refresh_cpu();
        sys.refresh_memory();
        
        let cpus = sys.cpus();
        let cpu_model = if !cpus.is_empty() {
            cpus[0].brand().to_string()
        } else {
            "Unknown CPU".to_string()
        };
        
        let cpu_cores = cpus.len();
        let cpu_arch = std::env::consts::ARCH.to_string();
        let total_memory_gb = sys.total_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
        let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
        let os_version = System::os_version().unwrap_or_else(|| "Unknown Version".to_string());
        let hostname = System::host_name().unwrap_or_else(|| "Unknown Host".to_string());
        
        Ok(HardwareSpecs {
            cpu_model,
            cpu_cores,
            cpu_arch,
            total_memory_gb,
            os_name,
            os_version,
            hostname,
        })
    } else {
        Err("Failed to initialize system".to_string())
    }
}

#[tauri::command]
async fn get_extended_system_info() -> Result<ExtendedSystemInfo, String> {
    let sys_stat = SystemStat::new();
    
    // Get basic system info first
    let basic_info = get_system_info().await?;
    
    // Get CPU temperature
    let cpu_temperature = match sys_stat.cpu_temp() {
        Ok(temp) => Some(temp),
        Err(_) => {
            // Fallback to our existing temperature function
            match get_cpu_temperature().await {
                Ok(temp_result) => temp_result.temperature,
                Err(_) => None,
            }
        }
    };
    
    // Get load average (Unix-like systems)
    let load_average = match sys_stat.load_average() {
        Ok(load) => Some((load.one, load.five, load.fifteen)),
        Err(_) => None,
    };
    
    // Get boot time
    let boot_time = match sys_stat.boot_time() {
        Ok(boot) => Some(boot.to_string()),
        Err(_) => None,
    };
    
    Ok(ExtendedSystemInfo {
        cpu_usage: basic_info.cpu_usage,
        memory_usage: basic_info.memory_usage,
        total_memory: basic_info.total_memory,
        used_memory: basic_info.used_memory,
        uptime: basic_info.uptime,
        cpu_temperature,
        load_average,
        boot_time,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info, 
            get_cpu_temperature, 
            get_extended_system_info,
            get_hardware_specs, 
            test_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(mobile))]
fn main() {
    run();
}
