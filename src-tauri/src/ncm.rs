use anyhow::{anyhow, Context, Result};
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyInit};
use byteorder::{LittleEndian, ReadBytesExt};
use std::fs::{self, File};
use std::io::{Read, Write, Cursor};
use std::path::Path;
use std::process::Command;

type Aes128EcbDec = ecb::Decryptor<aes::Aes128>;

// Core Keys for NCM Decryption
const CORE_KEY: &[u8] = b"\x68\x7A\x48\x52\x41\x6D\x73\x6F\x35\x6B\x49\x6E\x62\x61\x78\x57";
const MODIFY_KEY: &[u8] = b"\x23\x31\x34\x6C\x6A\x6B\x5F\x21\x5C\x5D\x26\x30\x55\x3C\x27\x28";

pub fn process_ncm(file_path: &str) -> Result<()> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(anyhow!("File not found"));
    }

    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    let mut reader = Cursor::new(&buffer);

    // 1. Validate Header
    let mut magic = [0u8; 8];
    reader.read_exact(&mut magic)?;
    let magic_u64 = u64::from_le_bytes(magic);
    if magic_u64 != 0x4d4144464e455443 { // "CTENFDAM"
        return Err(anyhow!("Invalid NCM file format"));
    }

    // Skip 2 bytes gap
    reader.set_position(reader.position() + 2);

    // 2. Read Key
    let key_len = reader.read_u32::<LittleEndian>()?;
    let mut key_data = vec![0u8; key_len as usize];
    reader.read_exact(&mut key_data)?;
    
    // Decrypt Key with CORE_KEY
    for i in 0..key_len as usize {
        key_data[i] ^= 0x64;
    }
    
    let decrypted_key = decrypt_aes(&key_data, CORE_KEY)?;
    // Remove "neteasecloudmusic" prefix (17 chars)
    let rc4_key_data = &decrypted_key[17..]; 
    let s_box = build_sbox(rc4_key_data);

    // 3. Read Metadata (Skip for now, we just want audio)
    let meta_len = reader.read_u32::<LittleEndian>()?;
    if meta_len > 0 {
        reader.set_position(reader.position() + meta_len as u64);
    }

    // 4. Skip CRC (4 bytes) & Gap (5 bytes)
    reader.set_position(reader.position() + 9);

    // 5. Skip Image
    let img_len = reader.read_u32::<LittleEndian>()?;
    if img_len > 0 {
        reader.set_position(reader.position() + img_len as u64);
    }

    // 6. Decrypt Audio Data
    let audio_start = reader.position() as usize;
    let mut audio_data = buffer[audio_start..].to_vec();

    // Apply RC4 (Custom NCM variant)
    let mut s_box_clone = s_box.clone();
    // Re-implementation of RC4 pseudo-random generation stage for NCM
    // Note: Standard RC4 PRGA is slightly different, NCM uses a specific S-box mapping
    // But actually, the key generation above prepares the S-Box. 
    // The application logic:
    for (i, byte) in audio_data.iter_mut().enumerate() {
        let j = (i + 1) & 0xff;
        *byte ^= s_box_clone[s_box_clone[j] as usize]; // Simplified NCM XOR logic
    }

    // 7. Determine Format (MP3 or FLAC)
    // Check magic bytes of decrypted data
    let is_flac = audio_data.len() > 4 && &audio_data[0..4] == b"fLaC";
    
    // Temporary file path
    let temp_ext = if is_flac { "flac" } else { "mp3" };
    let temp_path = path.with_extension(format!("temp.{}", temp_ext));
    
    fs::write(&temp_path, &audio_data)?;

    // 8. Convert to FLAC if requested and not already FLAC
    // The user requested "Convert to FLAC". 
    // If it's already FLAC, just rename. If MP3, use ffmpeg.
    
    let final_path = path.with_extension("flac");

    if is_flac {
        fs::rename(&temp_path, &final_path)?;
    } else {
        // Call FFmpeg to convert MP3 (or other) to FLAC
        let status = Command::new("ffmpeg")
            .args(&["-y", "-i", temp_path.to_str().unwrap(), final_path.to_str().unwrap()])
            .output();

        // Clean up temp file
        let _ = fs::remove_file(&temp_path);

        match status {
            Ok(output) => {
                if !output.status.success() {
                    return Err(anyhow!("FFmpeg conversion failed: {:?}", String::from_utf8_lossy(&output.stderr)));
                }
            },
            Err(_) => return Err(anyhow!("FFmpeg not found. Please install FFmpeg and add to PATH.")),
        }
    }

    Ok(())
}

fn decrypt_aes(data: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    // NCM uses AES-128-ECB with PKCS7 padding
    let dec: Aes128EcbDec = Aes128EcbDec::new_from_slice(key).context("Invalid key length")?;
    let mut buffer = data.to_vec();
    let decrypted = dec.decrypt_padded_mut::<Pkcs7>(&mut buffer)
        .map_err(|e| anyhow!("AES decryption failed: {:?}", e))?;
    Ok(decrypted.to_vec())
}

fn build_sbox(key: &[u8]) -> [u8; 256] {
    let mut sbox = [0u8; 256];
    for i in 0..256 {
        sbox[i] = i as u8;
    }

    // NCM Specific S-Box scrambling
    let mut j: u8 = 0;
    for i in 0..256 {
        j = j.wrapping_add(sbox[i]).wrapping_add(key[i % key.len()]);
        sbox.swap(i, j as usize);
    }
    
    // NCM specific post-processing for the generation box
    let mut final_sbox = [0u8; 256];
    for i in 0..256 {
        let original = sbox[i];
        let j = sbox[(i + original as usize) & 0xff].wrapping_add(original);
        final_sbox[i] = sbox[j as usize];
    }
    
    final_sbox
}
