import sqlite3
import os
from pathlib import Path
from PIL import Image, ImageOps
import ffmpeg
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "media.db"
THUMB_DIR = BASE_DIR / "server" / "thumbnail" / "512"
THUMB_DIR.mkdir(parents=True, exist_ok=True)

def create_thumbnail(media):
    media_id, filepath, media_type = media
    thumb_path = THUMB_DIR / f"{media_id}.jpg"
    if thumb_path.exists():
        return f"Skipped {media_id}"

    file_path = BASE_DIR / filepath
    if not file_path.exists():
        return f"Missing: {file_path}"

    try:
        # Image branch
        if media_type.upper() == "PHOTO":
            try:
                # Try standard Pillow first for JPEG/PNG
                img = Image.open(file_path)
                img = ImageOps.exif_transpose(img)
            except Exception:
                # Fallback: use FFmpeg to read any image (HEIC, HEIF, corrupted JPEGs)
                temp_frame = thumb_path.parent / f"{thumb_path.stem}_temp.jpg"
                try:
                    (
                        ffmpeg
                        .input(str(file_path))
                        .output(str(temp_frame), vframes=1)
                        .run(quiet=True, overwrite_output=True)
                    )
                    img = Image.open(temp_frame)
                except Exception as e:
                    return f"Failed to process image {media_id} via FFmpeg: {e}"
                finally:
                    if temp_frame.exists():
                        temp_frame.unlink()

            img = ImageOps.fit(img, (512, 512), method=Image.LANCZOS, centering=(0.5, 0.5))
            img.convert("RGB").save(thumb_path, "JPEG")
            return f"Photo thumbnail created: {media_id}"

        # Video branch
        elif media_type.upper() == "VIDEO":
            try:
                temp_frame = thumb_path.parent / f"{thumb_path.stem}_temp.png"
                (
                    ffmpeg
                    .input(str(file_path), ss=0)
                    .filter('scale', 512, -1)
                    .output(str(temp_frame), vframes=1)
                    .run(quiet=True, overwrite_output=True)
                )
                with Image.open(temp_frame) as img:
                    img = ImageOps.fit(img, (512, 512), method=Image.LANCZOS, centering=(0.5, 0.5))
                    
                    img.convert("RGBA")                    
                    icon_path = BASE_DIR / "assets" / "video_icon.png"
                    if icon_path.exists():
                        icon = Image.open(icon_path).convert("RGBA")
                        icon.thumbnail((128, 128), Image.LANCZOS)
                        img.paste(icon, (img.width - icon.width - 5, img.height - icon.height - 5), icon)

                    img.convert("RGB").save(thumb_path, "JPEG")
                temp_frame.unlink()
                return f"Video thumbnail created: {media_id}"
            except Exception as e:
                return f"Failed video thumbnail {media_id}: {e}"

        return f"Unknown media type: {media_id}"

    except Exception as e:
        return f"Failed {media_id}: {e}"


# Connect to DB and fetch all media
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT id, filepath, media_type FROM media")
media_list = cursor.fetchall()
conn.close()

# Parallel processing
max_workers = os.cpu_count() or 1
with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = [executor.submit(create_thumbnail, media) for media in media_list]
    for future in as_completed(futures):
        print(future.result())

