import os
import io
import json
import base64
import threading
import copy
import tempfile
from datetime import datetime
from dotenv import load_dotenv

try:
    import firebase_admin
    from firebase_admin import credentials, db, storage
except ImportError:
    firebase_admin = None

try:
    from PIL import Image
except ImportError:
    Image = None

load_dotenv()

_firebase_initialized = False
_firebase_attempted = False
_db = None
_bucket = None
_bucket_exists = None

_lock = threading.Lock()

_LOCAL_FILE = os.environ.get("LOCAL_MEMORIES_JSON",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "memories_local.json"))

MAX_DB_EMBED_BYTES = 300 * 1024


def _read_local():
    try:
        if not os.path.exists(_LOCAL_FILE):
            return {}
        with open(_LOCAL_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
        return {}
    except Exception:
        return {}


def _write_local(obj):
    try:
        os.makedirs(os.path.dirname(_LOCAL_FILE), exist_ok=True)
        tmp = _LOCAL_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        if os.name == "nt":
            try:
                os.replace(tmp, _LOCAL_FILE)
            except Exception:
                import shutil
                shutil.move(tmp, _LOCAL_FILE)
        else:
            os.replace(tmp, _LOCAL_FILE)
    except Exception as e:
        print(f"Local storage write error: {e}")


def initialize_firebase():
    global _firebase_initialized, _db, _bucket, _bucket_exists, _firebase_attempted

    if _firebase_attempted:
        return _firebase_initialized
    _firebase_attempted = True

    if firebase_admin is None:
        print("INFO: firebase-admin not installed; using local JSON storage only")
        _firebase_initialized = False
        return False

    res_box = {"ok": False}
    def _do_init():
        global _firebase_initialized, _db, _bucket, _bucket_exists
        try:
            sdk_path = os.getenv("FIREBASE_ADMIN_SDK_PATH", "")
            db_url = os.getenv("FIREBASE_DATABASE_URL", "")
            storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "")

            cred = None
            if sdk_path and os.path.exists(sdk_path):
                cred = credentials.Certificate(sdk_path)
            else:
                cred_json = os.getenv("FIREBASE_ADMIN_SDK_JSON", "")
                if cred_json:
                    try:
                        cred_dict = json.loads(base64.b64decode(cred_json).decode("utf-8"))
                        cred = credentials.Certificate(cred_dict)
                    except Exception:
                        try:
                            cred_dict = json.loads(cred_json)
                            cred = credentials.Certificate(cred_dict)
                        except Exception:
                            cred = None

            if cred is None:
                print("No Firebase credentials found; using local JSON only")
                _firebase_initialized = False
                res_box["ok"] = False
                return

            options = {}
            if db_url:
                options["databaseURL"] = db_url
            if storage_bucket:
                options["storageBucket"] = storage_bucket

            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred, options)
            else:
                firebase_admin.get_app()

            if db_url:
                try:
                    _db = db.reference()
                except Exception as e:
                    print(f"WARNING: Could not create RTDB reference: {e}")

            use_storage = os.getenv("USE_FIREBASE_STORAGE", "0").strip().lower() in ("1","true","yes","on")
            if storage_bucket and use_storage:
                try:
                    _bucket = storage.bucket()
                except Exception as e:
                    print(f"Storage bucket disabled: {e}")
                    _bucket = None
            else:
                _bucket = None

            _firebase_initialized = True
            res_box["ok"] = True
            print("Firebase initialized (syncing with local JSON backup).")
        except Exception as e:
            print(f"Firebase init failed: {e}")
            _firebase_initialized = False
            res_box["ok"] = False

    t = threading.Thread(target=_do_init, daemon=True)
    t.start()
    t.join(timeout=8)
    if not res_box["ok"]:
        _firebase_initialized = False
        print("INFO: Firebase init skipped/incomplete; using local JSON storage only.")
    return _firebase_initialized


def is_firebase_ready():
    return _firebase_initialized


def _compress_jpeg(photo_bytes, max_dim=1600, quality=82):
    if Image is None:
        return photo_bytes
    try:
        img = Image.open(io.BytesIO(photo_bytes))
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_dim:
            ratio = max_dim / float(max(w, h))
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception as e:
        return photo_bytes


def _extract_b64(photo_data):
    if "," in photo_data:
        return photo_data.split(",", 1)[1]
    return photo_data


def _valid_data_url(b64_part):
    return f"data:image/jpeg;base64,{b64_part}"


def _sanitize_mem(mem):
    out = {
        "id": str(mem.get("id", "")),
        "name": str(mem.get("name", "Anonymous"))[:80],
        "comment": str(mem.get("comment", ""))[:600],
        "timestamp": str(mem.get("timestamp", "")),
        "photo_url": str(mem.get("photo_url", "")),
    }
    return out


def save_memory(photo_data, name, comment):
    memory_id = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    timestamp = datetime.utcnow().isoformat() + "Z"

    b64_part = _extract_b64(photo_data or "")
    try:
        photo_bytes = base64.b64decode(b64_part)
    except Exception:
        return {"id": memory_id, "error": "Invalid photo data", "photo_url": None,
                "name": name, "comment": comment, "timestamp": timestamp}

    photo_bytes = _compress_jpeg(photo_bytes)
    b64_compressed = base64.b64encode(photo_bytes).decode("ascii")

    if len(photo_bytes) > MAX_DB_EMBED_BYTES and Image is not None:
        try:
            img = Image.open(io.BytesIO(photo_bytes))
            img = img.convert("RGB")
            w, h = img.size
            target_b64_len = int(MAX_DB_EMBED_BYTES / 4 * 3)
            ratio = min(1.0, (target_b64_len / max(1, len(b64_compressed))) ** 0.5)
            if ratio < 0.97:
                new_w = max(160, int(w * ratio))
                new_h = max(200, int(h * ratio))
                img = img.resize((new_w, new_h), Image.LANCZOS)
                buf2 = io.BytesIO()
                img.save(buf2, format="JPEG", quality=70, optimize=True)
                photo_bytes = buf2.getvalue()
                b64_compressed = base64.b64encode(photo_bytes).decode("ascii")
        except Exception:
            pass

    photo_url = _valid_data_url(b64_compressed)
    if _firebase_initialized and _bucket is not None:
        try:
            file_name = f"memories/{memory_id}.jpg"
            blob = _bucket.blob(file_name)
            blob.upload_from_string(photo_bytes, content_type="image/jpeg", timeout=12, retry=None)
            blob.make_public()
            if blob.public_url:
                photo_url = blob.public_url
        except Exception:
            pass

    payload = {
        "id": memory_id,
        "name": name or "Anonymous",
        "comment": comment or "",
        "timestamp": timestamp,
        "photo_url": photo_url,
    }
    payload_clean = _sanitize_mem(payload)

    fb_ok = False
    if _firebase_initialized and _db is not None:
        def _worker():
            try:
                _db.child("memories").child(memory_id).set({
                    "name": payload_clean["name"],
                    "comment": payload_clean["comment"],
                    "timestamp": payload_clean["timestamp"],
                    "photo_url": payload_clean["photo_url"],
                })
                return True
            except Exception:
                return False
        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        t.join(timeout=5)
        fb_ok = not t.is_alive()

    with _lock:
        store = _read_local()
        store[memory_id] = copy.deepcopy(payload_clean)
        _write_local(store)

    return payload_clean


def get_all_memories():
    memories = []

    local_store = {}
    with _lock:
        local_store = _read_local()

    if local_store:
        for mid, data in local_store.items():
            if not isinstance(data, dict):
                continue
            pu = data.get("photo_url", "") or ""
            if isinstance(pu, str) and pu and not pu.startswith(("http","data:")):
                pu = _valid_data_url(pu)
            memories.append({
                "id": str(mid),
                "name": str(data.get("name", "Anonymous")),
                "comment": str(data.get("comment", "")),
                "timestamp": str(data.get("timestamp", "")),
                "photo_url": pu,
            })

    if _firebase_initialized and _db is not None:
        def _worker():
            try:
                return _db.child("memories").get()
            except Exception:
                return None
        t = threading.Thread(target=lambda w: w.append(_worker() if False else None), args=([],))
        try:
            snap_box = [None]
            def _run():
                try:
                    snap_box[0] = _db.child("memories").get()
                except Exception:
                    snap_box[0] = None
            t = threading.Thread(target=_run, daemon=True)
            t.start()
            t.join(timeout=6)
            snapshot = snap_box[0] if not t.is_alive() else None
        except Exception:
            snapshot = None

        if snapshot:
            fb_items = []
            if isinstance(snapshot, dict):
                for mid, d in snapshot.items():
                    if isinstance(d, dict):
                        fb_items.append((str(mid), d))
            else:
                try:
                    for it in snapshot:
                        try:
                            fb_items.append((str(it.key), dict(it.val())))
                        except Exception:
                            pass
                except Exception:
                    pass

            seen = {m["id"] for m in memories}
            for mid, d in fb_items:
                if not isinstance(d, dict) or mid in seen:
                    continue
                pu = d.get("photo_url", "") or ""
                if isinstance(pu, str) and pu and not pu.startswith(("http","data:")):
                    pu = _valid_data_url(pu)
                memories.append({
                    "id": mid,
                    "name": str(d.get("name", "Anonymous")),
                    "comment": str(d.get("comment", "")),
                    "timestamp": str(d.get("timestamp", "")),
                    "photo_url": pu,
                })
                seen.add(mid)
                with _lock:
                    ls = _read_local()
                    if mid not in ls:
                        ls[mid] = {
                            "id": mid,
                            "name": str(d.get("name", "Anonymous")),
                            "comment": str(d.get("comment", "")),
                            "timestamp": str(d.get("timestamp", "")),
                            "photo_url": pu,
                        }
                        _write_local(ls)

    try:
        memories.sort(key=lambda m: (m.get("timestamp","") or "", m.get("id","")), reverse=True)
    except Exception:
        pass

    return memories


def delete_memory(memory_id):
    memory_id = str(memory_id).strip()
    if not memory_id:
        return {"success": False, "error": "Invalid memory ID"}

    deleted_local = False
    deleted_fb = False
    deleted_storage = False

    with _lock:
        store = _read_local()
        if memory_id in store:
            del store[memory_id]
            _write_local(store)
            deleted_local = True

    if _firebase_initialized and _db is not None:
        try:
            _db.child("memories").child(memory_id).delete()
            deleted_fb = True
        except Exception:
            pass

    if _firebase_initialized and _bucket is not None:
        try:
            file_name = f"memories/{memory_id}.jpg"
            blob = _bucket.blob(file_name)
            if blob.exists():
                blob.delete()
                deleted_storage = True
        except Exception:
            pass

    return {
        "success": deleted_local or deleted_fb,
        "deleted_local": deleted_local,
        "deleted_fb": deleted_fb,
        "deleted_storage": deleted_storage,
    }
