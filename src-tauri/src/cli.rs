// CLI version for Orange Pi - no GUI dependencies
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
    cpu_temperature: Option<f32>,
    load_average: Option<(f32, f32, f32)>,
}

static SYSTEM: Mutex<Option<System>> = Mutex::new(None);

async fn get_system_info() -> Result<SystemInfo, String> {
    let sys_stat = SystemStat::new();
    
    // Get CPU temperature (should work great on Orange Pi!)
    let cpu_temperature = match sys_stat.cpu_temp() {
        Ok(temp) => {
            println!("✅ CPU Temperature: {}°C", temp);
            Some(temp)
        }
        Err(_) => {
            println!("❌ Could not read CPU temperature");
            None
        }
    };
    
    // Get load average
    let load_average = match sys_stat.load_average() {
        Ok(load) => Some((load.one, load.five, load.fifteen)),
        Err(_) => None,
    };
    
    // Get basic system info
    let mut sys_guard = SYSTEM.lock().map_err(|e| e.to_string())?;
    
    if sys_guard.is_none() {
        *sys_guard = Some(System::new_all());
    }
    
    let (cpu_usage, memory_usage, total_memory, used_memory) = if let Some(ref mut sys) = *sys_guard {
        sys.refresh_cpu();
        sys.refresh_memory();
        
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        sys.refresh_cpu();
        
        let cpus = sys.cpus();
        let cpu_usage = if !cpus.is_empty() {
            cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32
        } else {
            0.0
        };
        
        let total_memory = sys.total_memory();
        let used_memory = sys.used_memory();
        let memory_usage = if total_memory > 0 {
            (used_memory as f32 / total_memory as f32) * 100.0
        } else {
            0.0
        };
        
        (cpu_usage, memory_usage, total_memory, used_memory)
    } else {
        return Err("Failed to initialize system".to_string());
    };
    
    let uptime = System::uptime();
    
    Ok(SystemInfo {
        cpu_usage,
        memory_usage,
        total_memory,
        used_memory,
        uptime,
        cpu_temperature,
        load_average,
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🖥️  Orange Pi Hardware Monitor");
    println!("===============================");
    
    loop {
        match get_system_info().await {
            Ok(info) => {
                println!("\n📊 System Status:");
                println!("CPU Usage: {:.1}%", info.cpu_usage);
                println!("Memory: {:.1}% ({} MB / {} MB)", 
                    info.memory_usage,
                    info.used_memory / 1024 / 1024,
                    info.total_memory / 1024 / 1024
                );
                
                if let Some(temp) = info.cpu_temperature {
                    println!("🌡️  CPU Temperature: {:.1}°C", temp);
                }
                
                if let Some((load1, load5, load15)) = info.load_average {
                    println!("📈 Load Average: {:.2} {:.2} {:.2}", load1, load5, load15);
                }
                
                println!("⏱️  Uptime: {}s", info.uptime);
                println!("===============================");
            }
            Err(e) => {
                eprintln!("❌ Error: {}", e);
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
}
