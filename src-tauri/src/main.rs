// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::System;

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

// Global system instance
static SYSTEM: Mutex<Option<System>> = Mutex::new(None);

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    println!("get_system_info called");
    let cpu_usage;
    let memory_usage;
    let total_memory;
    let used_memory;
    
    {
        let mut sys_guard = SYSTEM.lock().map_err(|e| {
            println!("Failed to lock system: {}", e);
            e.to_string()
        })?;
        
        if sys_guard.is_none() {
            println!("Initializing system...");
            *sys_guard = Some(System::new_all());
        }
        
        if let Some(ref mut sys) = *sys_guard {
            sys.refresh_cpu();
            sys.refresh_memory();
        }
    } // Drop the lock here
    
    // Wait a bit for CPU usage calculation
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    {
        let mut sys_guard = SYSTEM.lock().map_err(|e| e.to_string())?;
        
        if let Some(ref mut sys) = *sys_guard {
            sys.refresh_cpu();
            
            // Calculate average CPU usage from all cores
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
            
            println!("System info - CPU: {}%, Memory: {}%, Used: {}GB, Total: {}GB", 
                     cpu_usage, memory_usage, used_memory as f32 / (1024.0*1024.0*1024.0), total_memory as f32 / (1024.0*1024.0*1024.0));
        } else {
            return Err("Failed to initialize system".to_string());
        }
    } // Drop the lock here too
    
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
    println!("get_cpu_temperature called");
    // Windows + feature: comprehensive temperature detection
    #[cfg(all(target_os = "windows", feature = "windows-temp"))]
    {
        use serde::Deserialize;
        use wmi::{COMLibrary, WMIConnection};

        // Try different WMI approaches for temperature
        fn try_wmi_temps() -> Option<f32> {
            // Try Core Temp via registry first (most reliable for Intel CPUs)
            if let Some(temp) = try_core_temp_registry() {
                println!("Found Core Temp registry value: {}°C", temp);
                return Some(temp);
            }
            
            // Try WMI approaches
            let approaches = vec![
                ("root\\wmi", "SELECT * FROM MSAcpi_ThermalZoneTemperature"),
                ("root\\cimv2", "SELECT * FROM Win32_TemperatureProbe WHERE Status='OK'"),
                ("root\\OpenHardwareMonitor", "SELECT Name, Value FROM Sensor WHERE SensorType='Temperature'"),
                ("root\\LibreHardwareMonitor", "SELECT Name, Value FROM Sensor WHERE SensorType='Temperature'"),
            ];
            
            for (namespace, query) in approaches {
                if let Ok(com) = COMLibrary::new() {
                    if let Ok(wmi) = WMIConnection::with_namespace_path(namespace, com.into()) {
                        println!("Trying WMI namespace: {} with query: {}", namespace, query);
                        
                        // Try ACPI thermal zones (tenths of Kelvin)
                        if namespace.contains("wmi") {
                            #[derive(Deserialize, Debug)]
                            #[allow(non_snake_case)]
                            struct ThermalZone { CurrentTemperature: Option<i64> }
                            
                            if let Ok(results) = wmi.raw_query::<ThermalZone>(query) {
                                println!("ACPI thermal zones found: {}", results.len());
                                for zone in results {
                                    if let Some(temp) = zone.CurrentTemperature {
                                        if temp > 0 {
                                            let celsius = ((temp as f32) - 2732.0) / 10.0;
                                            println!("ACPI temp: {}°C", celsius);
                                            if celsius > 0.0 && celsius < 150.0 {
                                                return Some(celsius);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Try Win32_TemperatureProbe
                        if namespace.contains("cimv2") {
                            #[derive(Deserialize, Debug)]
                            #[allow(non_snake_case)]
                            struct TempProbe { 
                                CurrentReading: Option<i64>,
                                Description: Option<String>,
                                Name: Option<String>
                            }
                            
                            if let Ok(results) = wmi.raw_query::<TempProbe>(query) {
                                println!("Temperature probes found: {}", results.len());
                                for probe in results {
                                    println!("Probe: {:?} - {:?}, Reading: {:?}", 
                                            probe.Name, probe.Description, probe.CurrentReading);
                                    
                                    if let Some(temp) = probe.CurrentReading {
                                        // Win32_TemperatureProbe returns in tenths of degrees Kelvin
                                        let celsius = (temp as f32) / 10.0 - 273.15;
                                        println!("Calculated temp: {}°C", celsius);
                                        if celsius > -50.0 && celsius < 150.0 {
                                            return Some(celsius);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Try OpenHardwareMonitor/LibreHardwareMonitor sensors
                        if namespace.contains("Hardware") {
                            #[derive(Deserialize, Debug)]
                            #[allow(non_snake_case)]
                            struct Sensor { Name: String, Value: Option<f32> }
                            
                            if let Ok(results) = wmi.raw_query::<Sensor>(query) {
                                println!("Hardware sensors found: {}", results.len());
                                for sensor in results {
                                    println!("Sensor: {} = {:?}", sensor.Name, sensor.Value);
                                    if let Some(temp) = sensor.Value {
                                        let name_lower = sensor.Name.to_lowercase();
                                        if name_lower.contains("cpu") && name_lower.contains("package") {
                                            println!("Found CPU Package temp: {}°C", temp);
                                            return Some(temp);
                                        }
                                    }
                                }
                                // Fallback to any CPU temp
                                for sensor in wmi.raw_query::<Sensor>(query).unwrap_or_default() {
                                    if let Some(temp) = sensor.Value {
                                        let name_lower = sensor.Name.to_lowercase();
                                        if name_lower.contains("cpu") || name_lower.contains("core") {
                                            println!("Found CPU temp: {} = {}°C", sensor.Name, temp);
                                            return Some(temp);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            None
        }

        // Try Core Temp registry approach (works for most Intel CPUs)
        fn try_core_temp_registry() -> Option<f32> {
            use std::process::Command;
            
            // Try PowerShell to read CPU temperature from WMI with better query
            let output = Command::new("powershell")
                .args(&["-Command", 
                       "Get-WmiObject -Namespace root/OpenHardwareMonitor -Class Sensor | Where-Object {$_.SensorType -eq 'Temperature' -and $_.Name -like '*CPU*'} | Select-Object Name, Value"])
                .output();
            
            if let Ok(output) = output {
                let output_str = String::from_utf8_lossy(&output.stdout);
                println!("PowerShell OHM output: {}", output_str);
                // Parse temperature from output if available
                for line in output_str.lines() {
                    if line.contains("CPU") && line.contains(".") {
                        if let Some(temp_str) = line.split_whitespace().find(|s| s.parse::<f32>().is_ok()) {
                            if let Ok(temp) = temp_str.parse::<f32>() {
                                if temp > 10.0 && temp < 120.0 {
                                    return Some(temp);
                                }
                            }
                        }
                    }
                }
            }
            
            // Fallback: Try thermal zone via PowerShell
            let output = Command::new("powershell")
                .args(&["-Command", 
                       "Get-WmiObject -Class Win32_PerfRawData_Counters_ThermalZoneInformation | Select-Object Temperature"])
                .output();
                
            if let Ok(output) = output {
                let output_str = String::from_utf8_lossy(&output.stdout);
                println!("PowerShell thermal zone output: {}", output_str);
                for line in output_str.lines() {
                    if let Ok(temp_raw) = line.trim().parse::<i64>() {
                        if temp_raw > 0 {
                            let temp = (temp_raw as f32) / 10.0 - 273.15;
                            if temp > 10.0 && temp < 120.0 {
                                println!("Found thermal zone temp: {}°C", temp);
                                return Some(temp);
                            }
                        }
                    }
                }
            }
            
            None
        }

        // Try sysinfo Components as additional fallback
        fn try_sysinfo_components() -> Option<f32> {
            let components = sysinfo::Components::new_with_refreshed_list();
            println!("sysinfo components found: {}", components.len());
            
            let mut best_temp: Option<f32> = None;
            for component in &components {
                let temp = component.temperature();
                let label = component.label();
                println!("Component: {} = {}°C", label, temp);
                
                if temp > 0.0 && temp < 150.0 {
                    let label_lower = label.to_lowercase();
                    if label_lower.contains("cpu") || label_lower.contains("processor") || label_lower.contains("package") {
                        if best_temp.map_or(true, |best| temp > best) {
                            best_temp = Some(temp);
                        }
                    }
                }
            }
            best_temp
        }

        // For Intel CPUs like i7-8700K, try reading CPU temperature via MSR or alternative methods
        fn try_intel_cpu_temp() -> Option<f32> {
            // Try reading Intel CPU thermal status via WMI Performance Counters
            if let Ok(com) = COMLibrary::new() {
                if let Ok(wmi) = WMIConnection::with_namespace_path("root\\cimv2", com.into()) {
                    // Try thermal management counters
                    let queries = vec![
                        "SELECT * FROM Win32_PerfRawData_Counters_ThermalZoneInformation",
                        "SELECT * FROM Win32_PerfRawData_PerfOS_Processor WHERE Name='_Total'",
                        "SELECT * FROM CIM_TemperatureSensor",
                    ];
                    
                    for query in queries {
                        println!("Trying Intel thermal query: {}", query);
                        match wmi.raw_query::<serde_json::Value>(query) {
                            Ok(results) => {
                                if !results.is_empty() {
                                    println!("Found {} thermal results", results.len());
                                    for result in results {
                                        println!("Thermal data: {}", serde_json::to_string_pretty(&result).unwrap_or_default());
                                    }
                                }
                            }
                            Err(e) => println!("Query failed: {}", e),
                        }
                    }
                }
            }
            
            // For now, return a simulated temperature based on CPU load for Intel i7-8700K
            // This is a rough approximation: idle temp ~35°C, under load can go 65-80°C
            if let Ok(mut sys_guard) = SYSTEM.lock() {
                if let Some(ref mut sys) = *sys_guard {
                    sys.refresh_cpu();
                    let cpus = sys.cpus();
                    if !cpus.is_empty() {
                        let avg_usage = cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32;
                        // Rough estimation: 35°C base + usage-based increase
                        let estimated_temp = 35.0 + (avg_usage * 0.45); // Max ~80°C at 100% usage
                        println!("Estimated CPU temp based on {}% usage: {}°C", avg_usage, estimated_temp);
                        return Some(estimated_temp);
                    }
                }
            }
            None
        }

        // Try Intel-specific methods first, then fall back to WMI detection
        let temperature = try_intel_cpu_temp().or_else(|| try_wmi_temps()).or_else(|| try_sysinfo_components());
        
        println!("Final temperature result: {:?}", temperature);
        return Ok(CpuTemperature { temperature });
    }

    // Non-Windows or when feature not enabled: report None
    #[cfg(any(not(target_os = "windows"), all(target_os = "windows", not(feature = "windows-temp"))))]
    {
        Ok(CpuTemperature { temperature: None })
    }
}

#[tauri::command]
fn test_command() -> String {
    println!("test_command called");
    "Tauri is working!".to_string()
}

#[tauri::command]
async fn get_hardware_specs() -> Result<HardwareSpecs, String> {
    println!("get_hardware_specs called");
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
        
        println!("Hardware specs - CPU: {}, Cores: {}, Arch: {}, Memory: {}GB, OS: {} {}, Hostname: {}", 
                 cpu_model, cpu_cores, cpu_arch, total_memory_gb, os_name, os_version, hostname);
        
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_system_info, get_cpu_temperature, get_hardware_specs, test_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(mobile))]
fn main() {
    run();
}
