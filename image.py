from PIL import Image
from pillow_heif import register_heif_opener
register_heif_opener()
import os, json, glob, cv2
import numpy as np

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'}
VIDEO_EXTS = {'.mov', '.mp4', '.webm', '.avi', '.mkv'}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS

def get_dominant_color(path, resize=100):
    ext = path.lower().split('.')[-1]
    if ext in {'mp4', 'mov', 'webm', 'avi', 'mkv'}:
        cap = cv2.VideoCapture(path)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return None
        img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    else:
        img = Image.open(path).convert('RGB')    

    img.thumbnail((resize, resize))  # speed up processing
    pixels = list(img.getdata())
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)
    return '#{:02X}{:02X}{:02X}'.format(r, g, b)

def find_json(file_path):
    dirname = os.path.dirname(file_path)
    basename = os.path.splitext(os.path.basename(file_path))[0]
    pattern = os.path.join(dirname, "*.json")
    for json_file in glob.glob(pattern):
        json_name = os.path.splitext(os.path.basename(json_file))[0]
        if basename in json_name: 
            return json_file
    return None

def data_json(json_path):
    with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    if "googlePhotosOrigin" in data:
        timestamp = int(data.get("photoTakenTime", {}).get("timestamp") or 0)
        geo = data.get("geoData", {})
        lat = geo.get("latitude")
        lon = geo.get("longitude")

        if lat not in (None, 0.0) or lon not in (None, 0.0):
            location = f"{lat},{lon}"
        else:
            location = None

        device = data.get("googlePhotosOrigin", {}).get("mobileUpload", {}).get("deviceType")
        name = data.get("title")
        app = data.get("appSource", {}).get("androidPackageName")
    else:
        timestamp = None
        location = None
        device = None
        name = None
        app = None

    return timestamp, location, device, name, app

def data_direct(file_path):
    timestamp = None
    location = None
    device = None
    name = os.path.basename(file_path)
    app = None

    try:

        if ext in ['.mp4', '.mov', '.m4v']:
            # Video Logic
            import cv2
            cap = cv2.VideoCapture(file_path)
            # [Inference] Most video metadata (GPS/Device) is stripped or hidden 
            # unless using specialized parsers. You can get name/timestamp here:
            timestamp = int(os.path.getmtime(file_path)) 
            cap.release()
        else:

            img = Image.open(file_path)
            exif_data = img._getexif()  # returns a dictionary of EXIF tags
            if exif_data:
                exif = {
                    ExifTags.TAGS.get(tag, tag): value
                    for tag, value in exif_data.items()
                }
    
                # Get date/time
                date_str = exif.get("DateTimeOriginal") or exif.get("DateTime")
                if date_str:
                    # Convert "YYYY:MM:DD HH:MM:SS" → timestamp
                    timestamp = int(time.mktime(time.strptime(date_str, "%Y:%m:%d %H:%M:%S")))
    
                # Get device info
                device = exif.get("Make", "") + " " + exif.get("Model", "")
    
                # Get GPS info
                gps = exif.get("GPSInfo")
                if gps:
                    def _convert(coord, ref):
                        d, m, s = coord
                        val = float(d) + float(m)/60 + float(s)/3600
                        if ref in ("S", "W"):
                            val = -val
                        return val
                
                    lat = _convert(gps[2], gps[1])
                    lon = _convert(gps[4], gps[3])
    
                    location = f"{lat},{lon}" if lat != 0.0 or lon != 0.0 else None
        
    except Exception as e:
        pass  # if file has no EXIF or is not an image

    return timestamp, location, device, name, app

def get_data(path):
    color = get_dominant_color(path)
    json_path = find_json(path)

    if json_path is not None:
        timestamp, location, device, name, app = data_json(json_path)
    else:
        timestamp, location, device, name, app = data_direct(path) 

    ext = os.path.splitext(path.lower())[1]
    if ext in VIDEO_EXTS:
        media_type = "VIDEO"
    else:
        media_type = "PHOTO"

    data = {"path": path, "json_path": json_path, "media_type": media_type, "timestamp": timestamp, "location": location, "device": device, "name": name, "app": app, "color": color}

    return data
