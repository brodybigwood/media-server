import os
import json
from connection import get_connection
from image import get_data, MEDIA_EXTS
from concurrent.futures import ThreadPoolExecutor

def insert_media(data, cursor):
   cursor.execute(
        """
        INSERT OR IGNORE INTO media
        (filepath, jsonpath, media_type, timestamp, location, device, name, app, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (data["path"], data["json_path"], data["media_type"], data["timestamp"], data["location"], data["device"], data["name"], data["app"], data["color"])
    )


file_list = []

def scan_folder(folder_path):
    global file_list
    for root, _, files in os.walk(folder_path):
        for f in files:
            path = os.path.join(root, f)
            if os.path.splitext(f.lower())[1] in MEDIA_EXTS:
                file_list.append(path)

def add_folder(folder_path):
    conn = get_connection()
    cursor = conn.cursor()
    scan_folder(folder_path)

    global file_list
    print(len(file_list)) 

    max_threads = os.cpu_count() or 1
    print(max_threads)
    with ThreadPoolExecutor(max_workers=max_threads) as executor:
        data_list = list(executor.map(get_data, file_list))

    for data in data_list:
        if data:
            insert_media(data, cursor)

    conn.commit()

add_folder("files")
